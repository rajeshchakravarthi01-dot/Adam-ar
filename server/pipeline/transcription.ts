// =============================================================
// Stage 3: INDEPENDENT TRANSCRIPTION (Google Gemini 3.5 Transcribe)
// Audio -> Gemini 3.5 Transcribe -> Full Transcript -> Timestamped Segments.
// MANDATE: Absolutely NO trade context/hints passed into transcription.
// Pure independent acoustic hearing.
// Stores: transcript_id, call_id, segment_id, start_time, end_time, speaker, text.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import type { TranscriptSegment } from './types';
import type { CallRecord } from '../../src/types';
import { transcribeAudioFile } from '../asr-engine';

export interface TranscriptionOutput {
  text: string;
  rawText: string;
  model: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
}

const ASR_HALLUCINATION_PATTERNS = [
  /subtitles?\s+by(?:\s+the\s+amara\.org\s+community)?/i,
  /thank\s+you\s+for\s+watching/i,
  /thanks?\s+for\s+watching/i,
  /please\s+subscribe/i,
  /like\s+and\s+subscribe/i,
  /translated\s+by/i,
  /transcribed\s+by/i,
  /\[(?:music|applause|laughter|silence)\]/gi,
];

function sanitizeTranscript(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/[\u0600-\u06FF]+/g, ' '); // Strip hallucinated Arabic/Urdu scripts
  for (const pattern of ASR_HALLUCINATION_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Stage 3 Entry Point: Transcribes call independently and stores segments in call_segments.
 * Prioritizes Google Gemini 3.5 Transcribe API with continuous rate-limit and quota management.
 */
export async function stage3TranscribeCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<TranscriptionOutput> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found in database.`);
  }

  // 1. Persistent Database Caching:
  // If call is already validly transcribed, reuse existing transcript without consuming quota
  if (call.transcript_status === 'VALID' && call.transcript && call.transcript.trim()) {
    const existingSegments = db
      .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
      .all(callId) as unknown as Array<{
        segment_id: string;
        start_time: number;
        end_time: number;
        speaker: string;
        text: string;
      }>;

    const segments: TranscriptSegment[] = existingSegments.map((s) => ({
      segment_id: s.segment_id,
      start_time: s.start_time,
      end_time: s.end_time,
      speaker: (s.speaker as any) || 'UNKNOWN',
      text: s.text,
    }));

    return {
      text: call.transcript,
      rawText: call.transcript_raw || call.transcript,
      model: call.transcript_model || 'cached-transcript',
      durationSeconds: call.duration_seconds || 0,
      segments,
    };
  }

  const audioPath = call.storage_path;
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Audio recording file missing from disk: ${audioPath || 'NO_PATH'}`);
  }

  const activeGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;

  if (!activeGeminiKey && !groqApiKey) {
    throw new Error('AWAITING_API_KEY: GEMINI_API_KEY is required for Gemini 3.5 Transcribe.');
  }

  let asrResult;
  try {
    asrResult = await transcribeAudioFile(audioPath, groqApiKey, activeGeminiKey);
  } catch (err: any) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`
      UPDATE calls SET
        transcript_status = 'FAILED',
        failure_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(`Transcription error: ${err.message}`, now, callId);
    throw err;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detectedDuration = Math.round(asrResult.durationSeconds || call.duration_seconds || 0);

  // Clear any existing segments for this call and insert fresh ones
  db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(callId);

  const insertSeg = db.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const segments: TranscriptSegment[] = asrResult.segments.map((s, idx) => ({
    segment_id: `seg_${idx + 1}`,
    start_time: Math.round(s.start * 100) / 100,
    end_time: Math.round(s.end * 100) / 100,
    speaker: (s.speaker as any) || 'UNKNOWN',
    text: sanitizeTranscript(s.text),
  })).filter((s) => s.text.length > 0);

  for (const seg of segments) {
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
  `).run(asrResult.transcript, asrResult.rawTranscript, asrResult.modelUsed, detectedDuration, now, callId);

  return {
    text: asrResult.transcript,
    rawText: asrResult.rawTranscript,
    model: asrResult.modelUsed,
    durationSeconds: detectedDuration,
    segments,
  };
}
