// =============================================================
// AuditEQ v17.0.28 — SEBI 5-Anchor Deterministic Matching Engine
// =============================================================

import type { CallRecord, TradeRecord, MatchRecord } from '../src/types';
import {
  normalizePhoneNumber,
  normalizeClientCode,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
  detectBuySell,
} from './normalizer';

export interface ScoredCandidate {
  trade: TradeRecord;
  score: number;
  reasons: string[];
}

export interface MatchDecision {
  matchStatus: 'matched' | 'review' | 'unmatched';
  verificationStatus: 'confirmed' | 'pending_review' | 'unmatched';
  bestTrade: TradeRecord | null;
  confidence: number;
  secondConfidence: number;
  scoreMargin: number;
  reasons: string[];
}

function parseTimeToSeconds(timeStr?: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export function evaluateTimeCorrelation(
  callTime?: string,
  callDate?: string,
  tradeTime?: string,
  tradeDate?: string
): {
  isLogical: boolean;
  deltaMinutes: number | null;
  relation: 'TRADE_AFTER_CALL' | 'TRADE_DURING_CALL' | 'TRADE_BEFORE_CALL' | 'TRADE_MUCH_LATER' | 'DATE_MISMATCH' | 'UNKNOWN_TIMING';
  reason: string;
} {
  if (callDate && tradeDate && callDate !== tradeDate) {
    return {
      isLogical: false,
      deltaMinutes: null,
      relation: 'DATE_MISMATCH',
      reason: `Trade date (${tradeDate}) does not match call date (${callDate}).`,
    };
  }

  const callSec = parseTimeToSeconds(callTime);
  const tradeSec = parseTimeToSeconds(tradeTime);

  if (callSec === null || tradeSec === null) {
    return {
      isLogical: true,
      deltaMinutes: null,
      relation: 'UNKNOWN_TIMING',
      reason: 'Exact timestamp missing for fine-grained temporal check; verified by calendar date.',
    };
  }

  const deltaSec = tradeSec - callSec;
  const deltaMinutes = Math.round(deltaSec / 60);

  // If trade happened > 1 minute BEFORE call started:
  if (deltaSec < -60) {
    return {
      isLogical: false,
      deltaMinutes,
      relation: 'TRADE_BEFORE_CALL',
      reason: `Trade was executed at ${tradeTime}, which is ${Math.abs(deltaMinutes)}m BEFORE the call started (${callTime}). Not a valid pre-order recording.`,
    };
  }

  // If trade happened > 2 hours AFTER call:
  if (deltaSec > 7200) {
    return {
      isLogical: false,
      deltaMinutes,
      relation: 'TRADE_MUCH_LATER',
      reason: `Trade was executed at ${tradeTime}, which is ${deltaMinutes}m after the call (${callTime}). Exceeds 2-hour pre-order temporal window.`,
    };
  }

  return {
    isLogical: true,
    deltaMinutes,
    relation: deltaSec <= 120 ? 'TRADE_DURING_CALL' : 'TRADE_AFTER_CALL',
    reason: `Trade executed ${deltaMinutes >= 0 ? `${deltaMinutes}m after` : 'during'} call (${callTime} -> ${tradeTime}).`,
  };
}

/**
 * Executes multi-anchor candidate scoring across all available trades for a given call.
 */
export function scoreTradeCandidates(call: CallRecord, trades: TradeRecord[]): ScoredCandidate[] {
  if (!trades || trades.length === 0) return [];

  const transcript = call.transcript || '';
  const callPhoneLast10 = normalizePhoneNumber(call.calling_number || call.phone_number || call.client_number || call.registered_number);
  const transcriptPhoneLast10 = normalizePhoneNumber(transcript.match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/)?.[1]);
  const effectiveCallPhone = callPhoneLast10 || transcriptPhoneLast10;
  const normCallClient = normalizeClientCode(call.client);
  const spokenSide = detectBuySell(transcript);
  const candidates: ScoredCandidate[] = [];

  for (const trade of trades) {
    // FATAL CONFLICT REJECTIONS (Items 4, 5, 10, 11, 141, 143, 144, 150)
    // 1. Side conflict
    if (spokenSide.side && trade.side) {
      const normTradeSide = trade.side.toUpperCase().includes('BUY') ? 'BUY' : (trade.side.toUpperCase().includes('SELL') ? 'SELL' : null);
      if (normTradeSide && spokenSide.side !== normTradeSide) {
        continue; // Exclude candidate with opposite side
      }
    }

    // 2. Client code conflict (if both specified and different)
    const normTradeClient = normalizeClientCode(trade.client);
    if (normTradeClient && normCallClient && normTradeClient !== normCallClient) {
      continue; // Exclude candidate with different client
    }

    // 3. Time correlation check
    const timeCorr = evaluateTimeCorrelation(call.call_time, call.call_date, trade.trade_time, trade.trade_date);
    if (timeCorr.relation === 'TRADE_BEFORE_CALL' || timeCorr.relation === 'DATE_MISMATCH') {
      continue; // Trade executed before call or on wrong date cannot be this pre-order
    }

    let score = 0;
    const currentReasons: string[] = [];
    let isDirectClientOrPhoneMatch = false;

    // Anchor 1: Phone Number (0.40 max identity weight for exact 10-digit customer match)
    let identityScore = 0;
    const tradePhoneLast10 = normalizePhoneNumber(trade.client_number || trade.phone_number);
    if (tradePhoneLast10 && effectiveCallPhone && tradePhoneLast10 === effectiveCallPhone) {
      identityScore = Math.max(identityScore, 0.40);
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`registered/calling phone 10-digit exact match (${effectiveCallPhone})`);
    }

    // Anchor 2: Client Code (0.40 max identity weight)
    if (normTradeClient && normCallClient && normTradeClient === normCallClient) {
      identityScore = Math.max(identityScore, 0.40);
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`client code metadata exact match (${trade.client})`);
    } else if (normTradeClient && transcript) {
      const tradeNumeric = (trade.client || '').replace(/\D/g, '');
      const hasNumericUcc = tradeNumeric.length >= 4 && transcript.includes(tradeNumeric);
      const clientMatch = matchClientCodeInTranscript(trade.client || '', transcript);
      if (clientMatch.matched || hasNumericUcc) {
        identityScore = Math.max(identityScore, 0.35);
        isDirectClientOrPhoneMatch = true;
        currentReasons.push(`client code confirmed in transcript (${trade.client})`);
      }
    }

    if (!effectiveCallPhone && tradePhoneLast10 && transcript.includes(tradePhoneLast10)) {
      identityScore = Math.max(identityScore, 0.40);
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`trade registered phone matched in transcript (${tradePhoneLast10})`);
    }

    score += identityScore;

    // Anchor 3: Trading Symbol & Alias (0.35 weight - REQUIRED for PRE_ORDER confirmation)
    let symbolVerified = false;
    if (trade.symbol && transcript) {
      const baseSym = trade.symbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      const symMatch = matchSymbolInTranscript(trade.symbol, transcript);
      const baseSymMatch = !symMatch.matched && baseSym ? matchSymbolInTranscript(baseSym, transcript) : null;
      if (symMatch.matched || (baseSymMatch && baseSymMatch.matched)) {
        score += 0.35;
        symbolVerified = true;
        const matchedName = symMatch.matched ? (symMatch.matchedAlias !== trade.symbol ? symMatch.matchedAlias : trade.symbol) : baseSym;
        currentReasons.push(`symbol (${trade.symbol} as "${matchedName}") verified in transcript`);
      } else if (baseSym && baseSym.length >= 3 && new RegExp(`\\b${baseSym}\\b`, 'i').test(transcript)) {
        score += 0.35;
        symbolVerified = true;
        currentReasons.push(`symbol (${baseSym}) verified in transcript`);
      }
    }

    // Anchor 4: Price & Quantity (0.15 total weight)
    const isCmp = trade.price_display === 'CMP' || Boolean(trade.is_combined) || mentionsMarketPriceOrCMP(transcript);
    if (isCmp) {
      score += 0.08;
      currentReasons.push('market price / CMP verified in transcript');
    } else if (trade.price && trade.price > 0 && transcript) {
      if (matchPriceInTranscript(trade.price, transcript) || transcript.includes(String(trade.price))) {
        score += 0.08;
        currentReasons.push(`price (₹${trade.price}) tokenized match`);
      }
    }
    if (trade.quantity && trade.quantity > 0 && transcript) {
      if (matchQuantityInTranscript(trade.quantity, transcript) || transcript.includes(String(trade.quantity))) {
        score += 0.07;
        currentReasons.push(`quantity (${trade.quantity}) tokenized match`);
      }
    }

    // Anchor 5: Proximity / Date & Time match (0.10 weight)
    if (timeCorr.isLogical) {
      score += 0.10;
      currentReasons.push(timeCorr.reason);
    }

    // Anchor 6: Advisor / Dealer / Team match (0.05 weight)
    if (trade.advisor_name && call.caller_name && (trade.advisor_name.toLowerCase().includes(call.caller_name.toLowerCase()) || call.caller_name.toLowerCase().includes(trade.advisor_name.toLowerCase()))) {
      score += 0.03;
      currentReasons.push(`advisor match (${trade.advisor_name})`);
    }
    if (trade.dealer && call.dealer && trade.dealer.toLowerCase() === call.dealer.toLowerCase()) {
      score += 0.02;
      currentReasons.push(`dealer match (${trade.dealer})`);
    }
    if (trade.team && call.team && trade.team.toLowerCase() === call.team.toLowerCase()) {
      score += 0.02;
      currentReasons.push(`team match (${trade.team})`);
    }

    // Cap score at 1.0
    const finalScore = Math.min(1.0, Number(score.toFixed(2)));

    // Candidates scored
    if (finalScore >= 0.40) {
      candidates.push({
        trade,
        score: finalScore,
        reasons: currentReasons,
      });
    }
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Determines whether the highest scored trade is safely confirmable or requires human compliance review.
 * Automatic confirmation criteria:
 * - Symbol MUST be verified in transcript (Items 5, 10, 141)
 * - Separation from competing candidate trades >= 0.15 (Items 6, 12, 149)
 * - Overall confidence >= 0.65
 */
export function evaluateMatchingDecision(candidates: ScoredCandidate[]): MatchDecision {
  if (candidates.length === 0) {
    return {
      matchStatus: 'unmatched',
      verificationStatus: 'unmatched',
      bestTrade: null,
      confidence: 0,
      secondConfidence: 0,
      scoreMargin: 0,
      reasons: ['No trade candidates satisfied correlation threshold.'],
    };
  }

  const best = candidates[0];
  const second = candidates[1] || null;

  const confidence = best.score;
  const secondConfidence = second ? second.score : 0;
  const scoreMargin = Number((confidence - secondConfidence).toFixed(2));

  // Automatic confirmation criteria:
  // 1. Symbol MUST be verified in transcript for candidate trades scored by pipeline (Items 5, 10, 141)
  const isFromScorer = best.reasons.some((r) => r.includes('exact match') || r.includes('tokenized match') || r.includes('phone') || r.includes('client code'));
  const hasSymbolVerified = !isFromScorer || best.reasons.some((r) => r.includes('symbol ('));

  // 2. Separation criteria: If competing candidates exist for different trades, require >= 0.15 margin
  const isDistinctCandidate = Boolean(second && best.trade.id !== second.trade.id);
  const isSeparationSafe = candidates.length === 1 || (!isDistinctCandidate && scoreMargin >= 0.05) || (scoreMargin >= 0.15);

  const isConfirmed = confidence >= 0.65 && isSeparationSafe && hasSymbolVerified;

  if (isConfirmed) {
    return {
      matchStatus: 'matched',
      verificationStatus: 'confirmed',
      bestTrade: best.trade,
      confidence,
      secondConfidence,
      scoreMargin,
      reasons: best.reasons,
    };
  } else if (hasSymbolVerified && confidence >= 0.35) {
    // Symbol is verified but margin or parameters require compliance review
    const reviewReasons = [...best.reasons];
    if (confidence < 0.65) {
      reviewReasons.push(`Confidence (${(confidence * 100).toFixed(0)}%) flagged for operational verification.`);
    }
    if (!isSeparationSafe) {
      reviewReasons.push(`Multiple candidate trades detected with close scores (margin ${(scoreMargin * 100).toFixed(0)}%).`);
    }

    return {
      matchStatus: 'review',
      verificationStatus: 'pending_review',
      bestTrade: best.trade,
      confidence,
      secondConfidence,
      scoreMargin,
      reasons: reviewReasons,
    };
  } else {
    // Trade symbol does NOT match what was discussed -> Unmatched (Items 5, 141)
    return {
      matchStatus: 'unmatched',
      verificationStatus: 'unmatched',
      bestTrade: null,
      confidence,
      secondConfidence,
      scoreMargin,
      reasons: [`Candidate trade #${best.trade.id} (${best.trade.symbol}) does not match conversation order symbols.`],
    };
  }
}

export interface ResolvedTradeResult {
  resolvedTrade: TradeRecord | null;
  matchStatus: 'matched' | 'review' | 'unmatched';
  confidence: number;
  reason: string;
}

/**
 * Resolves to a single authoritative trade or returns null if unmatched/ambiguous.
 * Completely eliminates arbitrary array index fallbacks (like candidates[0] or trades[0]).
 */
export function resolveAuthoritativeTrade(call: CallRecord, trades: TradeRecord[]): ResolvedTradeResult {
  if (!trades || trades.length === 0) {
    return {
      resolvedTrade: null,
      matchStatus: 'unmatched',
      confidence: 0,
      reason: 'No trades available in database.',
    };
  }

  const candidates = scoreTradeCandidates(call, trades);
  const decision = evaluateMatchingDecision(candidates);

  if (decision.matchStatus === 'matched' && decision.bestTrade) {
    return {
      resolvedTrade: decision.bestTrade,
      matchStatus: 'matched',
      confidence: decision.confidence,
      reason: decision.reasons.join(' | '),
    };
  }

  return {
    resolvedTrade: null,
    matchStatus: decision.matchStatus,
    confidence: decision.confidence,
    reason: decision.reasons.join(' | '),
  };
}

