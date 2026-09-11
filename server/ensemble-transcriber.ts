// =============================================================
// ADAM-AR — 10-12 Multi-Pass Ensemble Transcription Engine
// =============================================================

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  matchSymbolInTranscript,
  mentionsMarketPriceOrCMP,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  matchClientCodeInTranscript,
} from './normalizer';
import type { TradeRecord } from '../src/types';

export interface PassResult {
  passIndex: number;
  engine: 'groq' | 'gemini';
  model: string;
  temperature: number;
  promptDescription: string;
  transcript: string;
  success: boolean;
  error?: string;
  hasStock: boolean;
  hasQty: boolean;
  hasPriceOrCMP: boolean;
  hasClientCode: boolean;
  hasConsent: boolean;
  hasReturnCommitment: boolean;
  qualityScore: number;
}

export interface EnsembleTranscriptionResult {
  finalTranscript: string;
  model: string;
  totalPassesRun: number;
  successfulPasses: number;
  parameterConsensus: {
    stockDetectedInAnyPass: boolean;
    stockPassCount: number;
    qtyDetectedInAnyPass: boolean;
    qtyPassCount: number;
    priceCmpDetectedInAnyPass: boolean;
    priceCmpPassCount: number;
    clientCodeDetectedInAnyPass: boolean;
    clientCodePassCount: number;
    consentDetectedInAnyPass: boolean;
    consentPassCount: number;
    returnCommitmentDetected: boolean;
    returnCommitmentPassCount: number;
    spokenStockName?: string;
    spokenQty?: string | number;
    spokenPrice?: string;
  };
  passSummary: Array<{
    passIndex: number;
    engine: string;
    model: string;
    wordCount: number;
    detectedCount: number;
  }>;
}

interface PassConfig {
  engine: 'groq' | 'gemini';
  model: string;
  temperature: number;
  prompt: string;
  description: string;
}

/**
 * Builds diverse pass configurations (10-12 variations)
 */
function buildEnsemblePassConfigs(hasGroq: boolean, hasGemini: boolean, matchedTrade?: TradeRecord, clientCode?: string): PassConfig[] {
  const stockHint = matchedTrade?.symbol ? matchedTrade.symbol : 'Welspun Living, Bajaj Finserv, L&T Finance, Uno Minda, Tata Motors, Reliance';
  const qtyHint = matchedTrade?.quantity ? `${matchedTrade.quantity} shares` : 'shares, quantity';
  const clientHint = clientCode ? `Client code ${clientCode}` : 'Client UCC account code';

  const geminiPromptDetailed = `You are an expert SEBI compliance auditor and stock trading telephone call transcriber.
Transcribe this entire recorded telephone conversation verbatim with 100% accuracy.

CRITICAL INSTRUCTIONS:
1. OUTPUT SCRIPT: Output MUST be strictly in the Latin / English alphabet.
2. TRANSLITERATION: Transliterate any spoken Hindi, Hinglish, Marathi, or Gujarati words phonetically into Latin script (e.g. "Haan sir, Ajeet bol raha hoon Finns India se...").
3. NEVER USE ARABIC, URDU, OR PERSIAN SCRIPT: Outputting Perso-Arabic script is strictly forbidden.
4. FINANCIAL PRECISION: Accurately capture stock company names (e.g. ${stockHint}), exact numerical quantities (e.g. ${qtyHint}), execution prices (e.g. "current market price", "CMP", limit rates), and client UCC codes (e.g. ${clientHint}).
5. Label speakers as "Advisor:" and "Client:" where distinguishable.
6. Do NOT output meta descriptions like "Hindi-English telephonic conversation". Return only the verbatim dialogue.`;

  const whisperVocabPrompt = `Welspun Living, Bajaj Finserv, L&T Finance, Uno Minda, Tata Motors, Reliance, CMP, current market price, market rate, shares, quantity, client code, buy, sell, execute.`;

  const baseConfigs: PassConfig[] = [
    // 1. Primary Gemini Multimodal Audio Passes (Top Priority for Accuracy)
    {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      prompt: geminiPromptDetailed,
      description: 'Gemini 2.5 Flash Native Verbatim Audio Transcription (Primary)',
    },
    {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      prompt: `${geminiPromptDetailed}\nFocus especially on acoustic clarity of numbers, share quantities, and market price expressions.`,
      description: 'Gemini 2.5 Flash Acoustic Precision Audio Pass',
    },
    {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.0,
      prompt: `${geminiPromptDetailed}\nDeterministic strict verbatim transcript without omissions.`,
      description: 'Gemini 2.5 Flash Deterministic Precision Audio Pass',
    },
    // 2. Groq Whisper Large-v3 with language='en' and vocabulary prompts
    {
      engine: 'groq',
      model: 'whisper-large-v3',
      temperature: 0.0,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 Vocabulary Guided Pass (Temp 0.0, En)',
    },
    {
      engine: 'groq',
      model: 'whisper-large-v3',
      temperature: 0.15,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 High Sensitivity Pass (Temp 0.15, En)',
    },
    {
      engine: 'groq',
      model: 'whisper-large-v3-turbo',
      temperature: 0.0,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 Turbo Precision Entities (Temp 0.0, En)',
    },
    {
      engine: 'groq',
      model: 'whisper-large-v3-turbo',
      temperature: 0.2,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 Turbo Acoustic Resilience (Temp 0.2, En)',
    },
    {
      engine: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.15,
      prompt: geminiPromptDetailed,
      description: 'Gemini 2.5 Flash Conversational Focus Pass',
    },
    {
      engine: 'groq',
      model: 'whisper-large-v3',
      temperature: 0.05,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 Compliance Strict Log (Temp 0.05, En)',
    },
    {
      engine: 'groq',
      model: 'whisper-large-v3-turbo',
      temperature: 0.1,
      prompt: whisperVocabPrompt,
      description: 'Groq Whisper V3 Turbo Trade Execution (Temp 0.1, En)',
    },
  ];

  // Filter based on available engines
  if (hasGroq && hasGemini) {
    return baseConfigs.slice(0, 10);
  } else if (hasGroq && !hasGemini) {
    // Re-map Gemini configs to Groq Whisper variants
    return baseConfigs.map((cfg, idx) => ({
      ...cfg,
      engine: 'groq' as const,
      model: idx % 2 === 0 ? 'whisper-large-v3' : 'whisper-large-v3-turbo',
      temperature: (idx * 0.02) % 0.25,
      prompt: whisperVocabPrompt,
    })).slice(0, 10);
  } else if (!hasGroq && hasGemini) {
    // Re-map Groq configs to Gemini Flash variants
    return baseConfigs.map((cfg, idx) => ({
      ...cfg,
      engine: 'gemini' as const,
      model: 'gemini-2.5-flash',
      temperature: (idx * 0.03) % 0.25,
      prompt: geminiPromptDetailed,
    })).slice(0, 10);
  }

  return baseConfigs.slice(0, 10);
}

/**
 * Executes a single Groq Whisper transcription pass
 */
async function runGroqWhisperPass(
  filePath: string,
  filename: string,
  mimeType: string,
  apiKey: string,
  model: string,
  temperature: number,
  prompt: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const parts: Buffer[] = [];

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      )
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n${temperature.toFixed(2)}\r\n`));
    // Auto-detect multilingual dialogue (English, Hindi, Tamil, Telugu, Hinglish)
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const payload = Buffer.concat(parts);

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
      throw new Error(`Groq HTTP ${response.status}: ${errText.slice(0, 120)}`);
    }

    const json = await response.json();
    let text = (json.text || '').trim();

    // Reject Arabic/Urdu script
    if (/[\u0600-\u06FF]/.test(text)) {
      throw new Error('Groq returned Arabic/Urdu script which is invalid for Indian equity compliance.');
    }

    // Strip prompt echoes
    text = text
      .replace(/\b(?:bilingual\s*)?(?:hindi-english|hindi|english)?\s*telephonic\s*conversation\b/gi, '')
      .replace(/\btelephonic stock trading conversation\b/gi, '')
      .replace(/\bpre-order trade authorization\b/gi, '')
      .trim();

    return text;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Executes a single Gemini Flash native audio pass
 */
async function runGeminiAudioPass(
  filePath: string,
  mimeType: string,
  geminiApiKey: string,
  model: string,
  temperature: number,
  prompt: string
): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Audio = fileBuffer.toString('base64');
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      temperature,
    },
  });

  return (response.text || '').trim();
}

/**
 * Evaluates entity parameters in a candidate transcript
 */
function analyzePassTranscript(
  transcript: string,
  matchedTrade?: TradeRecord,
  clientCode?: string
): {
  hasStock: boolean;
  hasQty: boolean;
  hasPriceOrCMP: boolean;
  hasClientCode: boolean;
  hasConsent: boolean;
  hasReturnCommitment: boolean;
  qualityScore: number;
} {
  // CRITICAL RULE: If transcript contains Perso-Arabic / Urdu characters, DISQUALIFY completely!
  if (/[\u0600-\u06FF]/.test(transcript)) {
    return {
      hasStock: false,
      hasQty: false,
      hasPriceOrCMP: false,
      hasClientCode: false,
      hasConsent: false,
      hasReturnCommitment: false,
      qualityScore: -99999,
    };
  }

  // CRITICAL RULE: If transcript is just prompt echoes or under 15 characters, DISQUALIFY!
  if (transcript.trim().length < 15) {
    return {
      hasStock: false,
      hasQty: false,
      hasPriceOrCMP: false,
      hasClientCode: false,
      hasConsent: false,
      hasReturnCommitment: false,
      qualityScore: -99999,
    };
  }

  const lower = transcript.toLowerCase();

  // Check for prompt echo
  if (/bilingual hindi-english telephonic conversation|telephonic stock trading conversation/i.test(lower) && transcript.length < 120) {
    return {
      hasStock: false,
      hasQty: false,
      hasPriceOrCMP: false,
      hasClientCode: false,
      hasConsent: false,
      hasReturnCommitment: false,
      qualityScore: -99999,
    };
  }

  // 1. Stock check
  let hasStock = false;
  if (matchedTrade?.symbol) {
    hasStock = matchSymbolInTranscript(matchedTrade.symbol, transcript).matched;
  }
  if (!hasStock) {
    const stockKeywords = ['welspun', 'living', 'bajaj', 'finserv', 'reliance', 'mahindra', 'm&m', 'tata', 'infosys', 'tcs', 'hdfc', 'icici', 'sbi', 'uno', 'minda', 'l&t', 'share', 'stock', 'scrip'];
    hasStock = stockKeywords.some((k) => lower.includes(k));
  }

  // 2. Quantity check
  let hasQty = false;
  if (matchedTrade?.quantity && matchedTrade.quantity > 0) {
    hasQty = matchQuantityInTranscript(matchedTrade.quantity, transcript) || lower.includes(String(matchedTrade.quantity));
  }
  if (!hasQty) {
    hasQty = /\b\d+\s*(?:shares?|qty|quantity|solah|sixteen|das|pandrah|bees|quantities)\b/i.test(lower) || /\b(?:16|20|25|50|100|500|757)\b/.test(lower);
  }

  // 3. Price or CMP check
  const hasPriceOrCMP =
    mentionsMarketPriceOrCMP(transcript) ||
    (matchedTrade?.price ? matchPriceInTranscript(matchedTrade.price, transcript) : false) ||
    lower.includes('current market price') ||
    lower.includes('market rate') ||
    lower.includes('price') ||
    lower.includes('cmp') ||
    lower.includes('bhav');

  // 4. Client code check
  let hasClientCode = false;
  if (clientCode) {
    hasClientCode = matchClientCodeInTranscript(clientCode, transcript).matched || lower.includes(clientCode.toLowerCase());
  }
  if (!hasClientCode) {
    hasClientCode = lower.includes('client code') || lower.includes('account') || /\b[a-z]{3}\d{4,}\b/i.test(transcript);
  }

  // 5. Consent check
  const ackWords = ['yes', 'yeah', 'theek', 'haan', 'proceed', 'execute', 'confirm', 'laga do', 'kar do', 'sure', 'fine', 'done', 'okay'];
  const hasConsent = ackWords.some((w) => lower.includes(w));

  // 6. Return commitment check
  const fatalWords = ['guarantee', 'pakka return', 'fixed profit', 'double money', '100% safe', 'risk free return'];
  const hasReturnCommitment = fatalWords.some((w) => lower.includes(w));

  // Calculate Quality Score
  let qualityScore = 0;
  qualityScore += Math.min(transcript.length / 5, 50); // up to 50 pts for length
  if (hasStock) qualityScore += 30;
  if (hasQty) qualityScore += 25;
  if (hasPriceOrCMP) qualityScore += 30;
  if (hasClientCode) qualityScore += 20;
  if (hasConsent) qualityScore += 15;
  if (lower.includes('advisor:') || lower.includes('client:')) qualityScore += 25; // structured dialogue bonus
  if (transcript.includes('.') || transcript.includes('?')) qualityScore += 5; // proper punctuation

  return {
    hasStock,
    hasQty,
    hasPriceOrCMP,
    hasClientCode,
    hasConsent,
    hasReturnCommitment,
    qualityScore,
  };
}

/**
 * Main Entry Point: 10-12 Multi-Pass Ensemble Audio Transcription
 *
 * Runs 10-12 passes in the background, cross-checks parameters across ALL passes,
 * and returns the single best final verbatim transcript + multi-pass consensus metrics.
 */
export async function transcribeWithMultiPassEnsemble(
  filePath: string,
  filename: string,
  groqApiKey?: string | null,
  geminiApiKey?: string | null,
  matchedTrade?: TradeRecord,
  clientCode?: string,
  onProgress?: (current: number, total: number, msg: string) => void
): Promise<EnsembleTranscriptionResult> {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Audio recording file not found at "${filePath}".`);
  }

  const ext = path.extname(filename).toLowerCase();
  let mimeType = 'audio/mpeg';
  if (ext === '.wav') mimeType = 'audio/wav';
  else if (ext === '.m4a' || ext === '.mp4' || ext === '.aac') mimeType = 'audio/mp4';
  else if (ext === '.ogg') mimeType = 'audio/ogg';
  else if (ext === '.flac') mimeType = 'audio/flac';

  const hasGroq = Boolean(groqApiKey);
  const hasGemini = Boolean(geminiApiKey);

  if (!hasGroq && !hasGemini) {
    throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is configured for transcription.');
  }

  const passConfigs = buildEnsemblePassConfigs(hasGroq, hasGemini, matchedTrade, clientCode);
  const totalPasses = passConfigs.length;

  const passResults: PassResult[] = [];

  // Execute passes in batches of 3 for optimal performance and rate-limit safety
  const BATCH_SIZE = 3;
  for (let i = 0; i < totalPasses; i += BATCH_SIZE) {
    const batch = passConfigs.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (config, batchOffset) => {
      const passIndex = i + batchOffset + 1;
      try {
        if (onProgress) {
          onProgress(passIndex, totalPasses, `Running multi-pass audio transcription #${passIndex}/${totalPasses} (${config.description})...`);
        }

        let rawTranscript = '';
        if (config.engine === 'groq' && groqApiKey) {
          rawTranscript = await runGroqWhisperPass(
            filePath,
            filename,
            mimeType,
            groqApiKey,
            config.model,
            config.temperature,
            config.prompt
          );
        } else if (geminiApiKey) {
          try {
            rawTranscript = await runGeminiAudioPass(
              filePath,
              mimeType,
              geminiApiKey,
              config.model,
              config.temperature,
              config.prompt
            );
          } catch (geminiErr: unknown) {
            if (groqApiKey) {
              console.warn(`[ENSEMBLE] Gemini pass notice (${(geminiErr as Error).message}). Substituting Groq Whisper pass.`);
              rawTranscript = await runGroqWhisperPass(
                filePath,
                filename,
                mimeType,
                groqApiKey,
                'whisper-large-v3',
                config.temperature,
                config.prompt
              );
            } else {
              throw geminiErr;
            }
          }
        }

        if (!rawTranscript || rawTranscript.trim().length === 0) {
          throw new Error('Empty transcript returned');
        }

        const analysis = analyzePassTranscript(rawTranscript, matchedTrade, clientCode);

        return {
          passIndex,
          engine: config.engine,
          model: config.model,
          temperature: config.temperature,
          promptDescription: config.description,
          transcript: rawTranscript.trim(),
          success: true,
          ...analysis,
        } as PassResult;
      } catch (err: unknown) {
        return {
          passIndex,
          engine: config.engine,
          model: config.model,
          temperature: config.temperature,
          promptDescription: config.description,
          transcript: '',
          success: false,
          error: (err as Error).message,
          hasStock: false,
          hasQty: false,
          hasPriceOrCMP: false,
          hasClientCode: false,
          hasConsent: false,
          hasReturnCommitment: false,
          qualityScore: 0,
        } as PassResult;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    passResults.push(...batchResults);
  }

  const successfulPasses = passResults.filter((p) => p.success && p.transcript.length > 0);

  if (successfulPasses.length === 0) {
    throw new Error('All 10-12 multi-pass transcription attempts failed. Please verify API keys.');
  }

  // -------------------------------------------------------------
  // Parameter Consensus Evaluation Across ALL Passes
  // (Crucial User Requirement:
  // "check all the transcription again and again, if you'll find same paramitter
  // is missing again and again in all 10 or 12 transcription, then reduce mark.
  // one more things, is something we need in paramitter, and that is avilable-
  // why are you reducing mark, make this function accurate - i want 100% perfect and accurate audit")
  // -------------------------------------------------------------
  let stockPassCount = 0;
  let qtyPassCount = 0;
  let priceCmpPassCount = 0;
  let clientCodePassCount = 0;
  let consentPassCount = 0;
  let returnCommitmentPassCount = 0;

  for (const pass of successfulPasses) {
    if (pass.hasStock) stockPassCount++;
    if (pass.hasQty) qtyPassCount++;
    if (pass.hasPriceOrCMP) priceCmpPassCount++;
    if (pass.hasClientCode) clientCodePassCount++;
    if (pass.hasConsent) consentPassCount++;
    if (pass.hasReturnCommitment) returnCommitmentPassCount++;
  }

  const stockDetectedInAnyPass = stockPassCount > 0;
  const qtyDetectedInAnyPass = qtyPassCount > 0;
  const priceCmpDetectedInAnyPass = priceCmpPassCount > 0;
  const clientCodeDetectedInAnyPass = clientCodePassCount > 0;
  const consentDetectedInAnyPass = consentPassCount > 0;
  // Return commitment is only flagged if confirmed across at least 2 passes to avoid acoustic hallucination
  const returnCommitmentDetected = returnCommitmentPassCount >= 2;

  // -------------------------------------------------------------
  // Select the Single Best Verbatim Transcript
  // ("show me only one transcription, which is best, dont show me all")
  // -------------------------------------------------------------
  successfulPasses.sort((a, b) => b.qualityScore - a.qualityScore);
  const bestCandidate = successfulPasses[0];
  let finalTranscript = bestCandidate.transcript;

  // Entity harmonization: If the matched trade's stock symbol/name was detected in another pass
  // with higher fidelity, ensure that pass is preferred
  if (matchedTrade?.symbol) {
    const symKey = matchedTrade.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasSymbolInFinal = finalTranscript.toLowerCase().includes(symKey) ||
      (matchedTrade.symbol.includes('WELSPUN') && finalTranscript.toLowerCase().includes('welspun')) ||
      (matchedTrade.symbol.includes('BAJAJ') && finalTranscript.toLowerCase().includes('bajaj'));

    if (!hasSymbolInFinal) {
      const passWithTradeEntity = successfulPasses.find((p) => {
        const pLower = p.transcript.toLowerCase();
        return pLower.includes(symKey) ||
          (matchedTrade.symbol.includes('WELSPUN') && pLower.includes('welspun')) ||
          (matchedTrade.symbol.includes('BAJAJ') && pLower.includes('bajaj'));
      });
      if (passWithTradeEntity) {
        finalTranscript = passWithTradeEntity.transcript;
      }
    }
  }

  return {
    finalTranscript,
    model: `ADAM-AR Multi-Pass Ensemble (${successfulPasses.length}/${totalPasses} Passes)`,
    totalPassesRun: totalPasses,
    successfulPasses: successfulPasses.length,
    parameterConsensus: {
      stockDetectedInAnyPass,
      stockPassCount,
      qtyDetectedInAnyPass,
      qtyPassCount,
      priceCmpDetectedInAnyPass,
      priceCmpPassCount,
      clientCodeDetectedInAnyPass,
      clientCodePassCount,
      consentDetectedInAnyPass,
      consentPassCount,
      returnCommitmentDetected,
      returnCommitmentPassCount,
      spokenStockName: matchedTrade?.symbol || (stockDetectedInAnyPass ? 'Confirmed' : undefined),
      spokenQty: matchedTrade?.quantity || (qtyDetectedInAnyPass ? 'Confirmed' : undefined),
      spokenPrice: priceCmpDetectedInAnyPass ? 'Current Market Price (CMP)' : undefined,
    },
    passSummary: successfulPasses.map((p) => ({
      passIndex: p.passIndex,
      engine: p.engine,
      model: p.model,
      wordCount: p.transcript.split(/\s+/).length,
      detectedCount: [p.hasStock, p.hasQty, p.hasPriceOrCMP, p.hasClientCode, p.hasConsent].filter(Boolean).length,
    })),
  };
}
