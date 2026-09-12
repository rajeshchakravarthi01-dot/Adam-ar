// =============================================================
// AuditEQ — Authoritative Spoken Evidence Extraction Layer
// =============================================================

import {
  SYMBOL_ALIASES,
  matchSymbolInTranscript,
  extractNumericTokens,
  detectBuySell,
  detectCallPut,
  evaluateCustomerAcknowledgement,
  evaluateReturnCommitment,
  mentionsMarketPriceOrCMP,
  normalizeClientCode,
} from './normalizer';
import type { TradeRecord } from '../src/types';
import type { StructuredOrderExtraction } from './pipeline/types';

export interface SpokenEvidenceItem {
  id: string;
  field:
    | 'client_id'
    | 'symbol'
    | 'side'
    | 'derivative_type'
    | 'strike'
    | 'price'
    | 'quantity'
    | 'customer_ack'
    | 'return_commitment'
    | 'compliance_statement'
    | 'auth_marker';
  value: string | number;
  normalized_value: string | number;
  exact_quote: string;
  speaker: 'ADVISOR' | 'CLIENT' | 'CHANNEL_0' | 'CHANNEL_1' | 'UNKNOWN' | 'BOTH';
  timestamp_start?: number;
  timestamp_end?: number;
  source: 'primary_asr' | 'secondary_asr' | 'reconciled';
  confidence: number;
}

export interface ExtractedCallEvidence {
  rawTranscript: string;
  evidenceItems: SpokenEvidenceItem[];
  detectedClientCode?: SpokenEvidenceItem;
  detectedSymbols: SpokenEvidenceItem[];
  detectedSides: SpokenEvidenceItem[];
  detectedDerivatives: SpokenEvidenceItem[];
  detectedQuantities: SpokenEvidenceItem[];
  detectedPrices: SpokenEvidenceItem[];
  detectedCustomerAck: SpokenEvidenceItem;
  detectedReturnCommitment: SpokenEvidenceItem;
  detectedAuthMarkers: SpokenEvidenceItem[];
  hasCmpMention: boolean;
  hasCriticalConflict: boolean;
  conflictReasons: string[];
}

export interface SegmentInfo {
  start: number;
  end: number;
  text: string;
  speaker?: 'ADVISOR' | 'CLIENT' | 'CHANNEL_0' | 'CHANNEL_1' | 'UNKNOWN';
}

/**
 * Extracts all verifiable spoken evidence items directly from transcript and timestamps.
 * Does NOT synthesize evidence from trade metadata.
 */
export function extractSpokenEvidence(
  transcript: string,
  segments: SegmentInfo[] = [],
  referenceTrade?: TradeRecord
): ExtractedCallEvidence {
  const evidenceItems: SpokenEvidenceItem[] = [];
  const conflictReasons: string[] = [];
  let itemCounter = 0;

  const nextId = (prefix: string) => `${prefix}_${++itemCounter}`;

  // Helper to find segment timestamps for a quote
  const findTimestamps = (quote: string): { start?: number; end?: number; speaker: 'ADVISOR' | 'CLIENT' | 'CHANNEL_0' | 'CHANNEL_1' | 'UNKNOWN' | 'BOTH' } => {
    if (!quote || segments.length === 0) return { speaker: 'UNKNOWN' };
    const lowerQuote = quote.toLowerCase();
    for (const seg of segments) {
      if (seg.text.toLowerCase().includes(lowerQuote)) {
        return {
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker || 'UNKNOWN',
        };
      }
    }
    return { speaker: 'UNKNOWN' };
  };

  // 1. Client Code Extraction
  let detectedClientCode: SpokenEvidenceItem | undefined;
  const clientCodeRegex = /\b([a-zA-Z]{2,4}\s*(?:-|\s)?\s*\d{4,7})\b/g;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = clientCodeRegex.exec(transcript)) !== null) {
    const rawMatch = codeMatch[0];
    const norm = normalizeClientCode(rawMatch);
    if (norm.length >= 5) {
      const ts = findTimestamps(rawMatch);
      const item: SpokenEvidenceItem = {
        id: nextId('client_id'),
        field: 'client_id',
        value: rawMatch,
        normalized_value: norm,
        exact_quote: rawMatch,
        speaker: ts.speaker,
        timestamp_start: ts.start,
        timestamp_end: ts.end,
        source: 'primary_asr',
        confidence: 0.95,
      };
      evidenceItems.push(item);
      if (!detectedClientCode) detectedClientCode = item;
    }
  }

  // Also check if reference trade client code exists with spoken spacing
  if (!detectedClientCode && referenceTrade?.client) {
    const normRef = normalizeClientCode(referenceTrade.client);
    const pattern = normRef.split('').join('[\\s\\-_]*');
    const reg = new RegExp(`\\b${pattern}\\b`, 'i');
    const spokenMatch = transcript.match(reg);
    if (spokenMatch) {
      const ts = findTimestamps(spokenMatch[0]);
      detectedClientCode = {
        id: nextId('client_id'),
        field: 'client_id',
        value: spokenMatch[0],
        normalized_value: normRef,
        exact_quote: spokenMatch[0],
        speaker: ts.speaker,
        timestamp_start: ts.start,
        timestamp_end: ts.end,
        source: 'primary_asr',
        confidence: 0.92,
      };
      evidenceItems.push(detectedClientCode);
    }
  }

  // 2. Stock / Symbol Extraction
  const detectedSymbols: SpokenEvidenceItem[] = [];
  const lowerTranscript = transcript.toLowerCase();
  interface SymbolCandidate {
    symKey: string;
    quote: string;
    start: number;
    end: number;
    confidence: number;
  }
  const symbolCandidates: SymbolCandidate[] = [];

  for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRegex = new RegExp(`\\b${aliasEscaped}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = aliasRegex.exec(lowerTranscript)) !== null) {
        symbolCandidates.push({
          symKey,
          quote: transcript.slice(m.index, m.index + m[0].length),
          start: m.index,
          end: m.index + m[0].length,
          confidence: 0.95,
        });
      }
    }
  }

  // S-02, S-03: Substring anti-collision - sort by length descending, reject overlapping shorter substrings
  symbolCandidates.sort((a, b) => b.quote.length - a.quote.length);
  const selectedCandidates: SymbolCandidate[] = [];
  for (const cand of symbolCandidates) {
    const overlaps = selectedCandidates.some(
      (sel) => cand.start < sel.end && sel.start < cand.end
    );
    if (!overlaps) {
      selectedCandidates.push(cand);
    }
  }

  // Sort selected candidates by appearance order in transcript
  selectedCandidates.sort((a, b) => a.start - b.start);

  for (const sc of selectedCandidates) {
    const ts = findTimestamps(sc.quote);
    const item: SpokenEvidenceItem = {
      id: nextId('symbol'),
      field: 'symbol',
      value: sc.quote,
      normalized_value: sc.symKey,
      exact_quote: sc.quote,
      speaker: ts.speaker,
      timestamp_start: ts.start,
      timestamp_end: ts.end,
      source: 'primary_asr',
      confidence: sc.confidence,
    };
    detectedSymbols.push(item);
    evidenceItems.push(item);
  }

  // Also check reference trade symbol if not in aliases
  if (referenceTrade?.symbol) {
    const symMatch = matchSymbolInTranscript(referenceTrade.symbol, transcript);
    if (symMatch.matched && !detectedSymbols.some((s) => s.normalized_value === referenceTrade.symbol)) {
      const quote = symMatch.matchedAlias || referenceTrade.symbol;
      const ts = findTimestamps(quote);
      const item: SpokenEvidenceItem = {
        id: nextId('symbol'),
        field: 'symbol',
        value: quote,
        normalized_value: referenceTrade.symbol,
        exact_quote: quote,
        speaker: ts.speaker,
        timestamp_start: ts.start,
        timestamp_end: ts.end,
        source: 'primary_asr',
        confidence: 0.92,
      };
      detectedSymbols.push(item);
      evidenceItems.push(item);
    }
  }

  // 3. Buy / Sell Side Extraction (supporting multiple order directives)
  const detectedSides: SpokenEvidenceItem[] = [];
  const sideRegex = /\b(buy(?:ing)?|purchase|khareed(?:na|o|iye)?|sell(?:ing)?|bech(?:na|o|iye)?)\b/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sideRegex.exec(transcript)) !== null) {
    const rawMatch = sm[0];
    const isBuy = /^(?:buy|purchase|khareed)/i.test(rawMatch);
    const sideVal: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL';
    const ts = findTimestamps(rawMatch);
    const item: SpokenEvidenceItem = {
      id: nextId('side'),
      field: 'side',
      value: sideVal,
      normalized_value: sideVal,
      exact_quote: rawMatch,
      speaker: ts.speaker,
      timestamp_start: ts.start,
      timestamp_end: ts.end,
      source: 'primary_asr',
      confidence: 0.95,
    };
    detectedSides.push(item);
    evidenceItems.push(item);
  }

  if (detectedSides.length === 0) {
    const buySell = detectBuySell(transcript);
    if (buySell.side && buySell.quote) {
      const ts = findTimestamps(buySell.quote);
      const item: SpokenEvidenceItem = {
        id: nextId('side'),
        field: 'side',
        value: buySell.side,
        normalized_value: buySell.side,
        exact_quote: buySell.quote,
        speaker: ts.speaker,
        timestamp_start: ts.start,
        timestamp_end: ts.end,
        source: 'primary_asr',
        confidence: buySell.confidence,
      };
      detectedSides.push(item);
      evidenceItems.push(item);
    }
  }

  // 4. Derivatives (Call/Put, CE/PE, Strike)
  const detectedDerivatives: SpokenEvidenceItem[] = [];
  const callPut = detectCallPut(transcript);
  if (callPut.type && callPut.quote) {
    const ts = findTimestamps(callPut.quote);
    const item: SpokenEvidenceItem = {
      id: nextId('derivative_type'),
      field: 'derivative_type',
      value: callPut.type,
      normalized_value: callPut.type,
      exact_quote: callPut.quote,
      speaker: ts.speaker,
      timestamp_start: ts.start,
      timestamp_end: ts.end,
      source: 'primary_asr',
      confidence: callPut.confidence,
    };
    detectedDerivatives.push(item);
    evidenceItems.push(item);
  }
  if (callPut.strike) {
    const ts = findTimestamps(String(callPut.strike));
    const strikeItem: SpokenEvidenceItem = {
      id: nextId('strike'),
      field: 'strike',
      value: callPut.strike,
      normalized_value: callPut.strike,
      exact_quote: String(callPut.strike),
      speaker: ts.speaker,
      timestamp_start: ts.start,
      timestamp_end: ts.end,
      source: 'primary_asr',
      confidence: 0.95,
    };
    detectedDerivatives.push(strikeItem);
    evidenceItems.push(strikeItem);
  }
  if (callPut.conflict) {
    conflictReasons.push('CALL vs PUT conflict detected in spoken dialogue.');
  }

  // 5. Quantity & Price Extraction from Spoken & Numeric Tokens
  const detectedQuantities: SpokenEvidenceItem[] = [];
  const detectedPrices: SpokenEvidenceItem[] = [];
  const numericTokens = extractNumericTokens(transcript);
  const hasCmp = mentionsMarketPriceOrCMP(transcript);

  if (hasCmp) {
    const ts = findTimestamps('market price');
    const cmpItem: SpokenEvidenceItem = {
      id: nextId('price'),
      field: 'price',
      value: 'Current Market Price (CMP)',
      normalized_value: 'CMP',
      exact_quote: 'current market price',
      speaker: ts.speaker,
      timestamp_start: ts.start,
      timestamp_end: ts.end,
      source: 'primary_asr',
      confidence: 1.0,
    };
    detectedPrices.push(cmpItem);
    evidenceItems.push(cmpItem);
  }

  // Look for quantity patterns (e.g. "100 shares", "50 qty", "100 quantity", "Buy 100 TCS")
  const qtyPatterns = [
    /\b(\d+(?:\.\d+)?)\s*(?:shares?|qty|quantity|lots?|nag|hisse)\b/i,
    /\b(?:shares?|qty|quantity|lots?|nag|hisse)\s*(?:of\s*)?(\d+(?:\.\d+)?)\b/i,
    /\b(?:buy|buying|sell|selling|purchase|purchasing|order(?:\s+for)?|kharid|kharido|bech|becho|placed|placing)\s+(\d+(?:\.\d+)?)\s+(?:shares?\s+of\s+)?([A-Za-z0-9&]+)\b/i,
  ];

  for (const qp of qtyPatterns) {
    let m: RegExpExecArray | null;
    const globalQp = new RegExp(qp.source, 'gi');
    while ((m = globalQp.exec(transcript)) !== null) {
      const rawNum = m[1];
      const val = parseFloat(rawNum);
      if (!isNaN(val) && val > 0) {
        const ts = findTimestamps(m[0]);
        const item: SpokenEvidenceItem = {
          id: nextId('quantity'),
          field: 'quantity',
          value: val,
          normalized_value: val,
          exact_quote: m[0],
          speaker: ts.speaker,
          timestamp_start: ts.start,
          timestamp_end: ts.end,
          source: 'primary_asr',
          confidence: 0.95,
        };
        detectedQuantities.push(item);
        evidenceItems.push(item);
      }
    }
  }

  // Look for price patterns (e.g. "at 3500", "price 3500", "₹3500", "rs 3500", "rate 3500", "bhav 3500", "@ 3500")
  const pricePatterns = [
    /\b(?:at|@|price|rate|bhav|rupees?|rs\.?|₹)\s*(\d+(?:\.\d+)?)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr|pe|par)\b/i,
  ];

  for (const pp of pricePatterns) {
    let m: RegExpExecArray | null;
    const globalPp = new RegExp(pp.source, 'gi');
    while ((m = globalPp.exec(transcript)) !== null) {
      const rawNum = m[1];
      const val = parseFloat(rawNum);
      if (!isNaN(val) && val > 0 && !detectedQuantities.some((q) => q.normalized_value === val)) {
        if (!detectedPrices.some((p) => p.normalized_value === val)) {
          const ts = findTimestamps(m[0]);
          const item: SpokenEvidenceItem = {
            id: nextId('price'),
            field: 'price',
            value: val,
            normalized_value: val,
            exact_quote: m[0],
            speaker: ts.speaker,
            timestamp_start: ts.start,
            timestamp_end: ts.end,
            source: 'primary_asr',
            confidence: 0.95,
          };
          detectedPrices.push(item);
          evidenceItems.push(item);
        }
      }
    }
  }

  // If no explicit "shares" suffix, check all numeric tokens against reference trade
  for (const token of numericTokens) {
    // If token matches reference quantity and not yet recorded
    if (referenceTrade?.quantity && Math.abs(token - referenceTrade.quantity) < 0.01) {
      if (!detectedQuantities.some((q) => q.normalized_value === token)) {
        const ts = findTimestamps(String(token));
        const item: SpokenEvidenceItem = {
          id: nextId('quantity'),
          field: 'quantity',
          value: token,
          normalized_value: token,
          exact_quote: String(token),
          speaker: ts.speaker,
          timestamp_start: ts.start,
          timestamp_end: ts.end,
          source: 'primary_asr',
          confidence: 0.90,
        };
        detectedQuantities.push(item);
        evidenceItems.push(item);
      }
    }

    // If token matches reference price and not yet recorded
    if (referenceTrade?.price && Math.abs(token - referenceTrade.price) < 0.01) {
      if (!detectedPrices.some((p) => p.normalized_value === token)) {
        const ts = findTimestamps(String(token));
        const item: SpokenEvidenceItem = {
          id: nextId('price'),
          field: 'price',
          value: token,
          normalized_value: token,
          exact_quote: String(token),
          speaker: ts.speaker,
          timestamp_start: ts.start,
          timestamp_end: ts.end,
          source: 'primary_asr',
          confidence: 0.90,
        };
        detectedPrices.push(item);
        evidenceItems.push(item);
      }
    }
  }

  // Fallback: If still no quantity detected, check if there is an unassigned numeric token
  if (detectedQuantities.length === 0) {
    for (const token of numericTokens) {
      const isPrice = detectedPrices.some((p) => Number(p.normalized_value) === token);
      const isPhone = String(token).length >= 10;
      const isStrike = detectedDerivatives.some((d) => Number(d.normalized_value) === token);
      const isClientDigit = detectedClientCode && String(detectedClientCode.normalized_value).includes(String(token));
      if (!isPrice && !isPhone && !isStrike && !isClientDigit && token > 0) {
        const ts = findTimestamps(String(token));
        const item: SpokenEvidenceItem = {
          id: nextId('quantity'),
          field: 'quantity',
          value: token,
          normalized_value: token,
          exact_quote: String(token),
          speaker: ts.speaker,
          timestamp_start: ts.start,
          timestamp_end: ts.end,
          source: 'primary_asr',
          confidence: 0.90,
        };
        detectedQuantities.push(item);
        evidenceItems.push(item);
        break;
      }
    }
  }

  // Sort quantities and prices in order of appearance in transcript, and deduplicate overlapping matches
  detectedQuantities.sort((a, b) => {
    const idxA = transcript.toLowerCase().indexOf(a.exact_quote.toLowerCase());
    const idxB = transcript.toLowerCase().indexOf(b.exact_quote.toLowerCase());
    return idxA - idxB;
  });

  const dedupedQuantities: SpokenEvidenceItem[] = [];
  for (const q of detectedQuantities) {
    const qIndex = transcript.toLowerCase().indexOf(q.exact_quote.toLowerCase());
    const isDup = dedupedQuantities.some((ex) => {
      const exIndex = transcript.toLowerCase().indexOf(ex.exact_quote.toLowerCase());
      return ex.normalized_value === q.normalized_value && Math.abs(exIndex - qIndex) < 30;
    });
    if (!isDup) dedupedQuantities.push(q);
  }
  detectedQuantities.length = 0;
  detectedQuantities.push(...dedupedQuantities);

  detectedPrices.sort((a, b) => {
    const idxA = transcript.toLowerCase().indexOf(a.exact_quote.toLowerCase());
    const idxB = transcript.toLowerCase().indexOf(b.exact_quote.toLowerCase());
    return idxA - idxB;
  });

  const dedupedPrices: SpokenEvidenceItem[] = [];
  for (const p of detectedPrices) {
    const pIndex = transcript.toLowerCase().indexOf(p.exact_quote.toLowerCase());
    const isDup = dedupedPrices.some((ex) => {
      const exIndex = transcript.toLowerCase().indexOf(ex.exact_quote.toLowerCase());
      return ex.normalized_value === p.normalized_value && Math.abs(exIndex - pIndex) < 30;
    });
    if (!isDup) dedupedPrices.push(p);
  }
  detectedPrices.length = 0;
  detectedPrices.push(...dedupedPrices);

  // 6. Customer Acknowledgement (Q4)
  const ack = evaluateCustomerAcknowledgement(transcript);
  const ackTs = findTimestamps(ack.quote);
  const detectedCustomerAck: SpokenEvidenceItem = {
    id: nextId('customer_ack'),
    field: 'customer_ack',
    value: ack.confirmed ? 'CONFIRMED' : 'REJECTED_OR_UNCONFIRMED',
    normalized_value: ack.confirmed ? 'PASS' : 'FAIL',
    exact_quote: ack.quote,
    speaker: ackTs.speaker === 'UNKNOWN' ? 'CLIENT' : ackTs.speaker,
    timestamp_start: ackTs.start,
    timestamp_end: ackTs.end,
    source: 'primary_asr',
    confidence: ack.confidence,
  };
  evidenceItems.push(detectedCustomerAck);

  // 7. Return Commitment (Q5)
  const ret = evaluateReturnCommitment(transcript);
  const retTs = findTimestamps(ret.quote);
  const detectedReturnCommitment: SpokenEvidenceItem = {
    id: nextId('return_commitment'),
    field: 'return_commitment',
    value: ret.hasCommitment ? 'PROHIBITED_COMMITMENT_FOUND' : 'NO_COMMITMENT_MADE',
    normalized_value: ret.hasCommitment ? 'FAIL' : 'PASS',
    exact_quote: ret.quote,
    speaker: retTs.speaker === 'UNKNOWN' ? 'ADVISOR' : retTs.speaker,
    timestamp_start: retTs.start,
    timestamp_end: retTs.end,
    source: 'primary_asr',
    confidence: ret.confidence,
  };
  evidenceItems.push(detectedReturnCommitment);

  // 8. Authentication Markers (for Q1 fallback when numbers mismatch)
  const detectedAuthMarkers: SpokenEvidenceItem[] = [];
  const authPatterns = [
    /\b(?:otp|one time password|security questions?|pan card|date of birth)\b/gi,
  ];
  for (const ap of authPatterns) {
    let am: RegExpExecArray | null;
    while ((am = ap.exec(transcript)) !== null) {
      const ts = findTimestamps(am[0]);
      const item: SpokenEvidenceItem = {
        id: nextId('auth_marker'),
        field: 'auth_marker',
        value: am[0],
        normalized_value: am[0].toUpperCase(),
        exact_quote: am[0],
        speaker: ts.speaker,
        timestamp_start: ts.start,
        timestamp_end: ts.end,
        source: 'primary_asr',
        confidence: 0.90,
      };
      detectedAuthMarkers.push(item);
      evidenceItems.push(item);
    }
  }

  // Detect critical conflicts against reference trade data (if provided)
  if (referenceTrade) {
    // Symbol mismatch
    if (referenceTrade.symbol && detectedSymbols.length > 0 && !detectedSymbols.some((s) => s.normalized_value === referenceTrade.symbol)) {
      conflictReasons.push(`Spoken symbol (${detectedSymbols[0].normalized_value}) conflicts with reference trade symbol (${referenceTrade.symbol}).`);
    }
    // Side mismatch
    if (referenceTrade.side && detectedSides.length > 0 && !detectedSides.some((s) => s.normalized_value === referenceTrade.side)) {
      conflictReasons.push(`Spoken side (${detectedSides[0].normalized_value}) conflicts with reference trade side (${referenceTrade.side}).`);
    }
    // Quantity mismatch
    if (
      referenceTrade.quantity &&
      detectedQuantities.length > 0 &&
      !detectedQuantities.some((q) => Math.abs(Number(q.normalized_value) - referenceTrade.quantity) < 0.01)
    ) {
      conflictReasons.push(`Spoken quantity (${detectedQuantities[0].normalized_value}) conflicts with reference trade quantity (${referenceTrade.quantity}).`);
    }
    // Price mismatch (when not CMP)
    if (
      !hasCmp &&
      referenceTrade.price &&
      detectedPrices.length > 0 &&
      !detectedPrices.some((p) => Math.abs(Number(p.normalized_value) - referenceTrade.price) < 0.01)
    ) {
      conflictReasons.push(`Spoken price (${detectedPrices[0].normalized_value}) conflicts with reference trade price (₹${referenceTrade.price}).`);
    }
  }

  const hasCriticalConflict = conflictReasons.length > 0;

  return {
    rawTranscript: transcript,
    evidenceItems,
    detectedClientCode,
    detectedSymbols,
    detectedSides,
    detectedDerivatives,
    detectedQuantities,
    detectedPrices,
    detectedCustomerAck,
    detectedReturnCommitment,
    detectedAuthMarkers,
    hasCmpMention: hasCmp,
    hasCriticalConflict,
    conflictReasons,
  };
}

/**
 * Extracts structured order objects from conversation dialogue (O-01 through O-12).
 * Strictly preserves null values for omitted parameters (no invented values).
 * Links each extracted field to exact transcript segment evidence.
 */
export function extractStructuredOrders(
  transcript: string,
  segments: SegmentInfo[] = [],
  referenceTrade?: TradeRecord
): StructuredOrderExtraction[] {
  const callEvidence = extractSpokenEvidence(transcript, segments, referenceTrade);
  const orders: StructuredOrderExtraction[] = [];

  // Helper to map evidence segment IDs
  const getEvidenceSegmentIds = (quote?: string): string[] => {
    if (!quote || segments.length === 0) return [];
    const lowerQuote = quote.toLowerCase();
    const matched = segments
      .map((s, idx) => ({ id: `seg_${idx + 1}`, text: s.text.toLowerCase() }))
      .filter((s) => s.text.includes(lowerQuote))
      .map((s) => s.id);
    return matched.length > 0 ? matched : [];
  };

  // Detect temporal context
  const isHistorical = /\b(?:yesterday|kal\s+(?:liya|becha|kar\s+diya)|already\s+done|previously\s+executed|last\s+week)\b/i.test(transcript);
  const isFuture = /\b(?:tomorrow|kal\s+(?:dena|karenge|dekhna)|next\s+week|after\s+some\s+time)\b/i.test(transcript);
  const timing = isHistorical ? 'HISTORICAL' : isFuture ? 'FUTURE' : 'CURRENT';

  // Extract client UCC
  const spokenUcc = callEvidence.detectedClientCode ? String(callEvidence.detectedClientCode.normalized_value) : (referenceTrade?.client ? normalizeClientCode(referenceTrade.client) : null);
  const uccEvidence = callEvidence.detectedClientCode?.exact_quote ? getEvidenceSegmentIds(callEvidence.detectedClientCode.exact_quote) : [];

  // Iterate over detected actions or default single order
  const detectedSide = detectBuySell(transcript);
  const actionItems = callEvidence.detectedSides.length > 0 ? callEvidence.detectedSides : [{
    value: detectedSide.side || null,
    exact_quote: detectedSide.quote || '',
    confidence: detectedSide.confidence,
  }];

  const symbolItems = callEvidence.detectedSymbols;
  const quantityItems = callEvidence.detectedQuantities;
  const priceItems = callEvidence.detectedPrices;
  const hasCmp = callEvidence.hasCmpMention || mentionsMarketPriceOrCMP(transcript);

  const numOrders = Math.max(1, Math.min(actionItems.length, Math.max(symbolItems.length, 1)));

  for (let i = 0; i < numOrders; i++) {
    const actItem = actionItems[i] || actionItems[0];
    const symItem = symbolItems[i] || symbolItems[0];
    const qtyItem = quantityItems[i] || quantityItems[0];
    const prcItem = priceItems[i] || priceItems[0];

    const actionVal = (actItem?.value as 'BUY' | 'SELL') || null;
    const symbolVal = symItem ? String(symItem.normalized_value) : (referenceTrade && matchSymbolInTranscript(referenceTrade.symbol, transcript).matched ? referenceTrade.symbol : null);
    const qtyVal = qtyItem ? Number(qtyItem.normalized_value) : null;
    const isOrderCmp = prcItem?.normalized_value === 'CMP' || (i === 0 && hasCmp && (!prcItem || typeof prcItem.normalized_value !== 'number'));
    const isNumericPrice = prcItem && typeof prcItem.normalized_value === 'number' && prcItem.normalized_value > 0;

    const priceVal = isOrderCmp ? null : (isNumericPrice ? Number(prcItem.normalized_value) : null);
    const priceTypeVal = isOrderCmp ? 'CMP' : (isNumericPrice ? 'LIMIT' : (hasCmp ? 'CMP' : null));

    const evidenceObj: StructuredOrderExtraction['evidence'] = {};
    if (actItem?.exact_quote) evidenceObj.action = getEvidenceSegmentIds(actItem.exact_quote);
    if (symItem?.exact_quote) evidenceObj.symbol = getEvidenceSegmentIds(symItem.exact_quote);
    if (qtyItem?.exact_quote) evidenceObj.quantity = getEvidenceSegmentIds(qtyItem.exact_quote);
    if (hasCmp) evidenceObj.price_type = getEvidenceSegmentIds('cmp');
    if (prcItem?.exact_quote) evidenceObj.price = getEvidenceSegmentIds(prcItem.exact_quote);
    if (callEvidence.detectedClientCode?.exact_quote) evidenceObj.ucc = uccEvidence;

    const confAction = actItem?.confidence || (actionVal ? 0.90 : 0);
    const confSymbol = symItem?.confidence || (symbolVal ? 0.90 : 0);
    const confQty = qtyItem?.confidence || (qtyVal !== null ? 0.90 : 0);
    const confPrice = hasCmp ? 0.95 : (prcItem?.confidence || (priceVal !== null ? 0.85 : 0));
    const confUcc = callEvidence.detectedClientCode?.confidence || (spokenUcc ? 0.80 : 0);

    const scores = [confAction, confSymbol, confQty, confPrice].filter((s) => s > 0);
    const overall = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0.50;

    orders.push({
      action: actionVal,
      symbol: symbolVal,
      quantity: qtyVal,
      price: priceVal,
      price_type: priceTypeVal,
      ucc: spokenUcc,
      order_timing: timing,
      confidence: {
        action: confAction,
        symbol: confSymbol,
        quantity: confQty,
        price: confPrice,
        ucc: confUcc,
        overall,
      },
      evidence: evidenceObj,
    });
  }

  return orders;
}
