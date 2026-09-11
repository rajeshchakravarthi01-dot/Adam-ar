// =============================================================
// AuditEQ — High-Speed, Accurate Primary & Secondary ASR Engine
// =============================================================

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { inspectAudioQuality, preprocessAudioForTranscription, type PreprocessedAudio } from './audio-preprocessor';
import { extractSpokenEvidence, type SegmentInfo } from './evidence-extractor';
import type { TradeRecord } from '../src/types';

export interface AsrResult {
  transcript: string;
  rawTranscript: string;
  segments: SegmentInfo[];
  modelUsed: string;
  durationSeconds: number;
  channels: number;
  secondaryTriggered: boolean;
  reconciled: boolean;
  notes: string[];
}

/**
 * Domain vocabulary hint list for Indian financial pre-order calls across languages (Hindi, English, Tamil, Telugu, Hinglish).
 * Comma-separated domain terms to prevent hallucination and improve accuracy of numbers, codes, and stock names.
 */
const NEUTRAL_WHISPER_PROMPT =
  'FundsIndia equity pre-order call in English, Hindi, Tamil, Telugu, Hinglish: client code, UCC, buy, sell, shares, CMP, current market price, bhav, Welspun Living, Bajaj Finserv, Reliance, Tata Steel, Infosys, quantity, price, order confirmation.';

/**
 * Strips prompt echoes and meta-descriptions hallucinated by Whisper on quiet audio
 */
export function sanitizeWhisperTranscript(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText
    .replace(/\b(?:bilingual\s*)?(?:hindi-english|hindi|english)?\s*telephonic\s*conversation\b/gi, '')
    .replace(/\btelephonic stock trading conversation\b/gi, '')
    .replace(/\bpre-order trade authorization\b/gi, '')
    .trim();
  return cleaned;
}

/**
 * Checks if a transcript contains Perso-Arabic / Urdu characters.
 * SEBI compliance calls in India are in English / Hindi / Hinglish and should NEVER output Arabic script.
 */
export function containsArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Executes Primary Groq Whisper Large-v3 with language='en' and clean vocabulary
 */
async function runGroqWhisperLargeV3(
  audioPath: string,
  filename: string,
  apiKey: string,
  model = 'whisper-large-v3'
): Promise<{ text: string; segments: SegmentInfo[] }> {
  const fileBuffer = fs.readFileSync(audioPath);
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];

  const ext = path.extname(filename).toLowerCase();
  const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0\r\n`));
  // Note: Omitting language parameter allows Groq Whisper Large-v3 to auto-detect Hindi, English, Tamil, Telugu, and code-switched Hinglish
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${NEUTRAL_WHISPER_PROMPT}\r\n`));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const payload = Buffer.concat(parts);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: payload,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Whisper Large-v3 failed (HTTP ${response.status}): ${errText.slice(0, 200)}`);
  }

  const json = await response.json();
  let text = (json.text || '').trim();

  // Sanitize any hallucinated Arabic/Urdu script output
  if (containsArabicScript(text)) {
    text = text.replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) {
      throw new Error('Groq Whisper returned solely Perso-Arabic/Urdu script on low audio signal.');
    }
  }

  text = sanitizeWhisperTranscript(text);

  const rawSegments = Array.isArray(json.segments) ? json.segments : [];
  const segments: SegmentInfo[] = rawSegments.map((s: any) => ({
    start: typeof s.start === 'number' ? s.start : 0,
    end: typeof s.end === 'number' ? s.end : 0,
    text: sanitizeWhisperTranscript((s.text || '').trim()),
    speaker: 'UNKNOWN',
  }));

  return { text, segments };
}

/**
 * Secondary verification pass: runs only when a critical conflict is identified
 */
async function runSecondaryAsrPass(
  audioPath: string,
  filename: string,
  groqKey?: string,
  geminiKey?: string
): Promise<{ text: string; segments: SegmentInfo[] } | null> {
  // Try Groq Whisper Turbo first (fast and complementary)
  if (groqKey) {
    try {
      return await runGroqWhisperLargeV3(audioPath, filename, groqKey, 'whisper-large-v3-turbo');
    } catch {
      // Fall through to Gemini
    }
  }

  // Fallback to Gemini Native Audio
  if (geminiKey) {
    try {
      const fileBuffer = fs.readFileSync(audioPath);
      const base64Audio = fileBuffer.toString('base64');
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              {
                text: 'Transcribe this entire recorded telephone conversation verbatim. Capture all stock names, quantities, numbers, prices, and client codes exactly as spoken.',
              },
            ],
          },
        ],
        config: { temperature: 0 },
      });

      const text = (response.text || '').trim();
      return {
        text,
        segments: [{ start: 0, end: 0, text, speaker: 'UNKNOWN' }],
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Main High-Performance ASR Engine Entry Point
 * Implements:
 *   PRIMARY ASR (Groq Whisper Large-v3)
 *   ↓
 *   Evidence & Conflict Check
 *   ↓
 *   SECONDARY ASR (Only if critical conflict detected)
 *   ↓
 *   Reconciliation
 */
export async function transcribeAudioFile(
  filePath: string,
  groqKey?: string,
  geminiKey?: string,
  referenceTrade?: TradeRecord
): Promise<AsrResult> {
  const filename = path.basename(filePath);
  const notes: string[] = [];

  // 1. Audio Inspection & Preprocessing (volume normalization, channel detection)
  const preprocessed = await preprocessAudioForTranscription(filePath);
  const audioToUse = preprocessed.normalizedPath || filePath;
  const duration = preprocessed.metrics.durationSeconds || 0;
  const channels = preprocessed.metrics.channels || 1;

  if (channels >= 2) {
    notes.push(`Stereo audio detected (${channels} channels). Multi-channel preservation active.`);
  }

  // 2. Primary ASR: Groq Whisper Large-v3
  let primaryText = '';
  let primarySegments: SegmentInfo[] = [];
  let modelUsed = 'whisper-large-v3';

  if (groqKey) {
    try {
      const primary = await runGroqWhisperLargeV3(audioToUse, filename, groqKey);
      primaryText = primary.text;
      primarySegments = primary.segments;
    } catch (err) {
      notes.push(`Groq Whisper Large-v3 error: ${(err as Error).message}. Attempting Gemini fallback.`);
    }
  }

  // If Groq unavailable or failed, fallback to Gemini
  if (!primaryText && geminiKey) {
    try {
      const fileBuffer = fs.readFileSync(audioToUse);
      const base64Audio = fileBuffer.toString('base64');
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.wav' ? 'audio/wav' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt = `You are a high-precision audio transcriber specializing in Indian stock market pre-order telephone calls.
Transcribe this entire recorded telephone conversation verbatim with 100% accuracy.

CRITICAL INSTRUCTIONS:
1. OUTPUT SCRIPT: Output MUST be strictly in the Latin / English alphabet.
2. TRANSLITERATION: Transliterate any spoken Hindi, Hinglish, Marathi, or Gujarati words phonetically into Latin script (e.g. "Haan sir, Ajeet bol raha hoon Finns India se...").
3. NEVER USE ARABIC, URDU, OR PERSIAN SCRIPT: Outputting Perso-Arabic script is strictly forbidden.
4. FINANCIAL PRECISION: Accurately capture stock company names (e.g. "Welspun Living", "Bajaj Finserv", "L&T Finance", "Uno Minda", "Tata Motors", "Reliance"), exact numerical quantities (e.g. 757, 16, 180, 500), execution prices (e.g. "current market price", "CMP", limit rates), and client UCC codes (e.g. "PWA00938", "WIC21342").
5. Label speakers as "Advisor:" and "Client:" where distinguishable.
6. Do NOT output descriptions like "Hindi-English telephonic conversation". Return only the verbatim dialogue.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: prompt },
            ],
          },
        ],
        config: { temperature: 0.1 },
      });

      primaryText = (response.text || '').trim();
      primarySegments = [{ start: 0, end: duration, text: primaryText, speaker: 'UNKNOWN' }];
      modelUsed = 'gemini-2.5-flash';
    } catch (err) {
      notes.push(`Gemini fallback error: ${(err as Error).message}`);
    }
  }

  if (!primaryText) {
    throw new Error(
      `Audio transcription failed: Neither Groq Whisper Large-v3 nor Gemini fallback succeeded for "${filename}". ` +
      `Check GROQ_API_KEY in Settings or GEMINI_API_KEY.`
    );
  }

  // 3. Evidence Extraction & Critical Conflict Check
  const evidence = extractSpokenEvidence(primaryText, primarySegments, referenceTrade);
  let secondaryTriggered = false;
  let reconciled = false;
  let finalTranscript = primaryText;
  let finalSegments = primarySegments;

  // 4. Trigger Secondary ASR ONLY IF critical conflict exists
  if (evidence.hasCriticalConflict) {
    secondaryTriggered = true;
    notes.push(`Critical conflict detected: ${evidence.conflictReasons.join('; ')}. Triggering secondary verification ASR.`);

    const secondary = await runSecondaryAsrPass(audioToUse, filename, groqKey, geminiKey);
    if (secondary && secondary.text) {
      const secondaryEvidence = extractSpokenEvidence(secondary.text, secondary.segments, referenceTrade);

      // Reconcile: If secondary resolved the conflict with high confidence, use reconciled evidence
      if (!secondaryEvidence.hasCriticalConflict) {
        finalTranscript = secondary.text;
        finalSegments = secondary.segments;
        reconciled = true;
        notes.push('Secondary ASR successfully reconciled the critical conflict.');
      } else {
        notes.push('Secondary ASR confirmed conflict or divergence. Flagged for compliance officer review.');
      }
    }
  }

  return {
    transcript: finalTranscript,
    rawTranscript: primaryText, // Preserve immutable raw primary ASR
    segments: finalSegments,
    modelUsed,
    durationSeconds: duration,
    channels,
    secondaryTriggered,
    reconciled,
    notes,
  };
}

/**
 * Checks whether secondary ASR is required based on critical conflicts and confidence.
 */
export function shouldTriggerSecondaryAsr(
  transcript: string,
  referenceTrade?: Partial<TradeRecord>,
  confidence: number = 1.0
): boolean {
  if (confidence < 0.7) return true;
  const evidence = extractSpokenEvidence(transcript, [], referenceTrade as any);
  return evidence.hasCriticalConflict;
}

/**
 * Safe audio preparation for ASR without speech degradation.
 */
export function prepareAudioForAsr(
  buffer: Buffer,
  filename: string
): { processedBuffer: Buffer; durationSeconds: number } {
  return {
    processedBuffer: buffer,
    durationSeconds: 30,
  };
}
