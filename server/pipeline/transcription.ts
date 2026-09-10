// =============================================================
// Stage 3: INDEPENDENT TRANSCRIPTION (Sarvam AI Batch API Engine)
// Audio -> Sarvam AI Speech-to-Text Batch API (saaras:v3) -> Diarized Transcript -> Segments.
// MANDATE: Pure acoustic hearing with Hindi/Hinglish/Indian speech code-mixing.
// Supports files up to 2 hours with native 2-speaker diarization.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { TranscriptSegment } from './types';
import type { CallRecord } from '../../src/types';

export const DEFAULT_SARVAM_KEY = 'sk_bl18l2w6_EJeAwkIjgIINAy9hwaVVSA5A';

export interface TranscriptionOutput {
  text: string;
  rawText: string;
  model: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
}

export function detectSegmentLanguage(text: string, defaultLanguage = 'hi'): string {
  if (!text) return defaultLanguage;
  // Unicode script detection
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil script
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu script
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari script

  const lower = text.toLowerCase();
  // Romanized Tamil markers
  if (/\b(?:vanakkam|vangunka|vitrunga|evalavu|vilai|koodunga|pannidunga|podunga|theriyum|illai|sari|romba|nalla|solunga)\b/i.test(lower)) {
    return 'ta';
  }
  // Romanized Telugu markers
  if (/\b(?:namaskaram|konandi|ammeyandi|entha|pettandi|cheyyandi|lekapothe|cheppandi|sare|avunu|ledu|chesi)\b/i.test(lower)) {
    return 'te';
  }
  // Romanized Hindi markers
  if (/\b(?:namaskar|theek\s*hai|kar\s*dijiye|haan\s*ji|kitna|lena\s*hai|bhav|bech|karein|kijiye|bolo|samajh|boliye)\b/i.test(lower)) {
    return 'hi';
  }

  return defaultLanguage;
}

export function sanitizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u0600-\u06FF]+/g, ' ') // Strip hallucinated Arabic/Urdu scripts
    .replace(/\s+/g, ' ')
    .trim();
}

export const cleanTranscribedText = sanitizeTranscript;

/**
 * Probes the exact duration of an audio file in seconds.
 */
export function getAudioDuration(audioPath: string): number {
  try {
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }
    ).toString().trim();
    const parsed = parseFloat(probe);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {}

  try {
    const stats = fs.statSync(audioPath);
    // Typical 16kHz mono 16-bit PCM = 32000 bytes/sec
    return Math.max(1, Math.round((stats.size - 44) / 32000));
  } catch {
    return 30;
  }
}

export interface SarvamJobOptions {
  model?: string;
  languageCode?: string;
  mode?: 'transcribe' | 'codemix' | 'translate' | 'verbatim' | 'translit';
  withDiarization?: boolean;
  numSpeakers?: number;
  callbackUrl?: string;
  callbackToken?: string;
}

export interface SarvamAudioResult {
  filename: string;
  text: string;
  rawText: string;
  duration: number;
  segments: TranscriptSegment[];
  language: string;
}

/**
 * Core Sarvam AI Batch STT API implementation
 * 1. POST https://api.sarvam.ai/speech-to-text/job/v1 (Create Job)
 * 2. POST https://api.sarvam.ai/speech-to-text/job/v1/upload-files (Get Pre-signed Upload URLs)
 * 3. PUT binary audio to pre-signed upload URLs
 * 4. POST https://api.sarvam.ai/speech-to-text/job/v1/:job_id/start (Start Job)
 * 5. GET https://api.sarvam.ai/speech-to-text/job/v1/:job_id/status (Poll with exponential backoff)
 * 6. POST https://api.sarvam.ai/speech-to-text/job/v1/download-files (Get Pre-signed Download URLs)
 * 7. Parse transcript and diarized_transcript entries into TranscriptSegment[]
 */
export async function runSarvamBatchSttJob(
  audioFiles: Array<{ filePath: string; originalName?: string }>,
  apiKey: string,
  options?: SarvamJobOptions
): Promise<Map<string, SarvamAudioResult>> {
  if (!audioFiles || audioFiles.length === 0) {
    return new Map();
  }

  const cleanKey = apiKey ? apiKey.trim() : DEFAULT_SARVAM_KEY;
  if (!cleanKey) {
    throw new Error('Sarvam AI API key is required for batch transcription.');
  }

  const model = options?.model || 'saaras:v3';
  const languageCode = options?.languageCode || 'hi-IN';
  const mode = options?.mode || 'codemix';
  const withDiarization = options?.withDiarization !== false;
  const numSpeakers = options?.numSpeakers || 2;

  // Step 1: Create Job
  const createPayload: any = {
    job_parameters: {
      model,
      language_code: languageCode,
      mode,
      with_diarization: withDiarization,
      num_speakers: numSpeakers,
    },
  };

  if (options?.callbackUrl) {
    createPayload.callback = {
      url: options.callbackUrl,
      auth_token: options.callbackToken || 'auditeq-token',
    };
  }

  const createRes = await fetch('https://api.sarvam.ai/speech-to-text/job/v1', {
    method: 'POST',
    headers: {
      'api-subscription-key': cleanKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Sarvam STT Batch Job creation failed (HTTP ${createRes.status}): ${errText.slice(0, 300)}`);
  }

  const createData = (await createRes.json()) as any;
  const jobId = createData.job_id;
  if (!jobId) {
    throw new Error(`Sarvam STT Batch Job did not return job_id: ${JSON.stringify(createData)}`);
  }

  // Step 2: Request pre-signed upload URLs
  const fileNames = audioFiles.map((f, idx) => {
    const base = path.basename(f.filePath);
    return `${idx}_${base}`;
  });

  const uploadReqRes = await fetch('https://api.sarvam.ai/speech-to-text/job/v1/upload-files', {
    method: 'POST',
    headers: {
      'api-subscription-key': cleanKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: jobId,
      files: fileNames,
    }),
  });

  if (!uploadReqRes.ok) {
    const errText = await uploadReqRes.text();
    throw new Error(`Sarvam upload-files request failed (HTTP ${uploadReqRes.status}): ${errText.slice(0, 300)}`);
  }

  const uploadData = (await uploadReqRes.json()) as any;
  const uploadUrls = uploadData.upload_urls || {};

  // Step 3: PUT audio files to pre-signed URLs
  for (let i = 0; i < audioFiles.length; i++) {
    const item = audioFiles[i];
    const uploadName = fileNames[i];
    const urlObj = uploadUrls[uploadName];
    const uploadUrl = typeof urlObj === 'string' ? urlObj : (urlObj?.file_url || urlObj?.url);

    if (!uploadUrl) {
      throw new Error(`No upload URL returned for file "${uploadName}".`);
    }

    const fileBuffer = fs.readFileSync(item.filePath);
    const ext = path.extname(item.filePath).toLowerCase();
    let contentType = 'audio/wav';
    if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.m4a' || ext === '.mp4') contentType = 'audio/mp4';
    else if (ext === '.ogg') contentType = 'audio/ogg';

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': contentType,
      },
      body: fileBuffer,
    });

    if (!putRes.ok) {
      const putErr = await putRes.text().catch(() => '');
      throw new Error(`Failed to upload "${uploadName}" to Sarvam storage (HTTP ${putRes.status}): ${putErr.slice(0, 200)}`);
    }
  }

  // Step 4: Start Job
  const startRes = await fetch(`https://api.sarvam.ai/speech-to-text/job/v1/${jobId}/start`, {
    method: 'POST',
    headers: {
      'api-subscription-key': cleanKey,
    },
  });

  if (!startRes.ok) {
    const startErr = await startRes.text();
    throw new Error(`Failed to start Sarvam STT job ${jobId} (HTTP ${startRes.status}): ${startErr.slice(0, 300)}`);
  }

  // Step 5: Poll status until Completed or Failed
  let pollAttempts = 0;
  const maxPollAttempts = 90; // up to ~4-5 minutes
  let statusData: any = null;
  let delayMs = 3000;

  while (pollAttempts < maxPollAttempts) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    pollAttempts++;

    const statusRes = await fetch(`https://api.sarvam.ai/speech-to-text/job/v1/${jobId}/status`, {
      headers: {
        'api-subscription-key': cleanKey,
      },
    });

    if (!statusRes.ok) {
      delayMs = Math.min(delayMs + 1000, 6000);
      continue;
    }

    statusData = (await statusRes.json()) as any;
    const state = (statusData.job_state || '').toLowerCase();

    if (state === 'completed' || state === 'partially_completed') {
      break;
    }

    if (state === 'failed' || state === 'rejected') {
      throw new Error(`Sarvam STT Batch Job ${jobId} failed with state: ${state}. Details: ${statusData.error_message || 'N/A'}`);
    }

    // Moderate backoff
    if (pollAttempts > 10) delayMs = 4000;
  }

  if (!statusData) {
    throw new Error(`Sarvam STT job ${jobId} timed out awaiting completion.`);
  }

  // Step 6: Map outputs to inputs and download
  const jobDetails = Array.isArray(statusData.job_details) ? statusData.job_details : [];
  const outputFilesToDownload: string[] = [];
  const outputToFileMap = new Map<string, { audioIndex: number; audioPath: string }>();

  jobDetails.forEach((detail: any, dIdx: number) => {
    const inputName = detail.inputs?.[0]?.file_name || fileNames[dIdx];
    const outputName = detail.outputs?.[0]?.file_name || `${dIdx}.json`;
    const audioIdx = fileNames.indexOf(inputName);
    const targetIdx = audioIdx >= 0 ? audioIdx : dIdx;

    if (detail.state === 'Success' || !detail.state) {
      outputFilesToDownload.push(outputName);
      outputToFileMap.set(outputName, {
        audioIndex: targetIdx,
        audioPath: audioFiles[targetIdx]?.filePath || '',
      });
    }
  });

  if (outputFilesToDownload.length === 0) {
    throw new Error(`Sarvam STT job ${jobId} completed without successful output files: ${JSON.stringify(jobDetails)}`);
  }

  const dlRes = await fetch('https://api.sarvam.ai/speech-to-text/job/v1/download-files', {
    method: 'POST',
    headers: {
      'api-subscription-key': cleanKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: jobId,
      files: outputFilesToDownload,
    }),
  });

  if (!dlRes.ok) {
    const dlErr = await dlRes.text();
    throw new Error(`Failed to get download URLs for Sarvam job ${jobId}: ${dlErr.slice(0, 300)}`);
  }

  const dlData = (await dlRes.json()) as any;
  const downloadUrls = dlData.download_urls || {};
  const resultMap = new Map<string, SarvamAudioResult>();

  for (const outFileName of outputFilesToDownload) {
    const meta = outputToFileMap.get(outFileName);
    if (!meta) continue;

    const urlObj = downloadUrls[outFileName];
    const fileUrl = typeof urlObj === 'string' ? urlObj : (urlObj?.file_url || urlObj?.url);
    if (!fileUrl) continue;

    const contentRes = await fetch(fileUrl);
    if (!contentRes.ok) continue;

    const json = (await contentRes.json()) as any;
    const rawTranscript = json.transcript || '';
    const text = sanitizeTranscript(rawTranscript);
    const detectedLang = json.language_code ? String(json.language_code).slice(0, 2).toLowerCase() : 'hi';

    const diarizedEntries = Array.isArray(json.diarized_transcript?.entries)
      ? json.diarized_transcript.entries
      : [];

    const segments: TranscriptSegment[] = [];
    const duration = getAudioDuration(meta.audioPath);

    if (diarizedEntries.length > 0) {
      diarizedEntries.forEach((entry: any, idx: number) => {
        const segText = sanitizeTranscript(entry.transcript || '');
        if (!segText) return;
        const speakerRaw = entry.speaker_id !== undefined && entry.speaker_id !== null ? String(entry.speaker_id) : '0';
        const speakerId = speakerRaw.startsWith('SPEAKER_') ? speakerRaw : `SPEAKER_${speakerRaw}`;
        segments.push({
          segment_id: `seg_${idx + 1}`,
          start_time: typeof entry.start_time_seconds === 'number' ? Math.round(entry.start_time_seconds * 100) / 100 : 0,
          end_time: typeof entry.end_time_seconds === 'number' ? Math.round(entry.end_time_seconds * 100) / 100 : duration,
          speaker: speakerId as any,
          text: segText,
          language: detectSegmentLanguage(segText, detectedLang),
        });
      });
    } else if (text.length > 0) {
      segments.push({
        segment_id: 'seg_1',
        start_time: 0,
        end_time: Math.round(duration * 100) / 100,
        speaker: 'SPEAKER_0' as any,
        text,
        language: detectSegmentLanguage(text, detectedLang),
      });
    }

    resultMap.set(meta.audioPath, {
      filename: path.basename(meta.audioPath),
      text,
      rawText: rawTranscript,
      duration,
      segments,
      language: detectedLang,
    });
  }

  return resultMap;
}

/**
 * Single audio file transcription using the Sarvam AI Batch API
 */
export async function callSarvamSpeechToText(
  audioPath: string,
  apiKey: string,
  options?: SarvamJobOptions
): Promise<SarvamAudioResult> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at path: ${audioPath}`);
  }

  const results = await runSarvamBatchSttJob([{ filePath: audioPath }], apiKey, options);
  const res = results.get(audioPath);
  if (!res) {
    throw new Error(`Sarvam transcription failed to produce result for ${path.basename(audioPath)}`);
  }
  return res;
}

/**
 * Batch processor for up to 20 calls per Sarvam Batch Job
 */
export async function transcribeBatchOfCalls(
  db: DatabaseSync,
  calls: Array<{ id: number; storage_path: string; duration_seconds?: number }>,
  apiKey: string,
  options?: SarvamJobOptions
): Promise<Map<number, TranscriptionOutput>> {
  const outputMap = new Map<number, TranscriptionOutput>();
  if (!calls || calls.length === 0) return outputMap;

  // Chunk calls into batches of up to 20 files
  const BATCH_SIZE = 20;
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    const chunk = calls.slice(i, i + BATCH_SIZE);
    const validChunk = chunk.filter((c) => c.storage_path && fs.existsSync(c.storage_path));
    if (validChunk.length === 0) continue;

    const audioFiles = validChunk.map((c) => ({ filePath: c.storage_path }));
    try {
      const results = await runSarvamBatchSttJob(audioFiles, apiKey, options);
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

      for (const call of validChunk) {
        const res = results.get(call.storage_path);
        if (!res) continue;

        // Clear existing segments and write fresh diarized segments
        db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(call.id);
        const insertSeg = db.prepare(`
          INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const seg of res.segments) {
          insertSeg.run(call.id, seg.segment_id, seg.start_time, seg.end_time, seg.speaker, seg.text, seg.language || 'hi', now);
        }

        const detectedDuration = Math.round(res.duration || call.duration_seconds || 0);
        db.prepare(`
          UPDATE calls SET
            transcript = ?,
            transcript_raw = ?,
            transcript_model = 'sarvam:saaras-v3',
            transcript_status = 'VALID',
            duration_seconds = CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE ? END,
            updated_at = ?
          WHERE id = ?
        `).run(res.text, res.rawText, detectedDuration, now, call.id);

        outputMap.set(call.id, {
          text: res.text,
          rawText: res.rawText,
          model: 'sarvam:saaras-v3',
          durationSeconds: detectedDuration,
          segments: res.segments,
        });
      }
    } catch (batchErr: any) {
      console.error(`[Sarvam Batch STT] Failed for chunk starting at index ${i}:`, batchErr.message);
      // Mark failed calls
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      for (const call of validChunk) {
        db.prepare(`
          UPDATE calls SET
            transcript_status = 'FAILED',
            failure_reason = ?,
            updated_at = ?
          WHERE id = ?
        `).run(`Sarvam Batch STT failed: ${batchErr.message}`, now, call.id);
      }
    }
  }

  return outputMap;
}

/**
 * Stage 3 Entry Point: Transcribes call independently and stores diarized segments in call_segments
 * Exclusively powered by Sarvam AI Speech-to-Text Batch API (saaras:v3)
 */
export async function stage3TranscribeCall(
  db: DatabaseSync,
  callId: number,
  _groqApiKey?: string,
  sarvamApiKey?: string
): Promise<TranscriptionOutput> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found in database.`);
  }

  const audioPath = call.storage_path;
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Audio recording file missing from disk: ${audioPath || 'NO_PATH'}`);
  }

  // Resolve active Sarvam key
  let activeSarvamKey = sarvamApiKey?.trim();
  if (!activeSarvamKey) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'sarvam_key'").get() as { value: string } | undefined;
      if (row?.value && row.value.trim()) activeSarvamKey = row.value.trim();
    } catch {}
  }
  if (!activeSarvamKey && process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim()) {
    activeSarvamKey = process.env.SARVAM_API_KEY.trim();
  }
  if (!activeSarvamKey) {
    activeSarvamKey = DEFAULT_SARVAM_KEY;
  }

  // Get preferred mode from settings (default: codemix)
  let preferredMode: 'transcribe' | 'codemix' = 'codemix';
  try {
    const modeRow = db.prepare("SELECT value FROM settings WHERE key = 'sarvam_transcription_mode'").get() as { value: string } | undefined;
    if (modeRow?.value && (modeRow.value === 'transcribe' || modeRow.value === 'codemix')) {
      preferredMode = modeRow.value as any;
    }
  } catch {}

  const modelUsed = 'sarvam:saaras-v3';
  let result: SarvamAudioResult;

  try {
    console.log(`[Stage 3] Transcribing Call #${callId} with Sarvam AI Batch API (saaras:v3, mode: ${preferredMode})...`);
    result = await callSarvamSpeechToText(audioPath, activeSarvamKey, {
      model: 'saaras:v3',
      languageCode: 'hi-IN',
      mode: preferredMode,
      withDiarization: true,
      numSpeakers: 2,
    });
  } catch (sarvamErr: any) {
    console.error(`[Stage 3] Sarvam AI STT Batch failed for Call #${callId}:`, sarvamErr.message);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`
      UPDATE calls SET
        transcript_status = 'FAILED',
        failure_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(`Sarvam AI Batch failed: ${sarvamErr.message}`, now, callId);
    throw sarvamErr;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detectedDuration = Math.round(result.duration || call.duration_seconds || 0);

  // Clear any existing segments for this call and insert fresh ones
  db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(callId);

  const insertSeg = db.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const seg of result.segments) {
    insertSeg.run(callId, seg.segment_id, seg.start_time, seg.end_time, seg.speaker, seg.text, seg.language || 'hi', now);
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

/**
 * Universal transcription function for external callers
 */
export async function transcribeAudioFile(
  filePath: string,
  apiKey?: string,
  _geminiKey?: string,
  _referenceTrade?: any,
  sarvamKey?: string
): Promise<{
  text: string;
  transcript: string;
  rawTranscript: string;
  modelUsed: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
  duration: number;
}> {
  const activeSarvam = sarvamKey?.trim() || (apiKey?.startsWith('sk_') ? apiKey.trim() : DEFAULT_SARVAM_KEY);
  const res = await callSarvamSpeechToText(filePath, activeSarvam, {
    model: 'saaras:v3',
    languageCode: 'hi-IN',
    mode: 'codemix',
    withDiarization: true,
    numSpeakers: 2,
  });

  return {
    text: res.text,
    transcript: res.text,
    rawTranscript: res.rawText,
    modelUsed: 'sarvam:saaras-v3',
    durationSeconds: res.duration,
    segments: res.segments,
    duration: res.duration,
  };
}

/**
 * Checks whether secondary ASR is required based on critical conflicts and confidence.
 */
export function shouldTriggerSecondaryAsr(
  transcript: string,
  _referenceTrade?: any,
  confidence: number = 1.0
): boolean {
  if (confidence < 0.7) return true;
  if (!transcript || transcript.toLowerCase().includes('inaudible') || transcript.toLowerCase().includes('static noise')) {
    return true;
  }
  return false;
}

/**
 * Safe audio preparation for ASR without speech degradation.
 */
export function prepareAudioForAsr(
  buffer: Buffer,
  _filename: string
): { processedBuffer: Buffer; durationSeconds: number } {
  return {
    processedBuffer: buffer,
    durationSeconds: 30,
  };
}


