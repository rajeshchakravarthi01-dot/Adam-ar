// =============================================================
// Stage 1: IMPORT
// Handles file ingestion, batch creation (BATCH-YYYYMMDD-XXX),
// and assigns separate database Call IDs vs batch-scoped counts.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { ImportBatchRecord } from './types';
import { normalizePhoneNumber, cleanCallerName } from '../normalizer';

export interface UploadedFileInfo {
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  file_sha256?: string;
  caller_id?: string;
  calling_number?: string;
  registered_number?: string;
  client_code?: string;
  client_name?: string;
  advisor_name?: string;
  dealer?: string;
  call_date?: string;
  call_time?: string;
  duration_seconds?: number;
}

export interface BatchImportResult {
  batch_id: string;
  total_uploaded: number;
  start_call_id: number;
  end_call_id: number;
  calls: Array<{
    batch_index: number;
    call_id: number;
    original_filename: string;
    caller_id?: string;
    file_size: number;
    duration: number;
    import_status: string;
  }>;
}

/**
 * Generate a sequential batch ID for today: BATCH-YYYYMMDD-XXX
 */
export function generateBatchId(db: DatabaseSync): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // e.g. 20260907
  const prefix = `BATCH-${dateStr}-`;

  const latest = db
    .prepare(`SELECT batch_id FROM import_batches WHERE batch_id LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`) as { batch_id: string } | undefined;

  let nextSeq = 1;
  if (latest && latest.batch_id) {
    const parts = latest.batch_id.split('-');
    const seqPart = parseInt(parts[2], 10);
    if (!isNaN(seqPart)) {
      nextSeq = seqPart + 1;
    }
  }

  const seqFormatted = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqFormatted}`;
}

/**
 * Stage 1 Entry Point: Ingest a list of uploaded audio files into a new batch
 */
export function stage1ImportCalls(
  db: DatabaseSync,
  files: UploadedFileInfo[]
): BatchImportResult {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const batchId = generateBatchId(db);

  // 1. Insert the batch header
  db.prepare(`
    INSERT INTO import_batches (batch_id, total_files, uploaded_count, status, created_at)
    VALUES (?, ?, ?, 'completed', ?)
  `).run(batchId, files.length, files.length, now);

  const importedCalls: BatchImportResult['calls'] = [];
  let firstCallId = 0;
  let lastCallId = 0;

  const insertStmt = db.prepare(`
    INSERT INTO calls (
      batch_id, original_filename, recording_name, storage_path, file_size, mime_type,
      file_sha256, calling_number, phone_number, registered_number,
      client, client_code, caller_name, dealer, call_date, call_time, duration_seconds,
      import_status, identity_status, transcript_status, classification,
      trade_match_status, audit_status, processing_status,
      source, status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      'CONFIRMED', 'PENDING', 'PENDING', 'PENDING',
      'PENDING', 'PENDING', 'IDLE',
      'upload', 'imported', ?, ?
    )
  `);

  files.forEach((file, index) => {
    // 1. Look up telephony metadata cache using filename as caller_id / recording_name
    const cleanAudioId = file.original_filename.replace(/\.(mp3|wav|m4a|ogg|aac|flac|wma|webm)$/i, '').replace(/^audio_/, '').trim();
    let meta: any = null;
    try {
      meta = db.prepare(`
        SELECT * FROM call_metadata_cache
        WHERE caller_id = ? OR call_id = ? OR recording_file_name = ?
        LIMIT 1
      `).get(cleanAudioId, cleanAudioId, cleanAudioId);
      if (!meta && cleanAudioId.length >= 10) {
        const prefix = cleanAudioId.slice(0, 15);
        meta = db.prepare(`
          SELECT * FROM call_metadata_cache
          WHERE caller_id LIKE ? OR call_id LIKE ? OR recording_file_name LIKE ?
          LIMIT 1
        `).get(`${prefix}%`, `${prefix}%`, `${prefix}%`);
      }
    } catch {}

    // Extract phone/caller_id from metadata or filename
    let extractedCallerId = normalizePhoneNumber(file.calling_number || file.caller_id || (meta ? meta.client_number : '') || '') || file.caller_id || file.calling_number || (meta ? meta.caller_id : '') || '';
    if (!extractedCallerId || extractedCallerId === '0000000000') {
      const match = file.original_filename.match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/);
      if (match) {
        extractedCallerId = match[1];
      }
    }

    // Extract client code from metadata, trade record, or filename
    let extractedClientCode = file.client_code || (meta ? meta.client_code : '') || '';
    if (!extractedClientCode && extractedCallerId && extractedCallerId !== '0000000000') {
      try {
        const trade = db.prepare('SELECT client FROM trades WHERE phone_number = ? OR client_number = ? LIMIT 1').get(extractedCallerId, extractedCallerId) as any;
        if (trade && trade.client) {
          extractedClientCode = trade.client;
        }
      } catch {}
    }
    if (!extractedClientCode) {
      const match = file.original_filename.match(/\b([A-Z]{2,4}[0-9]{3,7})\b/i);
      if (match) {
        extractedClientCode = match[1].toUpperCase();
      }
    }

    // Advisor / Dealer name
    let advisorName = cleanCallerName(file.advisor_name || (meta ? meta.advisor : '') || '');
    let dealerName = cleanCallerName(file.dealer || (meta ? meta.dealer : '') || '');
    if (!advisorName && extractedCallerId) {
      try {
        const trade = db.prepare('SELECT advisor_name, team FROM trades WHERE phone_number = ? OR client_number = ? LIMIT 1').get(extractedCallerId, extractedCallerId) as any;
        if (trade && trade.advisor_name) {
          advisorName = cleanCallerName(trade.advisor_name);
        }
      } catch {}
    }

    // Registered number must come from metadata or authoritative clients master
    let regNumber = normalizePhoneNumber(file.registered_number || '') || file.registered_number || '';
    if (!regNumber && extractedClientCode) {
      try {
        const clientRow = db.prepare('SELECT phone_number, registered_mobile FROM clients WHERE client_code = ?').get(extractedClientCode) as any;
        if (clientRow) {
          regNumber = normalizePhoneNumber(clientRow.registered_mobile || clientRow.phone_number || '') || clientRow.phone_number || '';
        }
      } catch {}
    }

    const duration = file.duration_seconds || (meta ? meta.duration : 0) || 0;
    const recordingName = path.basename(file.storage_path);
    const callDate = file.call_date || (meta ? meta.date : '') || now.slice(0, 10);
    const callTime = file.call_time || (meta ? meta.time : '') || now.slice(11, 19);

    const res = insertStmt.run(
      batchId,
      file.original_filename,
      recordingName,
      file.storage_path,
      file.file_size,
      file.mime_type,
      file.file_sha256 || '',
      extractedCallerId,
      extractedCallerId,
      regNumber,
      extractedClientCode,
      extractedClientCode,
      advisorName,
      dealerName,
      callDate,
      callTime,
      duration,
      now,
      now
    );

    const callId = Number(res.lastInsertRowid);
    if (index === 0) firstCallId = callId;
    lastCallId = callId;

    importedCalls.push({
      batch_index: index + 1,
      call_id: callId,
      original_filename: file.original_filename,
      caller_id: extractedCallerId,
      file_size: file.file_size,
      duration,
      import_status: 'CONFIRMED',
    });
  });

  return {
    batch_id: batchId,
    total_uploaded: files.length,
    start_call_id: firstCallId,
    end_call_id: lastCallId,
    calls: importedCalls,
  };
}
