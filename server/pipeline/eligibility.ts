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
// 1. classification === 'PRE_ORDER' (spoken order intent verified)
// 2. identity_status === 'CONFIRMED' (client UCC / account verified)
// 3. transcript_status === 'VALID' (valid verbatim transcript)
// 4. speaker attribution usable (has dialogue segments)
//
// CRITICAL ARCHITECTURAL MANDATE:
// Execution matching status (CONFIRMED / PARTIAL / NO_MATCH / REVIEW)
// must NEVER gate or block compliance auditing. Every genuine pre-order
// dialogue must be audited for regulatory compliance regardless of whether
// an executed trade was found, cancelled, or pending.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { AuditEligibilityResult } from './types';
import type { CallRecord } from '../../src/types';
import { isValidUcc } from './uccResolver';

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

  // Gate 1: Classification check (Spoken Order Intent)
  const classification = (call.classification || call.call_type || '').toUpperCase();
  if (classification !== 'PRE_ORDER') {
    return {
      eligible: false,
      gateCode: 'NOT_PRE_ORDER',
      reason: `Call classification is "${classification || 'UNCLASSIFIED'}". Only confirmed PRE_ORDER calls are eligible for SEBI compliance audit.`,
    };
  }

  // Gate 2: Identity check (SEBI Mandate: Valid Client UCC is mandatory for compliance audit; phone-only is not enough)
  let identityStatus = (call.identity_status || '').toUpperCase();
  const rawCode = (call.client_code || call.client || '').trim();
  const hasValidClientCode = Boolean(rawCode && isValidUcc(rawCode));

  if (!hasValidClientCode) {
    return {
      eligible: false,
      gateCode: 'IDENTITY_NOT_CONFIRMED',
      reason: `Client identity unconfirmed: Valid client UCC is required before SEBI compliance audit. Found: "${rawCode || 'NONE'}".`,
    };
  }

  if (identityStatus !== 'CONFIRMED') {
    identityStatus = 'CONFIRMED';
    try {
      db.prepare("UPDATE calls SET identity_status = 'CONFIRMED' WHERE id = ?").run(call.id);
    } catch {}
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

  if (segmentCount === 0 && !transcript.toUpperCase().includes('ADVISOR:') && !transcript.toUpperCase().includes('DEALER:')) {
    return {
      eligible: false,
      gateCode: 'SPEAKER_ATTRIBUTION_UNUSABLE',
      reason: 'No speaker-attributed dialogue segments exist for this call. Speaker attribution is mandatory for Q2/Q4/Q5 evaluation.',
    };
  }

  return {
    eligible: true,
    gateCode: 'ELIGIBLE',
    reason: 'Call passed all pre-order compliance gates (spoken order intent and client identity confirmed). Eligible for compliance audit.',
  };
}
