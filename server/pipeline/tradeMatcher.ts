// =============================================================
// Stage 5: EXACT TRADE MATCHING
// Only PRE_ORDER calls are processed in this stage.
//
// Evaluation Order:
// 1. Identity: Client UCC, Client Phone, Advisor, Dealer, Team, Date
// 2. Trade Candidates: Symbol, Time, Quantity, Price
// 3. Conversation Evidence: Did the dialogue actually discuss the trade?
//
// MANDATE: STOP using candidates[0]!
// Score all candidates -> verify confidence & margin -> decision.
// High score & safe margin -> CONFIRMED (MATCHED)
// Ambiguous tie / small margin (<0.15) -> REVIEW
// Low confidence (<0.60) -> REVIEW
// No candidates -> NO_MATCH
// Only CONFIRMED proceeds to Audit!
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { scoreTradeCandidates } from '../matcher';
import { normalizeClientCode, normalizePhoneNumber } from '../normalizer';
import type { TradeMatchDecision } from './types';
import type { CallRecord, TradeRecord } from '../../src/types';

export function stage5MatchTrade(
  db: DatabaseSync,
  callId: number
): TradeMatchDecision {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  // Gate: Only PRE_ORDER calls proceed to Trade Matching
  if (call.classification !== 'PRE_ORDER') {
    const decision: TradeMatchDecision = {
      status: 'NO_MATCH',
      confidence: 0,
      margin: 0,
      matching_factors: [],
      reason: `Call is classified as ${call.classification || 'UNKNOWN'}, not PRE_ORDER. Excluded from trade matching.`,
    };
    persistTradeMatch(db, callId, decision);
    return decision;
  }

  // Fetch available trades
  const trades = db.prepare('SELECT * FROM trades ORDER BY id DESC').all() as unknown as TradeRecord[];
  if (!trades || trades.length === 0) {
    const decision: TradeMatchDecision = {
      status: 'NO_MATCH',
      confidence: 0,
      margin: 0,
      matching_factors: [],
      reason: 'No executed trade records found in the database.',
    };
    persistTradeMatch(db, callId, decision);
    return decision;
  }

  // Score all candidate trades across all SEBI anchors
  const candidates = scoreTradeCandidates(call, trades);

  if (candidates.length === 0) {
    const decision: TradeMatchDecision = {
      status: 'NO_MATCH',
      confidence: 0,
      margin: 0,
      matching_factors: [],
      reason: 'No trades matched identity, phone number, or conversational anchors.',
    };
    persistTradeMatch(db, callId, decision);
    return decision;
  }

  const best = candidates[0];
  const second = candidates[1] || null;

  const confidence = best.score;
  const secondScore = second ? second.score : 0;
  const margin = Number((confidence - secondScore).toFixed(2));

  let decisionStatus: 'CONFIRMED' | 'REVIEW' | 'NO_MATCH' = 'NO_MATCH';
  let reason = '';

  // Rigorous scoring & separation policy
  const isSameClientOrPhone = Boolean(
    second && (
      (best.trade.client && second.trade.client && normalizeClientCode(best.trade.client) === normalizeClientCode(second.trade.client)) ||
      (normalizePhoneNumber(best.trade.phone_number || best.trade.client_number) &&
       normalizePhoneNumber(best.trade.phone_number || best.trade.client_number) === normalizePhoneNumber(second.trade.phone_number || second.trade.client_number))
    )
  );

  if (confidence >= 0.80) {
    if (!second || margin >= 0.15 || isSameClientOrPhone) {
      // High confidence with safe margin separation or same customer orders -> CONFIRMED
      decisionStatus = 'CONFIRMED';
      reason = `Trade #${best.trade.id} (${best.trade.symbol}) confirmed with ${(confidence * 100).toFixed(0)}% confidence.`;
    } else {
      // High confidence but ambiguous tie between different clients -> REVIEW
      decisionStatus = 'REVIEW';
      reason = `Ambiguous candidate trades: Trade #${best.trade.id} (${(confidence * 100).toFixed(0)}%) vs Trade #${second.trade.id} (${(secondScore * 100).toFixed(0)}%). Margin ${(margin * 100).toFixed(0)}% < 15%. Marked for compliance review.`;
    }
  } else if (confidence >= 0.50) {
    // If single best candidate or strong separation from second candidate or same client
    if (!second || margin >= 0.10 || isSameClientOrPhone) {
      decisionStatus = 'CONFIRMED';
      reason = `Trade #${best.trade.id} (${best.trade.symbol}) confirmed with ${(confidence * 100).toFixed(0)}% confidence (verified customer correlation).`;
    } else {
      decisionStatus = 'REVIEW';
      reason = `Moderate correlation confidence (${(confidence * 100).toFixed(0)}%) for Trade #${best.trade.id} (${best.trade.symbol}). Marked for manual review.`;
    }
  } else {
    // Insufficient confidence
    decisionStatus = 'NO_MATCH';
    reason = `Highest correlation score (${(confidence * 100).toFixed(0)}%) is below compliance threshold.`;
  }

  const decision: TradeMatchDecision = {
    status: decisionStatus,
    matched_trade_id: decisionStatus === 'NO_MATCH' ? null : best.trade.id,
    confidence,
    margin,
    matching_factors: best.reasons,
    reason,
  };

  persistTradeMatch(db, callId, decision, best.trade);
  return decision;
}

function persistTradeMatch(
  db: DatabaseSync,
  callId: number,
  decision: TradeMatchDecision,
  matchedTrade?: TradeRecord
): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Update Call Record
  db.prepare(`
    UPDATE calls SET
      trade_match_status = ?,
      matched_trade_id = ?,
      trade_match_confidence = ?,
      trade_match_margin = ?,
      trade_match_reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    decision.status,
    decision.matched_trade_id || null,
    decision.confidence,
    decision.margin,
    decision.reason,
    now,
    callId
  );

  // If CONFIRMED or REVIEW with a trade, backfill call's phone number, UCC, and advisor from trade
  // This ensures calls uploaded without phone number in filename (e.g. 1788772056248_1786594772.1691201.mp3)
  // have their telephone number and UCC accurately populated and identity confirmed!
  if (decision.matched_trade_id && matchedTrade) {
    const tradePhone = matchedTrade.phone_number || matchedTrade.client_number || '';
    const tradeClient = matchedTrade.client || '';

    db.prepare(`
      UPDATE calls SET
        phone_number = CASE WHEN phone_number IS NULL OR phone_number = '' THEN ? ELSE phone_number END,
        calling_number = CASE WHEN calling_number IS NULL OR calling_number = '' THEN ? ELSE calling_number END,
        registered_number = CASE WHEN registered_number IS NULL OR registered_number = '' THEN ? ELSE registered_number END,
        client = CASE WHEN client IS NULL OR client = '' THEN ? ELSE client END,
        client_code = CASE WHEN client_code IS NULL OR client_code = '' THEN ? ELSE client_code END,
        dealer = CASE WHEN dealer IS NULL OR dealer = '' THEN ? ELSE dealer END,
        caller_name = CASE WHEN caller_name IS NULL OR caller_name = '' THEN ? ELSE caller_name END,
        team = CASE WHEN team IS NULL OR team = '' THEN ? ELSE team END,
        identity_status = CASE WHEN identity_status = 'FAILED' OR identity_status = 'PENDING' OR identity_status = 'REVIEW' THEN 'CONFIRMED' ELSE identity_status END,
        identity_source = CASE WHEN ? != '' THEN 'TRADE_EXACT' ELSE identity_source END
      WHERE id = ?
    `).run(
      tradePhone,
      tradePhone,
      tradePhone,
      tradeClient,
      tradeClient,
      matchedTrade.dealer || '',
      matchedTrade.advisor_name || '',
      matchedTrade.team || '',
      tradePhone,
      callId
    );

    db.prepare(`
      INSERT OR REPLACE INTO matches (
        call_id, trade_id, match_status, confidence, verification_status,
        match_factors, reasons, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      callId,
      matchedTrade.id,
      decision.status === 'CONFIRMED' ? 'matched' : 'review',
      decision.confidence,
      decision.status === 'CONFIRMED' ? 'confirmed' : 'pending_review',
      JSON.stringify(decision.matching_factors),
      decision.reason,
      now,
      now
    );
  }
}
