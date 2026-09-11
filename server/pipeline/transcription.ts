// =============================================================
// Stage 3: INDEPENDENT TRANSCRIPTION
// Audio -> Groq Whisper -> Full Transcript -> Timestamped Segments.
// MANDATE: Absolutely NO trade context/hints passed into Whisper.
// Pure independent acoustic hearing.
// Stores: transcript_id, call_id, segment_id, start_time, end_time, speaker, text.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { TranscriptSegment } from './types';
import type { CallRecord } from '../../src/types';

export interface TranscriptionOutput {
  text: string;
  rawText: string;
  model: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
}

const NEUTRAL_PROMPT = 'Indian stock market equity trading call, pre-order verification, FundsIndia compliance.';

function sanitizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u0600-\u06FF]+/g, ' ') // Strip hallucinated Arabic/Urdu scripts
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Execute pure independent Whisper transcription on Groq
 */
async function callGroqWhisper(
  audioPath: string,
  apiKey: string,
  model = 'whisper-large-v3'
): Promise<{ text: string; rawText: string; duration: number; segments: TranscriptSegment[] }> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at path: ${audioPath}`);
  }

  const fileBuffer = fs.readFileSync(audioPath);
  const filename = path.basename(audioPath);
  const ext = path.extname(filename).toLowerCase();

  let mimeType = 'audio/wav';
  if (ext === '.mp3') mimeType = 'audio/mpeg';
  else if (ext === '.m4a' || ext === '.mp4') mimeType = 'audio/mp4';
  else if (ext === '.ogg') mimeType = 'audio/ogg';

  const boundary = `----AuditEQFormBoundary${Date.now().toString(16)}`;
  const parts: Buffer[] = [];

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${NEUTRAL_PROMPT}\r\n`));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const payload = Buffer.concat(parts);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s safety timeout

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: payload,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Whisper (${model}) error HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    const json = (await response.json()) as any;
    const text = sanitizeTranscript(json.text || '');
    const duration = typeof json.duration === 'number' ? json.duration : 0;

    const rawSegments = Array.isArray(json.segments) ? json.segments : [];
    const segments: TranscriptSegment[] = rawSegments.map((s: any, idx: number) => ({
      segment_id: `seg_${idx + 1}`,
      start_time: typeof s.start === 'number' ? Math.round(s.start * 100) / 100 : 0,
      end_time: typeof s.end === 'number' ? Math.round(s.end * 100) / 100 : 0,
      speaker: 'UNKNOWN',
      text: sanitizeTranscript(s.text || ''),
    })).filter((s) => s.text.length > 0);

    return {
      text,
      rawText: json.text || '',
      duration,
      segments,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Stage 3 Entry Point: Transcribes call independently and stores segments in call_segments
 */
export async function stage3TranscribeCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string
): Promise<TranscriptionOutput> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found in database.`);
  }

  if (!groqApiKey || !groqApiKey.trim()) {
    throw new Error('AWAITING_API_KEY: Groq API key is required for Whisper speech-to-text.');
  }

  const audioPath = call.storage_path;
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Audio recording file missing from disk: ${audioPath || 'NO_PATH'}`);
  }

  let result: { text: string; rawText: string; duration: number; segments: TranscriptSegment[] };
  let modelUsed = 'whisper-large-v3';

  try {
    result = await callGroqWhisper(audioPath, groqApiKey.trim(), 'whisper-large-v3');
  } catch (err: any) {
    // Attempt fallback to whisper-large-v3-turbo
    console.warn(`[Stage 3] Primary Whisper failed for Call #${callId}, trying turbo fallback:`, err.message);
    try {
      result = await callGroqWhisper(audioPath, groqApiKey.trim(), 'whisper-large-v3-turbo');
      modelUsed = 'whisper-large-v3-turbo';
    } catch (fallbackErr: any) {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(`
        UPDATE calls SET
          transcript_status = 'FAILED',
          failure_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(`Transcription error: ${fallbackErr.message}`, now, callId);
      throw fallbackErr;
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detectedDuration = Math.round(result.duration || call.duration_seconds || 0);

  // Clear any existing segments for this call and insert fresh ones
  db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(callId);

  const insertSeg = db.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const seg of result.segments) {
    insertSeg.run(callId, seg.segment_id, seg.start_time, seg.end_time, seg.speaker, seg.text, now);
  }

  // Update Call Record
  db.prepare(`
    UPDATE calls SET
      transcript = ?,
      transcript_raw = ?,
      transcript_model = ?,
      transcript_status = 'VALID',
      duration_seconds = CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE ? END,
      updated_at = ?
    WHERE id = ?
  `).run(result.text, result.rawText, modelUsed, detectedDuration, now, callId);

  return {
    text: result.text,
    rawText: result.rawText,
    model: modelUsed,
    durationSeconds: detectedDuration,
    segments: result.segments,
  };
}
