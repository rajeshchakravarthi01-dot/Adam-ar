// =============================================================
// Stage 5: EXACT MULTI-EXECUTION TRADE MATCHING
// Only PRE_ORDER calls are processed in this stage.
//
// Refactored per SEBI Audit:
// Correlation unit is: "one call -> one client/UCC -> all relevant
// executed trades for that client/order conversation."
// Supports single or multiple orders with split executions.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { stage5MultiExecutionMatch, type MultiOrderMatchResult } from './multiExecutionMatcher';
import type { TradeMatchDecision } from './types';

export function stage5MatchTrade(
  db: DatabaseSync,
  callId: number
): TradeMatchDecision & { multiExecution?: MultiOrderMatchResult } {
  const result = stage5MultiExecutionMatch(db, callId);

  return {
    status: result.status,
    matched_trade_id: result.primary_trade_id,
    confidence: result.confidence,
    margin: result.margin,
    matching_factors: result.matching_factors,
    reason: result.reason,
    multiExecution: result,
  };
}
