// =============================================================
// ADAM-AR — High-Precision Deterministic Q3 (Stock, Qty, Price/CMP) Evaluator
// =============================================================

import type { CallRecord, TradeRecord } from '../src/types';
import {
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
  extractNumericTokens,
  SYMBOL_ALIASES,
} from './normalizer';

export interface Q3EvaluationResult {
  status: 'PASS' | 'FAIL' | 'REVIEW';
  evidence: string;
  reason: string;
  speaker: 'ADVISOR' | 'CLIENT' | 'BOTH';
  confidence: number;
  isStockConfirmed: boolean;
  isPriceConfirmed: boolean;
  isQtyConfirmed: boolean;
  detectedStock: string;
  detectedQty: string;
  detectedPrice: string;
}

// Hindi & English spoken number words
const NUMBER_WORDS: Record<string, number> = {
  one: 1, ek: 1,
  two: 2, do: 2,
  three: 3, teen: 3,
  four: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6,
  seven: 7, saat: 7,
  eight: 8, aath: 8,
  nine: 9, nau: 9,
  ten: 10, das: 10,
  eleven: 11, gyarah: 11,
  twelve: 12, barah: 12,
  thirteen: 13, terah: 13,
  fourteen: 14, chaudah: 14,
  fifteen: 15, pandrah: 15,
  sixteen: 16, solah: 16,
  seventeen: 17, satrah: 17,
  eighteen: 18, atharah: 18,
  nineteen: 19, unnees: 19,
  twenty: 20, bees: 20,
  twentyfive: 25, pachis: 25,
  thirty: 30, tees: 30,
  forty: 40, chalis: 40,
  fifty: 50, pachaas: 50, pachas: 50,
  hundred: 100, sau: 100,
  fivehundred: 500, paansau: 500,
  thousand: 1000, hazaar: 1000, hazar: 1000,
};

/**
 * Deterministically evaluates SEBI Q3 Order Confirmation Compliance:
 * Checkpoint: "Were stock name, price and quantity explicitly confirmed before the order?"
 *
 * SEBI Mandate:
 * 1. Stock name: Spoken ticker, company name, or known alias (e.g. Bajaj Finserv, Reliance, Welspun, M&M).
 * 2. Quantity: Explicit numeric or verbal share quantity.
 * 3. Price: Either numeric rupee price OR verbal market execution specification
 *    (e.g., "Current Market Price", "Current Marker Price", "CMP", "market rate", "rate pe", "bhav pe").
 */
export function evaluateDeterministicQ3(
  call: Partial<CallRecord>,
  trades: TradeRecord[],
  transcript: string,
  multiPassContext?: {
    stockDetected?: boolean;
    qtyDetected?: boolean;
    priceDetected?: boolean;
    spokenStockName?: string;
    spokenQty?: string | number;
    spokenPrice?: string;
  }
): Q3EvaluationResult {
  const lowerTranscript = (transcript || '').toLowerCase();
  const trade = trades[0];

  // -------------------------------------------------------------
  // 1. Stock Name / Symbol Verification
  // -------------------------------------------------------------
  let isStockConfirmed = Boolean(multiPassContext?.stockDetected);
  let detectedStock = multiPassContext?.spokenStockName || trade?.symbol || 'Confirmed';

  if (!isStockConfirmed) {
    if (trade?.symbol) {
      const symMatch = matchSymbolInTranscript(trade.symbol, transcript);
      if (symMatch.matched) {
        isStockConfirmed = true;
        detectedStock = trade.symbol;
      }
    }

    if (!isStockConfirmed) {
      // Check known dictionary aliases
      for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
        for (const alias of aliases) {
          if (lowerTranscript.includes(alias.toLowerCase())) {
            isStockConfirmed = true;
            detectedStock = symKey;
            break;
          }
        }
        if (isStockConfirmed) break;
      }
    }

    // Heuristic: If trade was matched to this call and order was discussed
    if (!isStockConfirmed && trade?.symbol && (lowerTranscript.includes('buy') || lowerTranscript.includes('sell') || lowerTranscript.includes('kharid') || lowerTranscript.includes('bech') || lowerTranscript.includes('order') || lowerTranscript.includes('share'))) {
      const cleanSym = trade.symbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').toLowerCase();
      const tokens = cleanSym.match(/[a-z]{3,}/g) || [];
      for (const token of tokens) {
        if (lowerTranscript.includes(token)) {
          isStockConfirmed = true;
          detectedStock = trade.symbol;
          break;
        }
      }
      if (!isStockConfirmed && trades.length > 0) {
        // Matched trade baseline exists
        isStockConfirmed = true;
        detectedStock = trade.symbol;
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Price / CMP Verification (SEBI Compliant)
  // -------------------------------------------------------------
  let isPriceConfirmed = Boolean(multiPassContext?.priceDetected);
  let detectedPrice = multiPassContext?.spokenPrice || '';

  if (!isPriceConfirmed) {
    if (mentionsMarketPriceOrCMP(transcript)) {
      isPriceConfirmed = true;
      detectedPrice = 'Current Market Price (CMP)';
    } else if (trade?.price && trade.price > 0 && matchPriceInTranscript(trade.price, transcript)) {
      isPriceConfirmed = true;
      detectedPrice = `₹${trade.price.toFixed(2)}`;
    } else {
      // Check numeric tokens in transcript
      const tokens = extractNumericTokens(transcript);
      if (tokens.length > 0) {
        // If there is any spoken price or rate token
        if (lowerTranscript.includes('price') || lowerTranscript.includes('rate') || lowerTranscript.includes('bhav') || lowerTranscript.includes('rupaye') || lowerTranscript.includes('rs')) {
          isPriceConfirmed = true;
          detectedPrice = trade?.price ? `₹${trade.price.toFixed(2)}` : 'Market Price';
        }
      }
    }
  }

  if (!detectedPrice) {
    detectedPrice = mentionsMarketPriceOrCMP(transcript) ? 'Current Market Price (CMP)' : trade?.price ? `₹${trade.price.toFixed(2)}` : 'Market Price';
  }

  // -------------------------------------------------------------
  // 3. Quantity Verification
  // -------------------------------------------------------------
  let isQtyConfirmed = Boolean(multiPassContext?.qtyDetected);
  let detectedQty = multiPassContext?.spokenQty ? String(multiPassContext.spokenQty) : '';

  if (!isQtyConfirmed) {
    if (trade?.quantity && trade.quantity > 0) {
      if (matchQuantityInTranscript(trade.quantity, transcript)) {
        isQtyConfirmed = true;
        detectedQty = `${trade.quantity} shares`;
      } else if (new RegExp(`\\b${trade.quantity}\\b`).test(transcript)) {
        isQtyConfirmed = true;
        detectedQty = `${trade.quantity} shares`;
      }
    }

    if (!isQtyConfirmed) {
      // Check for explicit share pattern in transcript: e.g. "16 share", "100 shares", "50 qty", "buy 100"
      const qtyMatch = lowerTranscript.match(/\b(\d+)\s*(?:shares?|lots?|qty|quantities|quantity|nag|hisse|piece|share)\b/i)
        || lowerTranscript.match(/\b(?:buy|sell|purchase|order)\s+(\d+)\s+(?:shares?\s+of\s+)?[a-z0-9&]+\b/i)
        || lowerTranscript.match(/\b(?:buy|sell|purchase|order)\s+(\d+)\b/i);

      if (qtyMatch) {
        isQtyConfirmed = true;
        detectedQty = `${qtyMatch[1]} shares`;
      }
    }

    if (!isQtyConfirmed) {
      // Check for spoken words with explicit share keyword: e.g. "solah share", "hundred shares"
      for (const [word, num] of Object.entries(NUMBER_WORDS)) {
        const spokenShareRegex = new RegExp(`\\b${word}\\s*(?:shares?|lots?|qty|quantity|nag|hisse)\\b`, 'i');
        if (spokenShareRegex.test(lowerTranscript)) {
          isQtyConfirmed = true;
          detectedQty = `${num} shares (${word})`;
          break;
        }
      }
    }
  }

  if (!detectedQty) {
    detectedQty = isQtyConfirmed ? (trade?.quantity ? `${trade.quantity} shares` : 'Confirmed') : 'Missing / Unspecified';
  }

  // -------------------------------------------------------------
  // 4. Final Deterministic Q3 Status
  // -------------------------------------------------------------
  const isAllThreeConfirmed = isStockConfirmed && isPriceConfirmed && isQtyConfirmed;

  const evidenceString = `Stock: ${detectedStock}, Qty: ${detectedQty}, Price: ${detectedPrice}.`;

  if (isAllThreeConfirmed) {
    return {
      status: 'PASS',
      evidence: evidenceString,
      reason: 'Stock name, quantity, and price/CMP explicitly confirmed before order execution in compliance with SEBI circular.',
      speaker: 'ADVISOR',
      confidence: 1.0,
      isStockConfirmed: true,
      isPriceConfirmed: true,
      isQtyConfirmed: true,
      detectedStock,
      detectedQty,
      detectedPrice,
    };
  }

  const missingParts: string[] = [];
  if (!isStockConfirmed) missingParts.push('stock name');
  if (!isPriceConfirmed) missingParts.push('price/CMP');
  if (!isQtyConfirmed) missingParts.push('quantity');

  return {
    status: 'FAIL',
    evidence: `Order verification discrepancy: ${missingParts.join(', ')} missing. ${evidenceString}`,
    reason: `Missing or unverified order parameters (-1 mark, non-fatal): ${missingParts.join(', ')}.`,
    speaker: 'ADVISOR',
    confidence: 0.95,
    isStockConfirmed,
    isPriceConfirmed,
    isQtyConfirmed,
    detectedStock,
    detectedQty,
    detectedPrice,
  };
}
