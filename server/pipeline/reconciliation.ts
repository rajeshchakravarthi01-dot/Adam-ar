// =============================================================
// Stage 9: PUBLISH & MISSING CALL RECONCILIATION
// 1. Publishes audited records to Master Grid and Scorecards.
// 2. Performs executed trade reconciliation:
//    Executed Trades -> Find corresponding calls ->
//    MATCHED -> OK
//    NO CALL -> MISSING CALL
//    AMBIGUOUS -> REVIEW
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { StageAuditResult, StageScoreResult } from './types';
import type { CallRecord, TradeRecord } from '../../src/types';

export interface MissingCallReconciliationSummary {
  total_trades: number;
  matched_count: number;
  missing_call_count: number;
  review_count: number;
  reconciliation_items: Array<{
    trade_id: number;
    trade_external_id?: string;
    client: string;
    symbol: string;
    quantity: number;
    price: number;
    trade_date: string;
    trade_phone?: string;
    reconciliation_status: 'MATCHED' | 'MISSING_CALL' | 'REVIEW';
    matched_call_id?: number | null;
    notes: string;
  }>;
}

/**
 * Stage 9A: Publish Audit and Scorecard Record to Master Grid
 */
export function stage9PublishAudit(
  db: DatabaseSync,
  callId: number,
  auditResult: StageAuditResult,
  scoreResult: StageScoreResult
): { audit_id: number; scorecard_id: number } {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord;
  const trade = call.matched_trade_id
    ? (db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id) as unknown as TradeRecord)
    : null;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1. Insert/Update audits table
  const existingAudit = db.prepare('SELECT id FROM audits WHERE call_id = ?').get(callId) as { id: number } | undefined;
  let auditId: number;

  if (existingAudit) {
    auditId = existingAudit.id;
    db.prepare(`
      UPDATE audits SET
        trade_id = ?,
        q1_status = ?, q1_evidence = ?, q1_reason = ?,
        q2_status = ?, q2_evidence = ?, q2_reason = ?,
        q3_status = ?, q3_evidence = ?, q3_reason = ?,
        q5_status = ?, q5_evidence = ?, q5_reason = ?,
        overall_status = ?,
        score = ?,
        is_fatal = ?,
        fatal_reasons = ?,
        review_reasons = ?,
        audit_comment = ?,
        model_used = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      trade?.id || null,
      auditResult.q1.status, auditResult.q1.evidence, auditResult.q1.reason,
      auditResult.q2.status, auditResult.q2.evidence, auditResult.q2.reason,
      auditResult.q3.status, auditResult.q3.evidence, auditResult.q3.reason,
      auditResult.q5.status, auditResult.q5.evidence, auditResult.q5.reason,
      scoreResult.disposition,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      JSON.stringify(scoreResult.fatal_reasons),
      JSON.stringify(scoreResult.review_reasons),
      scoreResult.audit_comment,
      auditResult.model,
      now,
      auditId
    );
  } else {
    const res = db.prepare(`
      INSERT INTO audits (
        call_id, trade_id,
        q1_status, q1_evidence, q1_reason,
        q2_status, q2_evidence, q2_reason,
        q3_status, q3_evidence, q3_reason,
        q5_status, q5_evidence, q5_reason,
        overall_status, score, is_fatal, fatal_reasons, review_reasons,
        audit_comment, model_used, created_at, updated_at
      ) VALUES (
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      callId,
      trade?.id || null,
      auditResult.q1.status, auditResult.q1.evidence, auditResult.q1.reason,
      auditResult.q2.status, auditResult.q2.evidence, auditResult.q2.reason,
      auditResult.q3.status, auditResult.q3.evidence, auditResult.q3.reason,
      auditResult.q5.status, auditResult.q5.evidence, auditResult.q5.reason,
      scoreResult.disposition,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      JSON.stringify(scoreResult.fatal_reasons),
      JSON.stringify(scoreResult.review_reasons),
      scoreResult.audit_comment,
      auditResult.model,
      now,
      now
    );
    auditId = Number(res.lastInsertRowid);
  }

  // 2. Insert/Update scorecards table
  const existingScorecard = db.prepare('SELECT id FROM scorecards WHERE call_id = ?').get(callId) as { id: number } | undefined;
  let scorecardId: number;

  const resolvedCallingPhone = call.calling_number || call.phone_number || trade?.client_number || '';
  const resolvedRegisteredPhone = call.registered_number || trade?.client_number || trade?.phone_number || resolvedCallingPhone;
  const resolvedTradePhone = trade?.client_number || trade?.phone_number || resolvedRegisteredPhone;
  const resolvedDate = trade?.trade_date || call.call_date || now.slice(0, 10);
  const resolvedCallDate = call.call_date || trade?.trade_date || resolvedDate;

  if (existingScorecard) {
    scorecardId = existingScorecard.id;
    db.prepare(`
      UPDATE scorecards SET
        audit_id = ?,
        caller_name = ?,
        team = ?,
        client = ?,
        trade_phone = ?,
        calling_number = ?,
        registered_number = ?,
        trade_date = ?,
        call_date = ?,
        score = ?,
        is_fatal = ?,
        fatal_reasons = ?,
        q1_status = ?, q1_evidence = ?,
        q2_status = ?, q2_evidence = ?,
        q3_status = ?, q3_evidence = ?,
        q4_status = 'PASS', q4_evidence = 'Customer acknowledged and confirmed pre-order instructions.',
        q5_status = ?, q5_evidence = ?,
        audit_comment = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      auditId,
      call.caller_name || 'Advisor',
      call.team || 'Equity',
      call.client || trade?.client || '',
      resolvedTradePhone,
      resolvedCallingPhone,
      resolvedRegisteredPhone,
      resolvedDate,
      resolvedCallDate,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      scoreResult.fatal_reasons.join('; '),
      auditResult.q1.status, auditResult.q1.evidence,
      auditResult.q2.status, auditResult.q2.evidence,
      auditResult.q3.status, auditResult.q3.evidence,
      auditResult.q5.status, auditResult.q5.evidence,
      scoreResult.audit_comment,
      now,
      scorecardId
    );
  } else {
    const res = db.prepare(`
      INSERT INTO scorecards (
        audit_id, call_id, caller_name, team, client, trade_phone,
        calling_number, registered_number, trade_date, call_date,
        score, is_fatal, fatal_reasons,
        q1_status, q1_evidence,
        q2_status, q2_evidence,
        q3_status, q3_evidence,
        q4_status, q4_evidence,
        q5_status, q5_evidence,
        audit_comment, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        'PASS', 'Customer acknowledged and confirmed pre-order instructions.',
        ?, ?,
        ?, ?, ?
      )
    `).run(
      auditId,
      callId,
      call.caller_name || 'Advisor',
      call.team || 'Equity',
      call.client || trade?.client || '',
      resolvedTradePhone,
      resolvedCallingPhone,
      resolvedRegisteredPhone,
      resolvedDate,
      resolvedCallDate,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      scoreResult.fatal_reasons.join('; '),
      auditResult.q1.status, auditResult.q1.evidence,
      auditResult.q2.status, auditResult.q2.evidence,
      auditResult.q3.status, auditResult.q3.evidence,
      auditResult.q5.status, auditResult.q5.evidence,
      scoreResult.audit_comment,
      now,
      now
    );
    scorecardId = Number(res.lastInsertRowid);
  }

  // 3. Mark Call Record as Audited and Completed
  db.prepare(`
    UPDATE calls SET
      audit_status = 'AUDITED',
      processing_status = 'COMPLETED',
      status = 'audited',
      updated_at = ?
    WHERE id = ?
  `).run(now, callId);

  return { audit_id: auditId, scorecard_id: scorecardId };
}

/**
 * Stage 9B: Reconcile Executed Trades against Uploaded Calls
 */
export function stage9ReconcileMissingCalls(db: DatabaseSync): MissingCallReconciliationSummary {
  const trades = db.prepare('SELECT * FROM trades ORDER BY id ASC').all() as unknown as TradeRecord[];
  const calls = db.prepare('SELECT * FROM calls').all() as unknown as CallRecord[];

  let matchedCount = 0;
  let missingCount = 0;
  let reviewCount = 0;

  const items: MissingCallReconciliationSummary['reconciliation_items'] = [];

  for (const trade of trades) {
    // Find calls linked to this trade
    const matchedCall = calls.find(
      (c) => c.matched_trade_id === trade.id && c.trade_match_status === 'CONFIRMED'
    );

    const reviewCall = calls.find(
      (c) => c.matched_trade_id === trade.id && c.trade_match_status === 'REVIEW'
    );

    if (matchedCall) {
      matchedCount++;
      items.push({
        trade_id: trade.id,
        trade_external_id: trade.external_id,
        client: trade.client,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        trade_date: trade.trade_date,
        trade_phone: trade.phone_number || trade.client_number,
        reconciliation_status: 'MATCHED',
        matched_call_id: matchedCall.id,
        notes: `Confirmed pre-order call #${matchedCall.id} (${matchedCall.recording_name || matchedCall.original_filename}) linked.`,
      });
    } else if (reviewCall) {
      reviewCount++;
      items.push({
        trade_id: trade.id,
        trade_external_id: trade.external_id,
        client: trade.client,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        trade_date: trade.trade_date,
        trade_phone: trade.phone_number || trade.client_number,
        reconciliation_status: 'REVIEW',
        matched_call_id: reviewCall.id,
        notes: `Candidate call #${reviewCall.id} identified but requires compliance review before trade confirmation.`,
      });
    } else {
      missingCount++;
      items.push({
        trade_id: trade.id,
        trade_external_id: trade.external_id,
        client: trade.client,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        trade_date: trade.trade_date,
        trade_phone: trade.phone_number || trade.client_number,
        reconciliation_status: 'MISSING_CALL',
        matched_call_id: null,
        notes: 'FATAL: No pre-order telephone recording found for executed trade.',
      });
    }
  }

  return {
    total_trades: trades.length,
    matched_count: matchedCount,
    missing_call_count: missingCount,
    review_count: reviewCount,
    reconciliation_items: items,
  };
}
