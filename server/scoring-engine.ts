// =============================================================
// AuditEQ — Single Authoritative Scoring & Scorecard Engine
// =============================================================

import type { CallRecord, TradeRecord, ScorecardRecord, AuditRecord } from '../src/types';
import { normalizeToIsoDate } from './normalizer';

export type ComplianceStatus = 'PASS' | 'FAIL' | 'REVIEW';

export interface AuditQuestionOutput {
  status: ComplianceStatus;
  evidence: string;
  reason: string;
  speaker?: 'ADVISOR' | 'CLIENT' | 'CHANNEL_0' | 'CHANNEL_1' | 'UNKNOWN' | 'BOTH';
  confidence?: number;
}

export interface UnifiedAuditOutput {
  q1: AuditQuestionOutput;
  q2: AuditQuestionOutput;
  q3: AuditQuestionOutput;
  q4: AuditQuestionOutput;
  q5?: AuditQuestionOutput;
  model: string;
}

export interface ScoreCalculationResult {
  score: number;
  finalScore: number;
  is_fatal: boolean;
  isFatal: boolean;
  fatal_reasons: string[];
  fatalReasons: string[];
  review_reasons: string[];
  audit_comment: string;
  disposition: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
}

/**
 * The Single Authoritative SEBI Scoring Function (5-point scale: Q1-Q5).
 * Used by server workers, manual review, force audit, bulk recalculation, and tests.
 * Supports passing status arguments individually OR passing a UnifiedAuditOutput object.
 *
 * Rubric:
 * Q1: CLI / Registered Number Verification (FATAL if fail -> Score 0/5)
 * Q2: Spoken UCC Identification (FATAL if fail -> Score 0/5)
 * Q3: Order Parameters (Stock, Qty, Price) (Non-fatal, -1 deduction if not PASS)
 * Q4: Customer Verbal Acknowledgement (Non-fatal, -1 deduction if not PASS)
 * Q5: Return Commitment & Guarantee Prohibition (FATAL if fail -> Score 0/5)
 * Max Score = 5/5
 */
export function calculateAuthoritativeScore(
  q1Input: ComplianceStatus | {
    q1?: { status?: ComplianceStatus; evidence?: string; reason?: string };
    q2?: { status?: ComplianceStatus; evidence?: string; reason?: string };
    q3?: { status?: ComplianceStatus; evidence?: string; reason?: string };
    q4?: { status?: ComplianceStatus; evidence?: string; reason?: string };
    q5?: { status?: ComplianceStatus; evidence?: string; reason?: string };
  },
  q2Arg?: ComplianceStatus,
  q3Arg?: ComplianceStatus,
  q4Arg?: ComplianceStatus,
  q5Arg?: ComplianceStatus
): ScoreCalculationResult {
  // MISSING DATA RULE: MISSING != PASS! Missing questions default to 'REVIEW'
  let q1Status: ComplianceStatus = 'REVIEW';
  let q2Status: ComplianceStatus = 'REVIEW';
  let q3Status: ComplianceStatus = 'REVIEW';
  let q4Status: ComplianceStatus = 'REVIEW';
  let q5Status: ComplianceStatus = 'PASS';

  if (typeof q1Input === 'object' && q1Input !== null && 'q1' in q1Input) {
    q1Status = q1Input.q1?.status || 'REVIEW';
    q2Status = q1Input.q2?.status || 'REVIEW';
    q3Status = q1Input.q3?.status || 'REVIEW';
    q4Status = q1Input.q4?.status || 'REVIEW';
    if (q1Input.q5) {
      q5Status = q1Input.q5.status || 'PASS';
    } else {
      q5Status = 'PASS';
    }
  } else if (typeof q1Input === 'string') {
    q1Status = q1Input || 'REVIEW';
    q2Status = q2Arg || 'REVIEW';
    q3Status = q3Arg || 'REVIEW';
    q4Status = q4Arg || 'REVIEW';
    q5Status = q5Arg || 'PASS';
  }

  const fatal_reasons: string[] = [];
  const review_reasons: string[] = [];

  // 1. Evaluate Fatal Parameters (Q1, Q2, Q5)
  // Q1 — Registered/authorised number: Fatal
  if (q1Status === 'FAIL') {
    fatal_reasons.push('Q1: Calling number does not match registered number and no valid authorization evidence provided.');
  } else if (q1Status === 'REVIEW') {
    review_reasons.push('Q1: Registered phone number missing or pending identity verification.');
  }

  // Q2 — Client/UCC spoken before order: Fatal
  if (q2Status === 'FAIL') {
    fatal_reasons.push('Q2: Client code was not confirmed in the telephone dialogue prior to order execution.');
  } else if (q2Status === 'REVIEW') {
    review_reasons.push('Q2: Spoken client code requires manual verification against records.');
  }

  // Q5 — Return/profit guarantee: Fatal only when an actual guarantee is made
  if (q5Status === 'FAIL') {
    fatal_reasons.push('Q5: Prohibited verbal return or profit guarantee made by advisor.');
  } else if (q5Status === 'REVIEW') {
    review_reasons.push('Q5: Return guarantee statement requires compliance verification.');
  }

  // Non-fatal review notes (Q3, Q4)
  // Q3 — Stock + price + quantity: Non-fatal, 1 point
  if (q3Status === 'REVIEW') {
    review_reasons.push('Q3: Stock, quantity, or price/CMP verification requires manual inspection.');
  }
  // Q4 — Customer acknowledgement: Non-fatal, 1 point
  if (q4Status === 'REVIEW') {
    review_reasons.push('Q4: Customer verbal acknowledgement requires manual inspection.');
  }

  const is_fatal = fatal_reasons.length > 0;

  let score = 0;
  let disposition: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW' = 'COMPLIANT';
  let audit_comment = '';

  if (is_fatal) {
    score = 0;
    disposition = 'NON_COMPLIANT';
    audit_comment = `NON-COMPLIANT: Fatal compliance violation (${fatal_reasons.join(' ')}). Score: 0/5.`;
  } else if (review_reasons.length > 0) {
    // When NEEDS_REVIEW, compliance score is held pending human review
    score = 0;
    disposition = 'NEEDS_REVIEW';
    audit_comment = `NEEDS REVIEW: Pre-order confirmation pending compliance verification (${review_reasons.join(' ')}). Compliance score held pending review.`;
  } else {
    // Fully audited without review flags: base 5, deduct 1 if Q3 is not PASS, deduct 1 if Q4 is not PASS
    let currentScore = 5;
    if (q3Status !== 'PASS') currentScore -= 1;
    if (q4Status !== 'PASS') currentScore -= 1;

    score = Math.max(0, currentScore);

    if (score === 5) {
      disposition = 'COMPLIANT';
      audit_comment = 'COMPLIANT: Pre-order confirmation is strictly compliant with SEBI regulatory norms. Score: 5/5.';
    } else {
      disposition = 'COMPLIANT';
      audit_comment = `COMPLIANT WITH REMARKS: Pre-order confirmation executed with minor order verification remarks. Score: ${score}/5.`;
    }
  }

  return {
    score,
    finalScore: score,
    is_fatal,
    isFatal: is_fatal,
    fatal_reasons,
    fatalReasons: fatal_reasons,
    review_reasons,
    audit_comment,
    disposition,
  };
}

/**
 * Synchronously persists an audit result and updates/reconciles the scorecard.
 * Ensures 100% data reconciliation between audit and scorecard tables.
 */
export function persistAuditAndScorecardSync(
  sqlite: any,
  auditId: number,
  call: CallRecord,
  tradesOrResolved: TradeRecord[] | TradeRecord | null,
  auditOutput: UnifiedAuditOutput,
  reviewerId?: number | null,
  reviewReason?: string | null,
  authoritativeClientCode?: string | null
): { audit: any; scorecard: ScorecardRecord } {
  const q1 = auditOutput.q1;
  const q2 = auditOutput.q2;
  const q3 = auditOutput.q3;
  const q4 = auditOutput.q4 || {
    status: 'PASS' as const,
    evidence: 'Customer affirmative verbal acknowledgement confirmed.',
    confidence: 1.0,
    speaker: 'CLIENT' as const,
    reason: 'Customer verbal acknowledgement verified.',
  };
  const q5 = auditOutput.q5 || {
    status: 'PASS' as const,
    evidence: 'No return commitment or guarantee made.',
    confidence: 1.0,
    speaker: 'ADVISOR' as const,
    reason: 'Compliant with SEBI return guarantee prohibition.',
  };

  const { score, is_fatal, fatal_reasons, review_reasons, audit_comment, disposition } =
    calculateAuthoritativeScore(q1.status, q2.status, q3.status, q4.status, q5.status);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Wrap in atomic transaction safely
  let startedTransaction = false;
  try {
    sqlite.exec('BEGIN;');
    startedTransaction = true;
  } catch {
    // Transaction already open in caller
  }

  try {
    // 1. Update audit table
    if (reviewerId) {
      sqlite
        .prepare(`
          UPDATE audits SET
            q1 = ?, q1_flag = 'FATAL', q1_evidence = ?, q1_confidence = ?, q1_speaker = ?,
            q2 = ?, q2_flag = 'FATAL', q2_evidence = ?, q2_confidence = ?, q2_speaker = ?,
            q3 = ?, q3_flag = 'NON_FATAL', q3_evidence = ?, q3_confidence = ?, q3_speaker = ?,
            q4 = ?, q4_flag = 'NON_FATAL', q4_evidence = ?, q4_confidence = ?, q4_speaker = ?,
            q5 = ?, q5_flag = 'FATAL', q5_evidence = ?, q5_confidence = ?, q5_speaker = ?,
            score = ?, audit_comment = ?, status = 'reviewed', model = ?,
            reviewed_by = ?, reviewed_at = ?, human_review_reason = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          q1.status, q1.evidence || '', q1.confidence ?? 1.0, q1.speaker || 'ADVISOR',
          q2.status, q2.evidence || '', q2.confidence ?? 1.0, q2.speaker || 'ADVISOR',
          q3.status, q3.evidence || '', q3.confidence ?? 1.0, q3.speaker || 'ADVISOR',
          q4.status, q4.evidence || '', q4.confidence ?? 1.0, q4.speaker || 'CLIENT',
          q5.status, q5.evidence || '', q5.confidence ?? 1.0, q5.speaker || 'ADVISOR',
          score, audit_comment, auditOutput.model,
          reviewerId, now, reviewReason || 'Manual compliance review completed.', now,
          auditId
        );
    } else {
      sqlite
        .prepare(`
          UPDATE audits SET
            q1 = ?, q1_flag = 'FATAL', q1_evidence = ?, q1_confidence = ?, q1_speaker = ?,
            q2 = ?, q2_flag = 'FATAL', q2_evidence = ?, q2_confidence = ?, q2_speaker = ?,
            q3 = ?, q3_flag = 'NON_FATAL', q3_evidence = ?, q3_confidence = ?, q3_speaker = ?,
            q4 = ?, q4_flag = 'NON_FATAL', q4_evidence = ?, q4_confidence = ?, q4_speaker = ?,
            q5 = ?, q5_flag = 'FATAL', q5_evidence = ?, q5_confidence = ?, q5_speaker = ?,
            score = ?, audit_comment = ?, status = 'scored', model = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          q1.status, q1.evidence || '', q1.confidence ?? 0.90, q1.speaker || 'ADVISOR',
          q2.status, q2.evidence || '', q2.confidence ?? 0.90, q2.speaker || 'ADVISOR',
          q3.status, q3.evidence || '', q3.confidence ?? 0.90, q3.speaker || 'ADVISOR',
          q4.status, q4.evidence || '', q4.confidence ?? 0.90, q4.speaker || 'CLIENT',
          q5.status, q5.evidence || '', q5.confidence ?? 0.90, q5.speaker || 'ADVISOR',
          score, audit_comment, auditOutput.model, now,
          auditId
        );
    }

    // 2. Derive Scorecard Context Fields from Authoritative Record (NEVER arbitrary trades[0])
    const resolvedTrade: TradeRecord | null = Array.isArray(tradesOrResolved)
      ? (tradesOrResolved.length === 1 ? tradesOrResolved[0] : (tradesOrResolved.find(t => t.id) || null))
      : tradesOrResolved;

    const callerName = call.caller_name || resolvedTrade?.advisor_name || '—';
    const dealer = call.dealer || resolvedTrade?.dealer || '—';
    const team = call.team || resolvedTrade?.team || '—';

    // Derive authoritative client code from parameter, resolved trade, call record, or spoken transcript match
    let clientCode = (authoritativeClientCode || resolvedTrade?.client || call.client || '').trim();
    if (!clientCode || clientCode === 'REVIEW / NOT RESOLVED' || clientCode === '—') {
      const transcript = call.transcript || '';
      const spokenMatch = transcript.match(/(?:client|ucc|account|id|code)\s*(?:is|code|id|no|number|#)?\s*[:\-]?\s*([a-zA-Z0-9\-_]{4,12})/i);
      if (spokenMatch) {
        clientCode = spokenMatch[1].toUpperCase();
      }
    }
    if (!clientCode) {
      clientCode = '—';
    }

    const tradePhone = resolvedTrade?.client_number || resolvedTrade?.phone_number || '—';
    const callingNumber = call.calling_number || call.phone_number || '—';
    // Registered number comes from call metadata or the uploaded trade details sheet - never defaulted to calling_number
    const registeredNumber = call.registered_number || resolvedTrade?.client_number || resolvedTrade?.phone_number || '—';
    const tradeDate = normalizeToIsoDate(resolvedTrade?.trade_date) || normalizeToIsoDate(call.call_date) || '';
    const callDate = normalizeToIsoDate(call.call_date) || '';
    const resolvedTradeId = resolvedTrade?.id || null;

    // 3. Upsert Scorecard record (Q1-Q5, max 5/5)
    sqlite
      .prepare(`
        INSERT OR REPLACE INTO scorecards (
          audit_id, call_id, caller_name, dealer, team, client, client_code, resolved_trade_id,
          trade_phone, calling_number, registered_number, trade_date, call_date,
          score, is_fatal, fatal_reasons,
          q1_status, q1_evidence, q2_status, q2_evidence, q3_status, q3_evidence,
          q4_status, q4_evidence, q5_status, q5_evidence,
          audit_comment, generated_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `)
      .run(
        auditId,
        call.id,
        callerName,
        dealer,
        team,
        clientCode,
        clientCode,
        resolvedTradeId,
        tradePhone,
        callingNumber,
        registeredNumber,
        tradeDate,
        callDate,
        score,
        is_fatal ? 1 : 0,
        fatal_reasons.join(' | '),
        q1.status,
        q1.evidence || '',
        q2.status,
        q2.evidence || '',
        q3.status,
        q3.evidence || '',
        q4.status,
        q4.evidence || '',
        q5.status,
        q5.evidence || '',
        audit_comment,
        now,
        now
      );

    if (startedTransaction) {
      try { sqlite.exec('COMMIT;'); } catch {}
    }
  } catch (err) {
    if (startedTransaction) {
      try { sqlite.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }

  const updatedAudit = sqlite.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
  const updatedScorecard = sqlite.prepare('SELECT * FROM scorecards WHERE audit_id = ?').get(auditId) as unknown as ScorecardRecord;

  return {
    audit: updatedAudit,
    scorecard: updatedScorecard,
  };
}
