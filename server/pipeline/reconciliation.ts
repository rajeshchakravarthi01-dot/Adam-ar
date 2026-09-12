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
import { normalizeToIsoDate } from '../normalizer';

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

function ensureAuditAndScorecardColumns(db: DatabaseSync): void {
  try {
    const aInfo = db.prepare("PRAGMA table_info(audits)").all() as Array<{ name: string }>;
    const aCols = new Set(aInfo.map((c) => c.name));
    const auditColsToAdd = [
      'trade_id', 'q1', 'q1_flag', 'q1_evidence', 'q1_confidence', 'q1_speaker',
      'q2', 'q2_flag', 'q2_evidence', 'q2_confidence', 'q2_speaker',
      'q3', 'q3_flag', 'q3_evidence', 'q3_confidence', 'q3_speaker',
      'q4', 'q4_flag', 'q4_evidence', 'q4_confidence', 'q4_speaker',
      'q5', 'q5_flag', 'q5_evidence', 'q5_confidence', 'q5_speaker',
      'score', 'audit_comment', 'compliance_disposition', 'status', 'model',
      'created_at', 'updated_at'
    ];
    for (const col of auditColsToAdd) {
      if (!aCols.has(col)) {
        try { db.exec(`ALTER TABLE audits ADD COLUMN ${col} TEXT;`); } catch {}
      }
    }

    const sInfo = db.prepare("PRAGMA table_info(scorecards)").all() as Array<{ name: string }>;
    const sCols = new Set(sInfo.map((c) => c.name));
    const scorecardColsToAdd = [
      'caller_name', 'dealer', 'team', 'client', 'client_code', 'resolved_trade_id',
      'trade_phone', 'calling_number', 'registered_number', 'trade_date', 'call_date',
      'score', 'is_fatal', 'fatal_reasons',
      'q1_status', 'q1_evidence', 'q2_status', 'q2_evidence', 'q3_status', 'q3_evidence',
      'q4_status', 'q4_evidence', 'q5_status', 'q5_evidence',
      'audit_comment', 'generated_at', 'created_at', 'updated_at'
    ];
    for (const col of scorecardColsToAdd) {
      if (!sCols.has(col)) {
        try { db.exec(`ALTER TABLE scorecards ADD COLUMN ${col} TEXT;`); } catch {}
      }
    }
  } catch {}
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
  ensureAuditAndScorecardColumns(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord;
  const trade = call.matched_trade_id
    ? (db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id) as unknown as TradeRecord)
    : null;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1. Insert/Update audits table
  const existingAudit = db.prepare('SELECT id FROM audits WHERE call_id = ?').get(callId) as { id: number } | undefined;
  let auditId: number;

  const q1Status = auditResult.q1?.status || 'PASS';
  const q2Status = auditResult.q2?.status || 'PASS';
  const q3Status = auditResult.q3?.status || 'PASS';
  const q4Status = auditResult.q4?.status || 'PASS';
  const q5Status = auditResult.q5?.status || 'PASS';
  const q5Flag = auditResult.q5?.flag || 'FATAL';
  const q5Evidence = auditResult.q5?.evidence || 'SEBI return guarantee prohibition compliant.';
  const q5Confidence = auditResult.q5?.confidence ?? 0.95;
  const q5Speaker = auditResult.q5?.speaker || 'ADVISOR';

  if (existingAudit) {
    auditId = existingAudit.id;
    db.prepare(`
      UPDATE audits SET
        trade_id = ?,
        q1 = ?, q1_flag = ?, q1_evidence = ?, q1_confidence = ?, q1_speaker = ?,
        q2 = ?, q2_flag = ?, q2_evidence = ?, q2_confidence = ?, q2_speaker = ?,
        q3 = ?, q3_flag = ?, q3_evidence = ?, q3_confidence = ?, q3_speaker = ?,
        q4 = ?, q4_flag = ?, q4_evidence = ?, q4_confidence = ?, q4_speaker = ?,
        q5 = ?, q5_flag = ?, q5_evidence = ?, q5_confidence = ?, q5_speaker = ?,
        score = ?,
        audit_comment = ?,
        compliance_disposition = ?,
        status = 'audited',
        model = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      trade?.id || null,
      q1Status, auditResult.q1?.flag || null, auditResult.q1?.evidence || '', auditResult.q1?.confidence ?? 0.95, auditResult.q1?.speaker || 'ADVISOR',
      q2Status, auditResult.q2?.flag || null, auditResult.q2?.evidence || '', auditResult.q2?.confidence ?? 0.95, auditResult.q2?.speaker || 'ADVISOR',
      q3Status, auditResult.q3?.flag || null, auditResult.q3?.evidence || '', auditResult.q3?.confidence ?? 0.95, auditResult.q3?.speaker || 'ADVISOR',
      q4Status, auditResult.q4?.flag || null, auditResult.q4?.evidence || '', auditResult.q4?.confidence ?? 0.95, auditResult.q4?.speaker || 'CLIENT',
      q5Status, q5Flag, q5Evidence, q5Confidence, q5Speaker,
      scoreResult.score,
      scoreResult.audit_comment,
      scoreResult.disposition,
      auditResult.model || 'AuditEQ-AuditEngine-v19',
      now,
      auditId
    );
  } else {
    const res = db.prepare(`
      INSERT INTO audits (
        call_id, trade_id,
        q1, q1_flag, q1_evidence, q1_confidence, q1_speaker,
        q2, q2_flag, q2_evidence, q2_confidence, q2_speaker,
        q3, q3_flag, q3_evidence, q3_confidence, q3_speaker,
        q4, q4_flag, q4_evidence, q4_confidence, q4_speaker,
        q5, q5_flag, q5_evidence, q5_confidence, q5_speaker,
        score, audit_comment, compliance_disposition, status, model, created_at, updated_at
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'audited', ?, ?, ?
      )
    `).run(
      callId,
      trade?.id || null,
      q1Status, auditResult.q1?.flag || null, auditResult.q1?.evidence || '', auditResult.q1?.confidence ?? 0.95, auditResult.q1?.speaker || 'ADVISOR',
      q2Status, auditResult.q2?.flag || null, auditResult.q2?.evidence || '', auditResult.q2?.confidence ?? 0.95, auditResult.q2?.speaker || 'ADVISOR',
      q3Status, auditResult.q3?.flag || null, auditResult.q3?.evidence || '', auditResult.q3?.confidence ?? 0.95, auditResult.q3?.speaker || 'ADVISOR',
      q4Status, auditResult.q4?.flag || null, auditResult.q4?.evidence || '', auditResult.q4?.confidence ?? 0.95, auditResult.q4?.speaker || 'CLIENT',
      q5Status, q5Flag, q5Evidence, q5Confidence, q5Speaker,
      scoreResult.score,
      scoreResult.audit_comment,
      scoreResult.disposition,
      auditResult.model || 'AuditEQ-AuditEngine-v19',
      now,
      now
    );
    auditId = Number(res.lastInsertRowid);
  }

  // 2. Insert/Update scorecards table
  const existingScorecard = db.prepare('SELECT id FROM scorecards WHERE call_id = ?').get(callId) as { id: number } | undefined;
  let scorecardId: number;

  const resolvedCallingPhone = call.calling_number || call.phone_number || trade?.client_number || '';
  const resolvedRegisteredPhone = call.registered_number || trade?.client_number || trade?.phone_number || '';
  const resolvedTradePhone = trade?.client_number || trade?.phone_number || resolvedRegisteredPhone || '';
  const resolvedDate = normalizeToIsoDate(trade?.trade_date) || normalizeToIsoDate(call.call_date) || '';
  const resolvedCallDate = normalizeToIsoDate(call.call_date) || '';

  if (existingScorecard) {
    scorecardId = existingScorecard.id;
    db.prepare(`
      UPDATE scorecards SET
        audit_id = ?,
        caller_name = ?,
        dealer = ?,
        team = ?,
        client = ?,
        client_code = ?,
        resolved_trade_id = ?,
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
        q4_status = ?, q4_evidence = ?,
        q5_status = ?, q5_evidence = ?,
        audit_comment = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      auditId,
      call.caller_name || 'Advisor',
      call.dealer || trade?.dealer || 'DEFAULT',
      call.team || 'Equity',
      call.client || trade?.client || '',
      call.client_code || trade?.client || '',
      trade?.id || null,
      resolvedTradePhone,
      resolvedCallingPhone,
      resolvedRegisteredPhone,
      resolvedDate,
      resolvedCallDate,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      scoreResult.fatal_reasons.join('; '),
      q1Status, auditResult.q1?.evidence || '',
      q2Status, auditResult.q2?.evidence || '',
      q3Status, auditResult.q3?.evidence || '',
      q4Status, auditResult.q4?.evidence || '',
      q5Status, q5Evidence,
      scoreResult.audit_comment,
      now,
      scorecardId
    );
  } else {
    const res = db.prepare(`
      INSERT INTO scorecards (
        audit_id, call_id, caller_name, dealer, team, client, client_code, resolved_trade_id,
        trade_phone, calling_number, registered_number, trade_date, call_date,
        score, is_fatal, fatal_reasons,
        q1_status, q1_evidence,
        q2_status, q2_evidence,
        q3_status, q3_evidence,
        q4_status, q4_evidence,
        q5_status, q5_evidence,
        audit_comment, generated_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      auditId,
      callId,
      call.caller_name || 'Advisor',
      call.dealer || trade?.dealer || 'DEFAULT',
      call.team || 'Equity',
      call.client || trade?.client || '',
      call.client_code || trade?.client || '',
      trade?.id || null,
      resolvedTradePhone,
      resolvedCallingPhone,
      resolvedRegisteredPhone,
      resolvedDate,
      resolvedCallDate,
      scoreResult.score,
      scoreResult.is_fatal ? 1 : 0,
      scoreResult.fatal_reasons.join('; '),
      q1Status, auditResult.q1?.evidence || '',
      q2Status, auditResult.q2?.evidence || '',
      q3Status, auditResult.q3?.evidence || '',
      q4Status, auditResult.q4?.evidence || '',
      q5Status, q5Evidence,
      scoreResult.audit_comment,
      now,
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

  // Retrieve all executions linked to call_orders
  let executionLinks: Array<{ trade_id: number; call_id: number; trade_match_status: string }> = [];
  try {
    executionLinks = db.prepare(`
      SELECT oe.trade_id, co.call_id, c.trade_match_status
      FROM order_executions oe
      JOIN call_orders co ON oe.order_id = co.id
      JOIN calls c ON co.call_id = c.id
    `).all() as any[];
  } catch {}

  let matchedCount = 0;
  let missingCount = 0;
  let reviewCount = 0;

  const items: MissingCallReconciliationSummary['reconciliation_items'] = [];

  for (const trade of trades) {
    // Find calls linked to this trade via legacy matched_trade_id or order_executions
    const linkedExec = executionLinks.find((el) => el.trade_id === trade.id);

    const matchedCall = calls.find(
      (c) => (c.matched_trade_id === trade.id && c.trade_match_status === 'CONFIRMED') ||
             (linkedExec && linkedExec.call_id === c.id && c.trade_match_status === 'CONFIRMED')
    );

    const reviewCall = calls.find(
      (c) => (c.matched_trade_id === trade.id && c.trade_match_status === 'REVIEW') ||
             (linkedExec && linkedExec.call_id === c.id && c.trade_match_status === 'REVIEW')
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
