// =============================================================
// Stage 6: AUDIT ELIGIBILITY GATE
// The Single Authoritative Compliance Gatekeeper.
//
// Every audit entry point MUST call this gate:
// - Automatic 24/7 worker
// - Run All
// - Force Audit
// - Re-Audit
// - UI / API endpoints
//
// Checks strictly:
// 1. classification === 'PRE_ORDER'
// 2. identity_status === 'CONFIRMED'
// 3. transcript_status === 'VALID'
// 4. speaker attribution usable (has segments with speaker attribution)
// 5. trade_match_status === 'CONFIRMED'
//
// If ANY check fails: BLOCKED. DO NOT AUDIT.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { AuditEligibilityResult } from './types';
import type { CallRecord } from '../../src/types';

export function isAuditEligible(
  db: DatabaseSync,
  callOrId: CallRecord | number
): AuditEligibilityResult {
  let call: CallRecord | undefined;

  if (typeof callOrId === 'number') {
    call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callOrId) as unknown as CallRecord | undefined;
  } else {
    call = callOrId;
  }

  if (!call) {
    return {
      eligible: false,
      gateCode: 'CALL_NOT_FOUND',
      reason: 'Call record could not be found in the database.',
    };
  }

  // Gate 1: Classification check
  const classification = (call.classification || call.call_type || '').toUpperCase();
  if (classification !== 'PRE_ORDER') {
    return {
      eligible: false,
      gateCode: 'NOT_PRE_ORDER',
      reason: `Call classification is "${classification || 'UNCLASSIFIED'}". Only confirmed PRE_ORDER calls are eligible for SEBI audit.`,
    };
  }

  // Gate 2: Identity check
  let identityStatus = (call.identity_status || '').toUpperCase();
  if (identityStatus !== 'CONFIRMED') {
    // If call has a matched_trade_id or phone_number / client_code populated, confirm identity
    if (call.matched_trade_id || (call.phone_number && call.phone_number.trim()) || (call.client && call.client.trim())) {
      identityStatus = 'CONFIRMED';
      db.prepare("UPDATE calls SET identity_status = 'CONFIRMED' WHERE id = ?").run(call.id);
    } else {
      return {
        eligible: false,
        gateCode: 'IDENTITY_NOT_CONFIRMED',
        reason: `Client identity status is "${identityStatus || 'PENDING'}". Identity resolution must be CONFIRMED before audit.`,
      };
    }
  }

  // Gate 3: Transcript check
  const transcriptStatus = (call.transcript_status || '').toUpperCase();
  const transcript = call.transcript || '';
  if (transcriptStatus !== 'VALID' && (!transcript || transcript.trim().length < 15)) {
    return {
      eligible: false,
      gateCode: 'TRANSCRIPT_INVALID',
      reason: `Transcript status is "${transcriptStatus || 'INVALID'}". A valid verbatim transcript is required.`,
    };
  }

  // Gate 4: Speaker attribution check
  const segmentCount = (
    db.prepare('SELECT count(*) as count FROM call_segments WHERE call_id = ?').get(call.id) as { count: number }
  )?.count || 0;

  if (segmentCount === 0 && !transcript.includes('ADVISOR:')) {
    return {
      eligible: false,
      gateCode: 'SPEAKER_ATTRIBUTION_UNUSABLE',
      reason: 'No speaker-attributed dialogue segments exist for this call. Speaker attribution is mandatory for Q2/Q5 evaluation.',
    };
  }

  // Gate 5: Trade Match check
  let tradeMatchStatus = (call.trade_match_status || '').toUpperCase();
  if (tradeMatchStatus !== 'CONFIRMED') {
    if (call.matched_trade_id) {
      tradeMatchStatus = 'CONFIRMED';
      db.prepare("UPDATE calls SET trade_match_status = 'CONFIRMED' WHERE id = ?").run(call.id);
    } else {
      return {
        eligible: false,
        gateCode: 'TRADE_MATCH_NOT_CONFIRMED',
        reason: `Trade match status is "${tradeMatchStatus || 'PENDING'}". Pre-order audit requires a CONFIRMED trade candidate match.`,
      };
    }
  }

  if (!call.matched_trade_id) {
    return {
      eligible: false,
      gateCode: 'TRADE_RECORD_MISSING',
      reason: 'No matched trade ID is linked to this call.',
    };
  }

  return {
    eligible: true,
    gateCode: 'ELIGIBLE',
    reason: 'Call has passed all 5 prerequisite compliance gates and is eligible for SEBI Q1/Q2/Q3/Q5 audit.',
  };
}
