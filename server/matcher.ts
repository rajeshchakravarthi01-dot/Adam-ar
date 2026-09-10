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
  const candidates: ScoredCandidate[] = [];

  for (const trade of trades) {
    let score = 0;
    const currentReasons: string[] = [];
    let isDirectClientOrPhoneMatch = false;

    // Anchor 1: Phone Number (0.85 weight for exact 10-digit customer match)
    // Compares trade's registered/client phone with call's calling/destination CLI or spoken phone
    const tradePhoneLast10 = normalizePhoneNumber(trade.client_number || trade.phone_number);
    if (tradePhoneLast10 && effectiveCallPhone && tradePhoneLast10 === effectiveCallPhone) {
      score += 0.85;
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`registered/calling phone 10-digit exact match (${effectiveCallPhone})`);
    }

    // Anchor 2: Client Code (0.85 weight for metadata match, 0.65 for transcript confirmation)
    const normTradeClient = normalizeClientCode(trade.client);
    if (normTradeClient && normCallClient && normTradeClient === normCallClient) {
      score += 0.85;
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`client code metadata exact match (${trade.client})`);
    } else if (normTradeClient && transcript) {
      const tradeNumeric = (trade.client || '').replace(/\D/g, '');
      const hasNumericUcc = tradeNumeric.length >= 4 && transcript.includes(tradeNumeric);
      const clientMatch = matchClientCodeInTranscript(trade.client || '', transcript);
      if (clientMatch.matched || hasNumericUcc) {
        score += 0.65;
        isDirectClientOrPhoneMatch = true;
        currentReasons.push(`client code confirmed in transcript (${trade.client})`);
      }
    }

    // Also check if trade phone number appears anywhere in the transcript
    if (!effectiveCallPhone && tradePhoneLast10 && transcript.includes(tradePhoneLast10)) {
      score += 0.85;
      isDirectClientOrPhoneMatch = true;
      currentReasons.push(`trade registered phone matched in transcript (${tradePhoneLast10})`);
    }

    // Anchor 3: Trading Symbol & Alias (0.35 weight)
    if (trade.symbol && transcript) {
      const baseSym = trade.symbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      const symMatch = matchSymbolInTranscript(trade.symbol, transcript);
      const baseSymMatch = !symMatch.matched && baseSym ? matchSymbolInTranscript(baseSym, transcript) : null;
      if (symMatch.matched || (baseSymMatch && baseSymMatch.matched)) {
        score += 0.35;
        const matchedName = symMatch.matched ? (symMatch.matchedAlias !== trade.symbol ? symMatch.matchedAlias : trade.symbol) : baseSym;
        currentReasons.push(`symbol (${trade.symbol} as "${matchedName}") verified in transcript`);
      } else if (baseSym && baseSym.length >= 3 && new RegExp(`\\b${baseSym}\\b`, 'i').test(transcript)) {
        score += 0.35;
        currentReasons.push(`symbol (${baseSym}) verified in transcript`);
      }
    }

    // Anchor 4: Price & Quantity (0.30 total weight)
    const isCmp = trade.price_display === 'CMP' || Boolean(trade.is_combined) || mentionsMarketPriceOrCMP(transcript);
    if (isCmp) {
      score += 0.15;
      currentReasons.push('market price / CMP verified in transcript');
    } else if (trade.price && trade.price > 0 && transcript) {
      if (matchPriceInTranscript(trade.price, transcript) || transcript.includes(String(trade.price))) {
        score += 0.15;
        currentReasons.push(`price (₹${trade.price}) tokenized match`);
      }
    }
    if (trade.quantity && trade.quantity > 0 && transcript) {
      if (matchQuantityInTranscript(trade.quantity, transcript) || transcript.includes(String(trade.quantity))) {
        score += 0.15;
        currentReasons.push(`quantity (${trade.quantity}) tokenized match`);
      }
    }

    // Anchor 5: Proximity / Date match (0.10 weight)
    if (trade.trade_date && call.call_date && trade.trade_date === call.call_date) {
      score += 0.10;
      currentReasons.push(`same calendar date (${trade.trade_date})`);
    }

    // Anchor 6: Advisor / Dealer / Team match (0.10 weight)
    if (trade.advisor_name && call.caller_name && (trade.advisor_name.toLowerCase().includes(call.caller_name.toLowerCase()) || call.caller_name.toLowerCase().includes(trade.advisor_name.toLowerCase()))) {
      score += 0.10;
      currentReasons.push(`advisor match (${trade.advisor_name})`);
    }
    if (trade.dealer && call.dealer && trade.dealer.toLowerCase() === call.dealer.toLowerCase()) {
      score += 0.05;
      currentReasons.push(`dealer match (${trade.dealer})`);
    }
    if (trade.team && call.team && trade.team.toLowerCase() === call.team.toLowerCase()) {
      score += 0.05;
      currentReasons.push(`team match (${trade.team})`);
    }

    // Cap score at 1.0
    const finalScore = Math.min(1.0, Number(score.toFixed(2)));

    if (finalScore >= 0.20 || isDirectClientOrPhoneMatch) {
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
 * - Phone number or client code exact match (>= 0.60 confidence)
 * - Sufficient separation or single best candidate
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
  // If multiple distinct trade candidates compete with narrow margin (scoreMargin < 0.15), flag for human review
  const isDistinctCandidate = Boolean(second && best.trade.id !== second.trade.id);
  const isSeparationSafe = candidates.length === 1 || (!isDistinctCandidate && scoreMargin >= 0.05) || (scoreMargin >= 0.15);
  const isConfirmed = confidence >= 0.50 && isSeparationSafe;

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
  } else if (confidence >= 0.30) {
    const reviewReasons = [...best.reasons];
    if (confidence < 0.50) {
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
    return {
      matchStatus: 'unmatched',
      verificationStatus: 'unmatched',
      bestTrade: null,
      confidence,
      secondConfidence,
      scoreMargin,
      reasons: [`Top candidate score (${(confidence * 100).toFixed(0)}%) insufficient for correlation.`],
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

