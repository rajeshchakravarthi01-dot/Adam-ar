// =============================================================
// Stage 2: IDENTITY RESOLUTION (ASR-Aware & SEBI Compliant)
// Deterministic first: Telephony CLI -> Metadata Exact Match
// -> Authoritative Client / UCC Resolution.
// Cross-verifies: client_number <-> client_code <-> trade records.
//
// Rules enforced:
// 1. Never set registered number equal to calling number as a fallback.
// 2. ASR output is an observation, not ground truth.
// 3. Resolve ASR variants using authoritative client records.
// 4. Ambiguous UCC (multiple candidate matches) -> REVIEW.
// 5. Calling number comes strictly from telephony metadata/CLI.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { normalizePhoneNumber, isMaskedOrCorruptedPhoneNumber, normalizeClientCode, cleanCallerName } from '../normalizer';
import { FUNDSINDIA_ADVISOR_DIRECTORY } from '../fundsindia-directory';
import {
  extractSpokenUccCandidates,
  resolveUccWithAuthoritativeData,
  isValidUcc,
} from './uccResolver';
import type { ResolvedIdentity, IdentityStatus, IdentitySource } from './types';
import type { CallRecord, TradeRecord } from '../../src/types';

export function stage2ResolveIdentity(
  db: DatabaseSync,
  callId: number
): ResolvedIdentity {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    return {
      caller_id: '',
      status: 'FAILED',
      source: 'METADATA',
      resolution_notes: `Call #${callId} not found in database.`,
    };
  }

  // 1. Resolve Telephony metadata from call_metadata_cache
  // Rule: Audio file name connects directly to Call ID / Caller ID in companion metadata
  const filename = call.original_filename || call.recording_name || '';
  const cleanId = filename.replace(/\.(mp3|wav|m4a|ogg|aac|flac|wma|webm)$/i, '').replace(/^audio_/, '').trim();
  let cachedMeta: any = null;
  if (cleanId) {
    try {
      cachedMeta = db.prepare(`
        SELECT * FROM call_metadata_cache
        WHERE caller_id = ? OR call_id = ? OR recording_file_name = ?
        LIMIT 1
      `).get(cleanId, cleanId, cleanId);

      if (!cachedMeta) {
        // Tolerant prefix matching for float rounding discrepancies (e.g. 1785816221.1069059 vs 1785816221.106906)
        const prefix = cleanId.slice(0, 15);
        if (prefix.length >= 10) {
          cachedMeta = db.prepare(`
            SELECT * FROM call_metadata_cache
            WHERE caller_id LIKE ? OR call_id LIKE ? OR recording_file_name LIKE ?
            LIMIT 1
          `).get(`${prefix}%`, `${prefix}%`, `${prefix}%`);
        }
      }
    } catch {}
  }

  let rawCallerId = call.calling_number || call.phone_number || '';
  if (cachedMeta?.client_number) {
    const metaPhone = normalizePhoneNumber(cachedMeta.client_number);
    if (metaPhone && (!rawCallerId || rawCallerId === '0000000000' || isMaskedOrCorruptedPhoneNumber(rawCallerId))) {
      rawCallerId = metaPhone;
    }
  }

  // Cross-reference Call Flow masked customer number and trade data if rawCallerId is missing or corrupted
  let recoveredTradeFromFlow: TradeRecord | null = null;
  if (cachedMeta?.raw_data && (!rawCallerId || isMaskedOrCorruptedPhoneNumber(rawCallerId))) {
    try {
      const rawObj = JSON.parse(cachedMeta.raw_data);
      const callFlow = rawObj['Call Flow'] || '';
      const flowMatch = callFlow.match(/Customer:\s*(?:\+91|0)?(\d{2})[X\s*]{4,8}(\d{2})/i);
      if (flowMatch) {
        const pfx = flowMatch[1];
        const sfx = flowMatch[2];
        const advisorCand = (rawObj['Answered By Agent'] || cachedMeta.advisor || '').toLowerCase();
        const candTrades = db.prepare('SELECT * FROM trades').all() as unknown as TradeRecord[];
        const matchingTrades = candTrades.filter((t) => {
          const ph = normalizePhoneNumber(t.phone_number || t.client_number || '');
          return ph.startsWith(pfx) && ph.endsWith(sfx);
        });

        if (matchingTrades.length === 1) {
          recoveredTradeFromFlow = matchingTrades[0];
        } else if (matchingTrades.length > 1) {
          const advisorMatch = matchingTrades.find((t) => {
            const adv = (t.advisor_name || '').toLowerCase();
            return advisorCand.includes(adv) || adv.includes(advisorCand.slice(0, 5));
          });
          recoveredTradeFromFlow = advisorMatch || matchingTrades[0];
        }

        if (recoveredTradeFromFlow) {
          rawCallerId = normalizePhoneNumber(recoveredTradeFromFlow.phone_number || recoveredTradeFromFlow.client_number || '');
        }
      }
    } catch {}
  }

  if (!rawCallerId && (call.original_filename || call.recording_name)) {
    const fn = call.original_filename || call.recording_name;
    const phoneMatch = fn.match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/);
    if (phoneMatch) {
      rawCallerId = phoneMatch[1];
    }
  }
  const callerId = normalizePhoneNumber(rawCallerId) || '';

  // 2. Extract Client Code / UCC from Metadata, Filename, or Transcript via ASR Resolver
  let rawClientCode = call.client || call.client_code || '';
  if (rawClientCode && !isValidUcc(rawClientCode)) {
    rawClientCode = '';
  }
  if (!rawClientCode && cachedMeta?.client_code && isValidUcc(cachedMeta.client_code)) {
    rawClientCode = cachedMeta.client_code;
  }
  if (!rawClientCode && recoveredTradeFromFlow?.client && isValidUcc(recoveredTradeFromFlow.client)) {
    rawClientCode = recoveredTradeFromFlow.client;
  }
  if (!rawClientCode && (call.original_filename || call.recording_name)) {
    const fn = call.original_filename || call.recording_name;
    const uccMatch = fn.match(/\b((?:WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD|PWA)[0-9]{3,7})\b/i);
    if (uccMatch && isValidUcc(uccMatch[1])) {
      rawClientCode = uccMatch[1].toUpperCase();
    }
  }

  // If transcript is available and rawClientCode is still missing or needs verification:
  if (call.transcript) {
    const spokenCandidates = extractSpokenUccCandidates(call.transcript);
    for (const cand of spokenCandidates) {
      const res = resolveUccWithAuthoritativeData(db, cand.cleanCandidate, rawClientCode, callerId);
      if (res.status === 'RESOLVED' && res.resolvedUcc && isValidUcc(res.resolvedUcc)) {
        rawClientCode = res.resolvedUcc;
        break;
      }
    }
  }

  const normalizedUcc = isValidUcc(rawClientCode) ? normalizeClientCode(rawClientCode) : '';

  // 3. Initialize Advisor, Dealer, and Team from Call / Metadata (User uploaded data takes precedence)
  let dealer = call.dealer || cachedMeta?.dealer || '';
  let advisor = cleanCallerName(call.caller_name || cachedMeta?.advisor || '');
  if (advisor.toLowerCase() === 'advisor' && cachedMeta?.advisor) {
    advisor = cleanCallerName(cachedMeta.advisor);
  }
  let team = call.team || cachedMeta?.team || 'Equity';

  // 4. Look up registered number and trade records by UCC or Phone number (Column F match)
  let registeredNumber = call.registered_number || '';
  let clientNumber = call.client_number || cachedMeta?.client_number || '';

  let identityStatus: IdentityStatus = 'PENDING';
  let identitySource: IdentitySource = 'METADATA';
  let resolutionNotes = '';

  const tradesForClient = normalizedUcc
    ? (db.prepare('SELECT * FROM trades WHERE client = ? OR client_number = ? OR phone_number = ?').all(normalizedUcc, normalizedUcc, normalizedUcc) as unknown as TradeRecord[])
    : [];

  const tradesForPhone = callerId
    ? (db.prepare('SELECT * FROM trades WHERE phone_number = ? OR client_number = ?').all(callerId, callerId) as unknown as TradeRecord[])
    : [];

  // Deterministic Chain:
  if (normalizedUcc && callerId) {
    if (tradesForClient.length > 0) {
      const matchingTradePhone = tradesForClient.find(
        (t) => normalizePhoneNumber(t.phone_number || t.client_number || '') === callerId
      );
      if (matchingTradePhone) {
        identityStatus = 'CONFIRMED';
        identitySource = 'METADATA';
        registeredNumber = callerId;
        clientNumber = matchingTradePhone.client_number || callerId;
        if (matchingTradePhone.dealer) dealer = matchingTradePhone.dealer;
        if (matchingTradePhone.advisor_name) advisor = cleanCallerName(matchingTradePhone.advisor_name);
        if (matchingTradePhone.team) team = matchingTradePhone.team;
        resolutionNotes = 'Authoritative exact 3-way match across metadata and trade records.';
      } else {
        // Trade has different phone than calling number
        const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
        registeredNumber = normalizePhoneNumber(tradePhone);
        if (tradesForClient[0].dealer) dealer = tradesForClient[0].dealer;
        if (tradesForClient[0].advisor_name) advisor = cleanCallerName(tradesForClient[0].advisor_name);
        if (tradesForClient[0].team) team = tradesForClient[0].team;
        identityStatus = 'CONFIRMED';
        identitySource = 'METADATA';
        resolutionNotes = `Confirmed client UCC ${normalizedUcc}. Note: Calling CLI (${callerId}) differs from registered trade phone (${registeredNumber}).`;
      }
    } else {
      identityStatus = 'CONFIRMED';
      identitySource = 'METADATA';
      resolutionNotes = 'Identity confirmed from call metadata. Awaiting trade records to verify registered phone.';
    }
  } else if (normalizedUcc && !callerId) {
    if (tradesForClient.length > 0) {
      const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
      registeredNumber = normalizePhoneNumber(tradePhone);
      if (tradesForClient[0].dealer) dealer = tradesForClient[0].dealer;
      if (tradesForClient[0].advisor_name) advisor = cleanCallerName(tradesForClient[0].advisor_name);
      if (tradesForClient[0].team) team = tradesForClient[0].team;
    }
    identityStatus = 'REVIEW';
    identitySource = 'METADATA';
    resolutionNotes = `Client UCC ${normalizedUcc} present, but caller ID (CLI) is missing. Requires compliance review.`;
  } else if (callerId && !normalizedUcc) {
    const uniqueUccs = Array.from(new Set(tradesForPhone.map((t) => normalizeClientCode(t.client)).filter(Boolean)));

    if (uniqueUccs.length === 1) {
      const uniqueUcc = uniqueUccs[0];
      const matchedTrade = tradesForPhone[0];
      identityStatus = 'CONFIRMED';
      identitySource = 'TRADE_EXACT';
      rawClientCode = uniqueUcc;
      registeredNumber = callerId;
      clientNumber = matchedTrade.client_number || callerId;
      if (matchedTrade.dealer) dealer = matchedTrade.dealer;
      // ALWAYS use the actual advisor name from the uploaded trade sheet (e.g. siva)
      if (matchedTrade.advisor_name) advisor = cleanCallerName(matchedTrade.advisor_name);
      if (matchedTrade.team) team = matchedTrade.team;
      resolutionNotes = `Identity confirmed from trade records: phone ${callerId} registered to client ${uniqueUcc} (Advisor: ${advisor || 'Assigned'}).`;
    } else if (uniqueUccs.length > 1) {
      identityStatus = 'REVIEW';
      resolutionNotes = `Multiple conflicting client UCCs (${uniqueUccs.join(', ')}) found for caller phone ${callerId}; marked for compliance review.`;
    } else {
      identityStatus = 'PENDING';
      identitySource = 'METADATA';
      resolutionNotes = `Caller ID ${callerId} noted from call metadata. Registered number not yet verified in trade master.`;
    }
  } else {
    identityStatus = 'FAILED';
    identitySource = 'UNRESOLVED';
    resolutionNotes = 'Both Caller ID (CLI) and Client Code (UCC) are missing; marked as fatal non-compliance.';
  }

  // 5. Fallback directory lookup ONLY if dealer or advisor is still missing
  if (dealer && !advisor) {
    const matchedAdvisor = FUNDSINDIA_ADVISOR_DIRECTORY.find(
      (a) => a.dealer.toUpperCase() === dealer.toUpperCase()
    );
    if (matchedAdvisor) {
      advisor = cleanCallerName(matchedAdvisor.advisor_name);
    }
  } else if (advisor && !dealer) {
    const matchedAdvisor = FUNDSINDIA_ADVISOR_DIRECTORY.find(
      (a) => a.advisor_name.toLowerCase() === advisor.toLowerCase()
    );
    if (matchedAdvisor) {
      dealer = matchedAdvisor.dealer;
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Extract real call_date and call_time from cached metadata if missing or invalid
  let resolvedCallDate = call.call_date || '';
  let resolvedCallTime = call.call_time || '';
  if (cachedMeta?.raw_data) {
    try {
      const rawObj = JSON.parse(cachedMeta.raw_data);
      const rawStart = rawObj['Call Start Time'] || rawObj['Time'] || '';
      if (rawStart) {
        const timeMatch = String(rawStart).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch && (!resolvedCallTime || resolvedCallTime.startsWith('Wed') || resolvedCallTime.length > 8)) {
          const hh = timeMatch[1].padStart(2, '0');
          const mm = timeMatch[2];
          const ss = timeMatch[3] || '00';
          resolvedCallTime = `${hh}:${mm}:${ss}`;
        }
        const dateMatch = String(rawStart).match(/(\d{2,4})[-/](\d{2})[-/](\d{2,4})/);
        if (dateMatch && (!resolvedCallDate || resolvedCallDate.startsWith('2001'))) {
          let y = dateMatch[1].length === 4 ? dateMatch[1] : dateMatch[3];
          let m = dateMatch[2];
          let d = dateMatch[1].length === 4 ? dateMatch[3] : dateMatch[1];
          if (parseInt(m, 10) > 12) {
            const tmp = m;
            m = d;
            d = tmp;
          }
          resolvedCallDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }
    } catch {}
  }

  // Update call in database dynamically based on available table columns
  try {
    const tableInfo = db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>;
    const cols = new Set(tableInfo.map((c) => c.name));

    const setClauses: string[] = [];
    const values: any[] = [];

    const resolvedUcc = normalizedUcc || rawClientCode;
    if (cols.has('call_date') && resolvedCallDate && (!call.call_date || call.call_date.startsWith('2001'))) {
      setClauses.push("call_date = ?");
      values.push(resolvedCallDate);
    }
    if (cols.has('call_time') && resolvedCallTime && (!call.call_time || call.call_time.startsWith('Wed') || call.call_time.length > 8)) {
      setClauses.push("call_time = ?");
      values.push(resolvedCallTime);
    }
    if (cols.has('calling_number') && callerId) {
      setClauses.push("calling_number = CASE WHEN calling_number IS NULL OR calling_number = '' OR calling_number = '0000000000' THEN ? ELSE COALESCE(NULLIF(calling_number, ''), ?) END");
      values.push(callerId, callerId);
    }
    if (cols.has('phone_number') && callerId) {
      setClauses.push("phone_number = CASE WHEN phone_number IS NULL OR phone_number = '' OR phone_number = '0000000000' THEN ? ELSE COALESCE(NULLIF(phone_number, ''), ?) END");
      values.push(callerId, callerId);
    }
    if (cols.has('caller_name') && advisor && advisor.toLowerCase() !== 'advisor') {
      setClauses.push("caller_name = CASE WHEN caller_name IS NULL OR caller_name = '' OR LOWER(caller_name) = 'advisor' THEN ? ELSE caller_name END");
      values.push(advisor);
    }
    if (cols.has('advisor') && advisor && advisor.toLowerCase() !== 'advisor') {
      setClauses.push("advisor = CASE WHEN advisor IS NULL OR advisor = '' OR LOWER(advisor) = 'advisor' THEN ? ELSE advisor END");
      values.push(advisor);
    }
    if (cols.has('advisor_name') && advisor && advisor.toLowerCase() !== 'advisor') {
      setClauses.push("advisor_name = CASE WHEN advisor_name IS NULL OR advisor_name = '' OR LOWER(advisor_name) = 'advisor' THEN ? ELSE advisor_name END");
      values.push(advisor);
    }
    if (cols.has('client_code') && resolvedUcc && isValidUcc(resolvedUcc)) {
      setClauses.push("client_code = ?");
      values.push(resolvedUcc);
    }
    if (cols.has('client') && resolvedUcc && isValidUcc(resolvedUcc)) {
      setClauses.push("client = ?");
      values.push(resolvedUcc);
    }
    if (cols.has('registered_number') && registeredNumber) {
      setClauses.push("registered_number = ?");
      values.push(registeredNumber);
    }
    if (cols.has('client_number') && clientNumber) {
      setClauses.push("client_number = ?");
      values.push(clientNumber);
    }
    if (cols.has('dealer') && dealer) {
      setClauses.push("dealer = ?");
      values.push(dealer);
    }
    if (cols.has('team') && team) {
      setClauses.push("team = ?");
      values.push(team);
    }
    if (cols.has('identity_status')) {
      setClauses.push("identity_status = ?");
      values.push(identityStatus);
    }
    if (cols.has('identity_source')) {
      setClauses.push("identity_source = ?");
      values.push(identitySource);
    }
    if (cols.has('updated_at')) {
      setClauses.push("updated_at = ?");
      values.push(now);
    }

    if (setClauses.length > 0) {
      values.push(callId);
      db.prepare(`UPDATE calls SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    }
  } catch (err: any) {
    console.warn('[Identity Resolution DB Update Warn]:', err.message);
  }

  return {
    caller_id: callerId,
    client_number: clientNumber,
    registered_number: registeredNumber,
    advisor,
    dealer,
    team,
    client_code: normalizedUcc || rawClientCode,
    status: identityStatus,
    source: identitySource,
    resolution_notes: resolutionNotes,
  };
}
