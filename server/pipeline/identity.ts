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
import { normalizePhoneNumber, normalizeClientCode } from '../normalizer';
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

  // 1. Resolve Caller ID strictly from Telephony metadata (CLI) or Filename
  let rawCallerId = call.calling_number || call.phone_number || '';
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
  if (!rawClientCode && (call.original_filename || call.recording_name)) {
    const fn = call.original_filename || call.recording_name;
    const uccMatch = fn.match(/\b([A-Z]{2,4}[0-9]{3,7})\b/i);
    if (uccMatch) {
      rawClientCode = uccMatch[1].toUpperCase();
    }
  }

  // If transcript is available and rawClientCode is still missing or needs verification:
  if (call.transcript) {
    const spokenCandidates = extractSpokenUccCandidates(call.transcript);
    for (const cand of spokenCandidates) {
      const res = resolveUccWithAuthoritativeData(db, cand.cleanCandidate, rawClientCode, callerId);
      if (res.status === 'RESOLVED' && res.resolvedUcc) {
        rawClientCode = res.resolvedUcc;
        break;
      }
    }
  }

  const normalizedUcc = normalizeClientCode(rawClientCode);

  // 3. Resolve Advisor, Dealer, and Team
  let dealer = call.dealer || '';
  let advisor = call.caller_name || '';
  let team = call.team || 'Equity';

  if (dealer && !advisor) {
    const matchedAdvisor = FUNDSINDIA_ADVISOR_DIRECTORY.find(
      (a) => a.dealer.toUpperCase() === dealer.toUpperCase()
    );
    if (matchedAdvisor) {
      advisor = matchedAdvisor.advisor_name;
    }
  } else if (advisor && !dealer) {
    const matchedAdvisor = FUNDSINDIA_ADVISOR_DIRECTORY.find(
      (a) => a.advisor_name.toLowerCase() === advisor.toLowerCase()
    );
    if (matchedAdvisor) {
      dealer = matchedAdvisor.dealer;
    }
  }

  // 4. Look up registered number in trades or existing master records
  // COMPLIANCE RULE: Never set registered number equal to calling number as a fallback!
  let registeredNumber = call.registered_number || '';
  let clientNumber = call.client_number || '';

  let identityStatus: IdentityStatus = 'PENDING';
  let identitySource: IdentitySource = 'METADATA';
  let resolutionNotes = '';

  const tradesForClient = normalizedUcc
    ? (db.prepare('SELECT * FROM trades WHERE client = ? OR client_number = ?').all(normalizedUcc, normalizedUcc) as unknown as TradeRecord[])
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
        if (!dealer && matchingTradePhone.dealer) dealer = matchingTradePhone.dealer;
        if (!advisor && matchingTradePhone.advisor_name) advisor = matchingTradePhone.advisor_name;
        if (!team && matchingTradePhone.team) team = matchingTradePhone.team;
        resolutionNotes = 'Authoritative exact 3-way match across metadata and trade records.';
      } else {
        // Trade has different phone than calling number!
        const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
        registeredNumber = normalizePhoneNumber(tradePhone);
        identityStatus = 'CONFIRMED';
        identitySource = 'METADATA';
        resolutionNotes = `Confirmed client UCC ${normalizedUcc}. Note: Calling CLI (${callerId}) differs from registered trade phone (${registeredNumber}).`;
      }
    } else {
      // UCC and phone present from metadata, but no trades uploaded yet
      // Do NOT set registeredNumber = callerId as fallback!
      identityStatus = 'CONFIRMED';
      identitySource = 'METADATA';
      resolutionNotes = 'Identity confirmed from call metadata. Awaiting trade records to verify registered phone.';
    }
  } else if (normalizedUcc && !callerId) {
    if (tradesForClient.length > 0) {
      const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
      registeredNumber = normalizePhoneNumber(tradePhone);
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
      if (!dealer && matchedTrade.dealer) dealer = matchedTrade.dealer;
      if (!advisor && matchedTrade.advisor_name) advisor = matchedTrade.advisor_name;
      if (!team && matchedTrade.team) team = matchedTrade.team;
      resolutionNotes = `Identity confirmed from trade records: phone ${callerId} registered to client ${uniqueUcc}.`;
    } else if (uniqueUccs.length > 1) {
      identityStatus = 'REVIEW';
      resolutionNotes = `Multiple conflicting client UCCs (${uniqueUccs.join(', ')}) found for caller phone ${callerId}; marked for compliance review.`;
    } else {
      // Phone present in metadata, but trade not uploaded yet
      // Do NOT set registeredNumber = callerId as fallback!
      identityStatus = 'PENDING';
      identitySource = 'METADATA';
      resolutionNotes = `Caller ID ${callerId} noted from call metadata. Registered number not yet verified in trade master.`;
    }
  } else {
    identityStatus = 'FAILED';
    resolutionNotes = 'No phone number, caller ID, or client code could be determined from call metadata.';
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Update call in database dynamically based on available table columns
  try {
    const tableInfo = db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>;
    const cols = new Set(tableInfo.map((c) => c.name));

    const setClauses: string[] = [];
    const values: any[] = [];

    const addClause = (col: string, val: any, coalesceVal = true) => {
      if (cols.has(col)) {
        if (coalesceVal) {
          setClauses.push(`${col} = COALESCE(NULLIF(${col}, ''), ?)`);
        } else {
          setClauses.push(`${col} = ?`);
        }
        values.push(val);
      }
    };

    addClause('calling_number', callerId);
    addClause('phone_number', callerId);
    addClause('registered_number', registeredNumber);
    addClause('client', normalizedUcc || rawClientCode);
    addClause('client_code', normalizedUcc || rawClientCode);
    addClause('client_number', clientNumber);
    addClause('dealer', dealer);
    addClause('advisor', advisor);
    addClause('advisor_name', advisor);
    addClause('caller_name', advisor);
    addClause('team', team);
    addClause('identity_status', identityStatus, false);
    addClause('identity_source', identitySource, false);
    addClause('updated_at', now, false);

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
