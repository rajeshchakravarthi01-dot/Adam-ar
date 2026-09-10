// =============================================================
// AuditEQ — Stringent Mail Confirmation Matching & Audit Engine
// =============================================================
import type { TradeRecord } from '../src/types';
import {
  matchSymbolInTranscript,
  matchQuantityInTranscript,
  matchPriceInTranscript,
  mentionsMarketPriceOrCMP,
  normalizeClientCode,
  matchClientCodeInTranscript,
  extractNumericTokens,
  detectBuySell,
  SYMBOL_ALIASES,
} from './normalizer';

export interface MailMatchEvidence {
  stock: {
    matched: boolean;
    symbol?: string;
    matchedAlias?: string;
    details?: string;
  };
  quantity: {
    matched: boolean;
    quantity?: number;
    details?: string;
  };
  price: {
    matched: boolean;
    price?: number;
    isCMP?: boolean;
    details?: string;
  };
  side: {
    matched: boolean;
    side?: 'BUY' | 'SELL';
    details?: string;
  };
  client: {
    matched: boolean;
    clientCode?: string;
    details?: string;
  };
}

export interface MailMatchCandidateResult {
  fileName: string;
  matched: boolean;
  tradeId?: number;
  trade?: TradeRecord;
  confidenceScore: number;
  reason: string;
  evidence: MailMatchEvidence;
  scorecardId?: number;
}

/**
 * Checks if a specific stock symbol or known alias exists in the mail text.
 */
export function checkStockInMail(symbol: string, mailText: string): { matched: boolean; alias?: string; details: string } {
  if (!symbol || !mailText) {
    return { matched: false, details: 'Symbol or mail text missing' };
  }

  const rawSym = symbol.trim().toUpperCase();
  const baseSym = rawSym
    .replace(/-(?:EQ|BE|SM|BZ|BL|ST|E1|N1|GB|IL|IT)$/i, '')
    .replace(/[:.]\w+$/i, '')
    .replace(/[^A-Z0-9&]/gi, '');

  const lowerMail = mailText.toLowerCase();

  // 1. Direct symbol check with word boundaries
  const symRegex = new RegExp(`\\b${baseSym.toLowerCase()}\\b`, 'i');
  if (symRegex.test(lowerMail)) {
    return { matched: true, alias: baseSym, details: `Stock symbol "${baseSym}" found in mail` };
  }

  // 2. Check full symbol
  if (rawSym !== baseSym && new RegExp(`\\b${rawSym.toLowerCase()}\\b`, 'i').test(lowerMail)) {
    return { matched: true, alias: rawSym, details: `Stock symbol "${rawSym}" found in mail` };
  }

  // 3. Check known aliases (e.g. INFY -> Infosys, RELIANCE -> Reliance Industries, TATAMOTORS -> Tata Motors)
  const aliases = Array.from(new Set([
    ...(SYMBOL_ALIASES[rawSym] || []),
    ...(SYMBOL_ALIASES[baseSym] || []),
  ]));

  for (const alias of aliases) {
    const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasRegex = new RegExp(`\\b${aliasEscaped}\\b`, 'i');
    if (aliasRegex.test(lowerMail)) {
      return { matched: true, alias, details: `Stock alias "${alias}" (${rawSym}) confirmed in mail` };
    }
  }

  // 4. Use normalizer matchSymbolInTranscript
  const normResult = matchSymbolInTranscript(rawSym, mailText);
  if (normResult.matched) {
    return { matched: true, alias: normResult.matchedAlias, details: `Stock "${normResult.matchedAlias}" confirmed in mail dialogue` };
  }

  return { matched: false, details: `Stock symbol "${symbol}" not detected in mail text` };
}

/**
 * Checks if a specific trade quantity exists in the mail text.
 */
export function checkQuantityInMail(quantity: number, mailText: string): { matched: boolean; details: string } {
  if (!quantity || quantity <= 0 || !mailText) {
    return { matched: false, details: 'Invalid quantity or missing mail content' };
  }

  const lower = mailText.toLowerCase();
  const qStr = String(quantity);

  // 1. Explicit quantity patterns: e.g. "100 shares", "qty 100", "quantity: 100", "100 nos", "100 units"
  const patterns = [
    new RegExp(`(?:\\b|\\D)${qStr}\\s*(?:shares?|qty|quantit(?:y|ies)|stocks?|units?|contracts?|nos?)\\b`, 'i'),
    new RegExp(`\\b(?:qty|quantity|shares?|units?|size)\\s*[:=\\-]?\\s*${qStr}\\b`, 'i'),
    new RegExp(`\\b(?:buy|sell|bought|sold|purchased?|order|trade)\\s+(?:(?:for|of|around|approx|at)\\s+)?${qStr}\\b`, 'i'),
    new RegExp(`\\b${qStr}\\s+(?:of|in)\\s+[a-zA-Z]{3,}`, 'i'),
  ];

  for (const p of patterns) {
    if (p.test(lower)) {
      return { matched: true, details: `Exact quantity ${quantity} confirmed with explicit trade context in mail` };
    }
  }

  // 2. Fallback to normalizer quantity detection
  if (matchQuantityInTranscript(quantity, mailText)) {
    return { matched: true, details: `Trade quantity ${quantity} confirmed in mail context` };
  }

  // 3. Exact standalone integer match (ensuring not a 4-digit year like 2026 or timestamp)
  const isYear = quantity >= 1990 && quantity <= 2040;
  if (!isYear) {
    const standaloneRegex = new RegExp(`(?<![\\d.:])${qStr}(?![\\d.:])`);
    if (standaloneRegex.test(mailText)) {
      return { matched: true, details: `Quantity numeric value ${quantity} found in mail text` };
    }
  }

  return { matched: false, details: `Quantity ${quantity} not found in mail text` };
}

/**
 * Checks if price matches, OR if Current Market Price (CMP) is explicitly mentioned.
 * Stringent requirement: "price { Ignore if mentioned CMP }"
 */
export function checkPriceOrCMPInMail(price: number, mailText: string): { matched: boolean; isCMP: boolean; details: string } {
  if (!mailText) {
    return { matched: false, isCMP: false, details: 'Empty mail content' };
  }

  const lower = mailText.toLowerCase();

  // 1. Check if CMP (Current Market Price / Market Rate) is explicitly mentioned
  const isCMP =
    /\b(?:cmp|current\s*market\s*price|current\s*price|market\s*price|market\s*rate|at\s*market|market\s*order|current\s*bhav|bhav\s*(?:pe|par)|live\s*rate)\b/i.test(
      lower
    ) || mentionsMarketPriceOrCMP(mailText);

  if (isCMP) {
    return {
      matched: true,
      isCMP: true,
      details: 'Current Market Price (CMP) explicitly specified in mail — price requirement satisfied.',
    };
  }

  // 2. If CMP is NOT mentioned, check for target price
  if (!price || price <= 0) {
    return { matched: false, isCMP: false, details: 'Trade price is not specified and CMP not mentioned' };
  }

  const pStr = String(price);
  const roundedP = Math.round(price);
  const roundedStr = String(roundedP);

  // Exact price pattern: e.g. "at 1850.50", "@ 1850.50", "price: 1850.50", "rate: 1850"
  const pricePatterns = [
    new RegExp(`(?:at|@|price|rate|limit|rs\\.?|inr|₹)\\s*[:=\\-]?\\s*(?:₹|rs\\.?|inr)?\\s*${pStr.replace('.', '\\.')}\\b`, 'i'),
    new RegExp(`(?:at|@|price|rate|limit|rs\\.?|inr|₹)\\s*[:=\\-]?\\s*(?:₹|rs\\.?|inr)?\\s*${roundedStr}\\b`, 'i'),
  ];

  for (const pat of pricePatterns) {
    if (pat.test(lower)) {
      return {
        matched: true,
        isCMP: false,
        details: `Specific execution price ${price} verified in mail text`,
      };
    }
  }

  // Fallback to normalizer matchPriceInTranscript
  if (matchPriceInTranscript(price, mailText)) {
    return {
      matched: true,
      isCMP: false,
      details: `Execution price ${price} verified in mail context`,
    };
  }

  return {
    matched: false,
    isCMP: false,
    details: `Trade price ${price} was not found and CMP was not mentioned in the email`,
  };
}

/**
 * Checks client code / UCC match in mail.
 */
export function checkClientCodeInMail(clientCode?: string, mailText?: string): { matched: boolean; details: string } {
  if (!clientCode || !mailText) {
    return { matched: false, details: 'No client code or mail text' };
  }

  const normExpected = normalizeClientCode(clientCode);
  if (!normExpected) return { matched: false, details: 'Invalid client code' };

  if (mailText.toUpperCase().includes(normExpected)) {
    return { matched: true, details: `Client UCC ${clientCode} explicitly confirmed in mail` };
  }

  const normRes = matchClientCodeInTranscript(clientCode, mailText);
  if (normRes.matched) {
    return { matched: true, details: `Client UCC ${clientCode} verified (${normRes.reason})` };
  }

  return { matched: false, details: `Client UCC ${clientCode} not detected in mail text` };
}

/**
 * Checks side (BUY / SELL) consistency in mail.
 */
export function checkSideInMail(side?: string, mailText?: string): { matched: boolean; detectedSide?: 'BUY' | 'SELL'; details: string } {
  if (!side || !mailText) {
    return { matched: true, details: 'Side not specified' };
  }

  const expectedSide = side.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const det = detectBuySell(mailText);

  if (!det.side) {
    return { matched: true, details: 'No conflicting trade side in mail text' };
  }

  if (det.side === expectedSide) {
    return {
      matched: true,
      detectedSide: det.side,
      details: `Order side ${expectedSide} confirmed by keywords in mail (${det.quote})`,
    };
  }

  // Conflict (e.g. trade is BUY but mail explicitly says only SELL)
  return {
    matched: false,
    detectedSide: det.side,
    details: `Order side mismatch: expected ${expectedSide}, mail suggests ${det.side}`,
  };
}

/**
 * Evaluates a single mail file against all pending candidates and returns the best matching trade.
 * Enforces strict criteria:
 *   - Stock Symbol MUST match
 *   - Quantity MUST match
 *   - Price MUST match (or CMP must be explicitly mentioned)
 */
export function matchMailToCandidates(
  fileName: string,
  mailContent: string,
  candidates: TradeRecord[],
  alreadyMatchedTradeIds: Set<number>
): MailMatchCandidateResult {
  if (!mailContent || !mailContent.trim()) {
    return {
      fileName,
      matched: false,
      confidenceScore: 0,
      reason: 'Mail file is empty or unreadable.',
      evidence: {
        stock: { matched: false, details: 'Empty file' },
        quantity: { matched: false, details: 'Empty file' },
        price: { matched: false, details: 'Empty file' },
        side: { matched: false, details: 'Empty file' },
        client: { matched: false, details: 'Empty file' },
      },
    };
  }

  let bestMatch: {
    trade: TradeRecord;
    score: number;
    evidence: MailMatchEvidence;
    reason: string;
  } | null = null;

  const failedCandidatesReasons: string[] = [];

  for (const trade of candidates) {
    if (alreadyMatchedTradeIds.has(trade.id)) {
      continue; // Skip trades already allocated to another mail
    }

    const stockCheck = checkStockInMail(trade.symbol || '', mailContent);
    const qtyCheck = checkQuantityInMail(trade.quantity || 0, mailContent);
    const priceCheck = checkPriceOrCMPInMail(trade.price || 0, mailContent);
    const sideCheck = checkSideInMail(trade.side || 'BUY', mailContent);
    const clientCheck = checkClientCodeInMail(trade.client, mailContent);

    // STRINGENT GATE: Stock, Quantity, and Price (or CMP) MUST ALL MATCH
    if (!stockCheck.matched || !qtyCheck.matched || !priceCheck.matched) {
      const missing: string[] = [];
      if (!stockCheck.matched) missing.push(`Stock "${trade.symbol}"`);
      if (!qtyCheck.matched) missing.push(`Qty ${trade.quantity}`);
      if (!priceCheck.matched) missing.push(`Price ${trade.price} (CMP not mentioned)`);
      failedCandidatesReasons.push(`Trade #${trade.id} (${trade.symbol}): missing ${missing.join(', ')}`);
      continue;
    }

    // Calculate confidence score for ranking amongst eligible trades
    let score = 100; // Base score for satisfying the 3 core criteria

    if (clientCheck.matched) {
      score += 100; // Huge boost for matching client UCC
    }
    if (sideCheck.matched && sideCheck.detectedSide) {
      score += 40; // Side matches explicitly
    } else if (!sideCheck.matched) {
      score -= 30; // Side conflicting
    }

    // Check if advisor name or dealer is mentioned in mail
    if (trade.advisor_name && mailContent.toLowerCase().includes(trade.advisor_name.toLowerCase())) {
      score += 30;
    }
    if (trade.dealer && mailContent.toLowerCase().includes(trade.dealer.toLowerCase())) {
      score += 20;
    }

    // Check date proximity if trade_date is present
    if (trade.trade_date && mailContent.includes(trade.trade_date.slice(0, 10))) {
      score += 25;
    }

    const evidence: MailMatchEvidence = {
      stock: {
        matched: true,
        symbol: trade.symbol,
        matchedAlias: stockCheck.alias,
        details: stockCheck.details,
      },
      quantity: {
        matched: true,
        quantity: trade.quantity,
        details: qtyCheck.details,
      },
      price: {
        matched: true,
        price: trade.price,
        isCMP: priceCheck.isCMP,
        details: priceCheck.details,
      },
      side: {
        matched: sideCheck.matched,
        side: sideCheck.detectedSide || (trade.side as 'BUY' | 'SELL'),
        details: sideCheck.details,
      },
      client: {
        matched: clientCheck.matched,
        clientCode: trade.client,
        details: clientCheck.details,
      },
    };

    const reason = `Matched Trade #${trade.id} (${trade.symbol} ${trade.quantity} @ ${priceCheck.isCMP ? 'CMP' : trade.price}) with score ${score}.`;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { trade, score, evidence, reason };
    }
  }

  if (bestMatch) {
    return {
      fileName,
      matched: true,
      tradeId: bestMatch.trade.id,
      trade: bestMatch.trade,
      confidenceScore: bestMatch.score,
      reason: bestMatch.reason,
      evidence: bestMatch.evidence,
    };
  }

  return {
    fileName,
    matched: false,
    confidenceScore: 0,
    reason:
      failedCandidatesReasons.length > 0
        ? `No matching trade found for all 3 criteria (Stock, Qty, Price/CMP). Tested ${failedCandidatesReasons.length} candidate trades.`
        : 'No pending unconfirmed trades available to match.',
    evidence: {
      stock: { matched: false, details: 'No candidate passed all 3 stringent criteria' },
      quantity: { matched: false, details: 'No candidate passed all 3 stringent criteria' },
      price: { matched: false, details: 'No candidate passed all 3 stringent criteria' },
      side: { matched: false, details: 'N/A' },
      client: { matched: false, details: 'N/A' },
    },
  };
}
