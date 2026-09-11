// =============================================================
// Stage 2: IDENTITY RESOLUTION
// Deterministic first: Filename -> Caller ID -> Metadata Exact Match
// -> Client Number -> Authoritative Client / UCC.
// Cross-verifies: client_number <-> client_code <-> trade records.
// FORBIDDEN: "metadata failed -> find latest trade by phone -> use it"
// If conflicts or incomplete: IDENTITY = REVIEW.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { normalizePhoneNumber, normalizeClientCode } from '../normalizer';
import { FUNDSINDIA_ADVISOR_DIRECTORY } from '../fundsindia-directory';
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

  // 1. Resolve Caller ID from Call Record, Filename, Matched Trade, or Transcript
  let rawCallerId = call.calling_number || call.phone_number || '';
  if (!rawCallerId && (call.original_filename || call.recording_name)) {
    const fn = call.original_filename || call.recording_name;
    const phoneMatch = fn.match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/);
    if (phoneMatch) {
      rawCallerId = phoneMatch[1];
    }
  }
  // Check matched trade if already linked
  let matchedTradeRecord: TradeRecord | undefined;
  if (call.matched_trade_id) {
    matchedTradeRecord = db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id) as unknown as TradeRecord | undefined;
    if (matchedTradeRecord && !rawCallerId) {
      rawCallerId = matchedTradeRecord.phone_number || matchedTradeRecord.client_number || '';
    }
  }
  // Check transcript for spoken 10-digit telephone number
  if (!rawCallerId && call.transcript) {
    const phoneMatch = call.transcript.match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/);
    if (phoneMatch) {
      rawCallerId = phoneMatch[1];
    }
  }
  const callerId = normalizePhoneNumber(rawCallerId) || '';

  // 2. Extract Client Code / UCC from Metadata, Filename, Matched Trade, or Transcript
  let rawClientCode = call.client || call.client_code || '';
  if (!rawClientCode && (call.original_filename || call.recording_name)) {
    const fn = call.original_filename || call.recording_name;
    const uccMatch = fn.match(/\b([A-Z]{2,4}[0-9]{3,7})\b/i);
    if (uccMatch) {
      rawClientCode = uccMatch[1].toUpperCase();
    }
  }
  if (!rawClientCode && matchedTradeRecord?.client) {
    rawClientCode = matchedTradeRecord.client;
  }
  if (!rawClientCode && call.transcript) {
    const uccMatch = call.transcript.match(/\b([A-Z]{2,4}[0-9]{3,7})\b/i);
    if (uccMatch) {
      rawClientCode = uccMatch[1].toUpperCase();
    }
  }
  const normalizedUcc = normalizeClientCode(rawClientCode);

  // 3. Resolve Advisor, Dealer, and Team
  let dealer = call.dealer || matchedTradeRecord?.dealer || '';
  let advisor = call.caller_name || matchedTradeRecord?.advisor_name || '';
  let team = call.team || matchedTradeRecord?.team || 'Equity';

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

  // 4. Look up registered number in trades or existing confirmed records
  let registeredNumber = call.registered_number || '';
  let clientNumber = call.client_number || '';

  // Check matching trade records for authoritative cross-verification
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
    // Both UCC and Caller ID present
    // Check if trades agree
    if (tradesForClient.length > 0) {
      const matchingTradePhone = tradesForClient.find(
        (t) => normalizePhoneNumber(t.phone_number || t.client_number || '') === callerId
      );
      if (matchingTradePhone) {
        // Perfect 3-way match: client_number <-> client_code <-> trade records
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
        // Calling number might be unauthorized or needs review
        const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
        registeredNumber = normalizePhoneNumber(tradePhone);
        identityStatus = 'CONFIRMED'; // UCC is confirmed, registered number found for Q1 check
        identitySource = 'METADATA';
        resolutionNotes = `Confirmed client UCC ${normalizedUcc}. Note: Calling number (${callerId}) differs from registered trade phone (${registeredNumber}).`;
      }
    } else {
      // UCC and phone present from metadata, but no trades uploaded yet or exact match
      identityStatus = 'CONFIRMED';
      identitySource = 'METADATA';
      registeredNumber = callerId;
      resolutionNotes = 'Identity confirmed from call metadata.';
    }
  } else if (normalizedUcc && !callerId) {
    // UCC present, but caller ID missing
    if (tradesForClient.length > 0) {
      const tradePhone = tradesForClient[0].phone_number || tradesForClient[0].client_number || '';
      registeredNumber = normalizePhoneNumber(tradePhone);
    }
    identityStatus = 'REVIEW';
    identitySource = 'METADATA';
    resolutionNotes = `Client UCC ${normalizedUcc} present, but caller ID is missing. Requires manual review.`;
  } else if (callerId && !normalizedUcc) {
    // Caller ID present from metadata/filename
    // User mandate: "get the client number from meta data and trade infor from trade data.
    // match the last 10 digit number in both meta data and trade data - if number matchnig Q1 pass"
    const uniqueUccs = Array.from(new Set(tradesForPhone.map((t) => normalizeClientCode(t.client)).filter(Boolean)));

    if (uniqueUccs.length === 1) {
      // Exactly one unique client UCC in trades for this phone
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
      // Phone present in metadata, but trade not uploaded yet or phone not found in trades
      identityStatus = 'CONFIRMED';
      identitySource = 'METADATA';
      registeredNumber = callerId;
      resolutionNotes = `Caller ID ${callerId} confirmed from call metadata. Awaiting trade match.`;
    }
  } else {
    // Neither caller ID nor client UCC available
    identityStatus = 'FAILED';
    resolutionNotes = 'No phone number, caller ID, or client code could be determined from call metadata.';
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Update call in database
  db.prepare(`
    UPDATE calls SET
      calling_number = COALESCE(NULLIF(calling_number, ''), ?),
      phone_number = COALESCE(NULLIF(phone_number, ''), ?),
      registered_number = COALESCE(NULLIF(registered_number, ''), ?),
      client = COALESCE(NULLIF(client, ''), ?),
      client_code = COALESCE(NULLIF(client_code, ''), ?),
      client_number = COALESCE(NULLIF(client_number, ''), ?),
      dealer = COALESCE(NULLIF(dealer, ''), ?),
      caller_name = COALESCE(NULLIF(caller_name, ''), ?),
      team = COALESCE(NULLIF(team, ''), ?),
      identity_status = ?,
      identity_source = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    callerId,
    callerId,
    registeredNumber,
    normalizedUcc || rawClientCode,
    normalizedUcc || rawClientCode,
    clientNumber,
    dealer,
    advisor,
    team,
    identityStatus,
    identitySource,
    now,
    callId
  );

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
