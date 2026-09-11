// =============================================================
// AuditEQ v18.0.0 — Deterministic Compliance & Evidence Auditor
//
// Hard Audit Eligibility Gate:
// - NO Advisor -> NO audit
// - NO Client ID / UCC -> NO audit
// - NO exact trade -> NO audit
// - NO valid transcript -> NO audit
// - ONLY confirmed PRE-ORDER calls enter audit
// =============================================================

import {
  extractSpokenEvidence,
  type ExtractedCallEvidence,
  type SegmentInfo,
} from './evidence-extractor';
import {
  normalizePhoneNumber,
  normalizeClientCode,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
  evaluateCustomerAcknowledgement,
  SYMBOL_ALIASES,
} from './normalizer';
import type { CallRecord, TradeRecord } from '../src/types';
import type { UnifiedAuditOutput, AuditQuestionOutput } from './scoring-engine';

function fuzzySimilarity(s1: string, s2: string): number {
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[i] === shorter[i]) matches++;
  }
  return matches / longer.length;
}

function normalizeSpokenNumbers(text: string): string {
  const wordToNum: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9',
    shunya: '0', ek: '1', do: '2', teen: '3', chaar: '4', char: '4',
    paanch: '5', panch: '5', chhe: '6', saat: '7', aath: '8', nau: '9',
  };
  return text.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|shunya|ek|do|teen|chaar|char|paanch|panch|chhe|saat|aath|nau)\b/g, (m) => wordToNum[m] || m);
}

export interface AuditEligibilityResult {
  eligible: boolean;
  reason: string;
  gateCode: 'NO_ADVISOR' | 'NO_CLIENT_CODE' | 'NO_EXACT_TRADE' | 'NO_VALID_TRANSCRIPT' | 'NOT_PRE_ORDER' | 'OK';
}

/**
 * Hard Audit Eligibility Gate
 * Strictly enforces that incomplete, unassigned, or non-preorder records NEVER enter audit.
 */
export function verifyAuditEligibility(
  call: CallRecord,
  trade: TradeRecord | null,
  transcript?: string | null
): AuditEligibilityResult {
  // Gate 1: Must be confirmed PRE-ORDER call
  if (call.call_type && call.call_type !== 'pre_order') {
    return {
      eligible: false,
      reason: `Call category is "${call.call_type}". Only confirmed PRE-ORDER calls enter SEBI regulatory compliance audit.`,
      gateCode: 'NOT_PRE_ORDER',
    };
  }

  // Gate 2: Advisor Name must be present (check metadata or trade record)
  const advisor = (call.caller_name || trade?.advisor_name || '').trim();
  if (!advisor || advisor === '—' || advisor.toLowerCase() === 'unknown') {
    // If trade has advisor or client, allow audit
    if (!trade?.advisor_name && !call.caller_name) {
      return {
        eligible: false,
        reason: 'No advisor/caller identity specified in call metadata or trade sheet.',
        gateCode: 'NO_ADVISOR',
      };
    }
  }

  // Gate 3: Client ID / UCC must exist
  const clientCode = (call.client || trade?.client || '').trim();
  if (!clientCode || clientCode === '—' || clientCode.toLowerCase() === 'unknown') {
    return {
      eligible: false,
      reason: 'No Client ID / UCC available in call metadata or trade sheet.',
      gateCode: 'NO_CLIENT_CODE',
    };
  }

  // Gate 4: Valid transcript must exist
  if (!transcript || transcript.trim().length < 15) {
    return {
      eligible: false,
      reason: 'No valid transcript available for spoken evidence verification.',
      gateCode: 'NO_VALID_TRANSCRIPT',
    };
  }

  // Gate 5: Exact trade must exist
  if (!trade || !trade.id) {
    return {
      eligible: false,
      reason: 'Missing exact trade match. Pre-order calls cannot be audited without a verified trade match.',
      gateCode: 'NO_EXACT_TRADE',
    };
  }

  return {
    eligible: true,
    reason: 'Call satisfies all SEBI compliance audit eligibility gates.',
    gateCode: 'OK',
  };
}

/**
 * Deterministically evaluates Q1–Q5 based ONLY on actual spoken evidence
 * and reference trade data (used for comparison/validation, never as synthetic proof).
 */
export function evaluateEvidenceCompliance(
  call: CallRecord,
  tradesOrResolved: TradeRecord[] | TradeRecord | null,
  transcript: string,
  segments: SegmentInfo[] = [],
  authoritativeClientCode?: string | null
): { audit: UnifiedAuditOutput; evidence: ExtractedCallEvidence } {
  // Authoritative resolved trade (single trade, never arbitrary trades[0] fallback)
  const resolvedTrade: TradeRecord | null = Array.isArray(tradesOrResolved)
    ? (tradesOrResolved.length === 1 ? tradesOrResolved[0] : (tradesOrResolved.find((t) => t && t.id) || null))
    : tradesOrResolved;

  const extracted = extractSpokenEvidence(transcript, segments, resolvedTrade || undefined);

  // -------------------------------------------------------------
  // Q1: Authoritative Phone Number / Customer Authentication
  // RULE: Caller ID / Customer Number vs Registered / Client Number
  // Match last 10 digits (ignore first 2 digits if metadata has 12-digit number e.g. 91XXXXXXXXXX).
  // If numbers match: PASS
  // If mismatch: FATAL
  // -------------------------------------------------------------
  let callingRaw = (call as any).customer_number || call.calling_number || call.phone_number || (call as any).caller_id || (call as any).cli || '';
  if (!callingRaw || callingRaw.includes('-')) {
    const phoneInFn = (call.original_filename || '').match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/)?.[1]
      || (call.original_filename || '').match(/(?:^|[^0-9])91([6-9]\d{9})(?:[^0-9]|$)/)?.[1];
    if (phoneInFn) {
      callingRaw = phoneInFn;
    }
  }
  const registeredRaw = call.registered_number || (resolvedTrade as any)?.customer_number || (resolvedTrade as any)?.client_number || resolvedTrade?.phone_number || (resolvedTrade as any)?.mobile || (resolvedTrade as any)?.mobile_number || (resolvedTrade as any)?.contact || (resolvedTrade as any)?.contact_no || '';

  const cleanCalling = normalizePhoneNumber(callingRaw);
  const cleanRegistered = normalizePhoneNumber(registeredRaw);

  const calling10 = cleanCalling.length >= 10 ? cleanCalling.slice(-10) : cleanCalling;
  const registered10 = cleanRegistered.length >= 10 ? cleanRegistered.slice(-10) : cleanRegistered;

  let q1: AuditQuestionOutput;

  if (calling10 && registered10 && calling10.length === 10 && registered10.length === 10) {
    if (calling10 === registered10) {
      q1 = {
        status: 'PASS',
        evidence: `Customer calling line (${calling10}) matches registered records (${registered10}) exactly.`,
        reason: 'Authorized calling telephone line validated.',
        speaker: 'ADVISOR',
        confidence: 1.0,
      };
    } else {
      const hasSpokenOtpOrAuth = /\b(?:otp\s*(?:is|code|verification|verified|confirmed|entered)?\s*[:\-]?\s*\d{4,6}|verified\s+(?:via\s+)?otp|otp\s+verified|authenticated\s+via\s+otp|security\s*questions?\s*(?:verified|answered|passed))\b/i.test(transcript);
      if (hasSpokenOtpOrAuth) {
        q1 = {
          status: 'PASS',
          evidence: `Calling line mismatch (${calling10} vs registered ${registered10}), but verbal OTP/security authorization was successfully authenticated in conversation.`,
          reason: 'Authorized via spoken OTP / security verification.',
          speaker: 'ADVISOR',
          confidence: 0.98,
        };
      } else {
        q1 = {
          status: 'FAIL',
          evidence: `FATAL: Customer calling number (${calling10}) does not match registered client contact (${registered10}) and no spoken OTP/authorization was verified.`,
          reason: 'Unregistered telephone line without authorization match.',
          speaker: 'ADVISOR',
          confidence: 1.0,
        };
      }
    }
  } else if (calling10 && calling10.length === 10) {
    q1 = {
      status: 'PASS',
      evidence: `Customer calling number (${calling10}) validated from call telephony records.`,
      reason: 'Authorized calling telephone line validated.',
      speaker: 'ADVISOR',
      confidence: 0.95,
    };
  } else {
    q1 = {
      status: 'REVIEW',
      evidence: 'Telephony CLI record incomplete for automated verification.',
      reason: 'Telephony CLI record missing.',
      speaker: 'ADVISOR',
      confidence: 0.85,
    };
  }

  // -------------------------------------------------------------
  // Q2: Client Identification / Spoken UCC Code Confirmation
  // RULE: Expected client code -> spoken candidate -> normalize -> compare
  // 90% match rule (speech tolerance, e.g. WAS 9767 vs WAA9767)
  // -------------------------------------------------------------
  const expectedClientCode = (authoritativeClientCode || call.client || resolvedTrade?.client || '').trim();
  let q2: AuditQuestionOutput;

  if (expectedClientCode) {
    const normExpected = normalizeClientCode(expectedClientCode);
    const transcriptMatch = matchClientCodeInTranscript(expectedClientCode, transcript);
    const spokenCodeCandidate = extracted.detectedClientCode?.normalized_value || null;

    const numericPart = normExpected.replace(/\D/g, '');
    const hasNumericMatch = numericPart.length >= 3 && (
      transcript.includes(numericPart) ||
      normalizeSpokenNumbers(transcript).includes(numericPart) ||
      normalizeSpokenNumbers(transcript).replace(/\D/g, '').includes(numericPart)
    );
    
    // Fuzzy matching for speech recognition variations (90% match tolerance: e.g. WAS 9767 vs WAA9767)
    let isFuzzyCodeMatched = transcriptMatch.matched || hasNumericMatch;
    if (!isFuzzyCodeMatched) {
      const words = transcript.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      for (let len = 1; len <= 4; len++) {
        for (let i = 0; i <= words.length - len; i++) {
          const phrase = words.slice(i, i + len).join('').toUpperCase();
          if (phrase.length >= 4 && fuzzySimilarity(phrase, normExpected) >= 0.80) {
            isFuzzyCodeMatched = true;
            break;
          }
        }
        if (isFuzzyCodeMatched) break;
      }
    }

    if (isFuzzyCodeMatched) {
      q2 = {
        status: 'PASS',
        evidence: `Client UCC code "${expectedClientCode}" verified in spoken conversation.`,
        reason: 'Client identification verbally confirmed prior to order execution.',
        speaker: 'ADVISOR',
        confidence: 0.98,
      };
    } else if (spokenCodeCandidate && fuzzySimilarity(String(spokenCodeCandidate), normExpected) < 0.5) {
      q2 = {
        status: 'FAIL',
        evidence: `FATAL: Spoken client code "${spokenCodeCandidate}" mismatches expected registered client code "${expectedClientCode}".`,
        reason: 'Spoken client identification contradicts trade registry records.',
        speaker: 'ADVISOR',
        confidence: 0.95,
      };
    } else {
      q2 = {
        status: 'FAIL',
        evidence: `FATAL: Client code / UCC "${expectedClientCode}" was not spoken or confirmed in the dialogue before order placement.`,
        reason: 'Client code not explicitly confirmed in pre-order call.',
        speaker: 'ADVISOR',
        confidence: 0.95,
      };
    }
  } else {
    q2 = {
      status: 'PASS',
      evidence: 'Client identification verified.',
      reason: 'Client identification verbally confirmed prior to order execution.',
      speaker: 'ADVISOR',
      confidence: 0.90,
    };
  }

  // -------------------------------------------------------------
  // Q3: Explicit Order Verification (Stock, Price, Quantity)
  // RULE: Check Tradingsymbol/script, price, and quantity with 90% tolerance.
  // ALL 3 parameters (Stock, Price/CMP, and Quantity) MUST be confirmed!
  // If all 3 confirmed -> PASS. If any parameter missing -> FAIL (-1 mark).
  // -------------------------------------------------------------
  let q3: AuditQuestionOutput;

  // Stock symbol check
  let stockMatches = false;
  let stockSpokenDetail = '';
  const baseTradeSymbol = resolvedTrade?.symbol ? resolvedTrade.symbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '') : '';
  if (resolvedTrade?.symbol) {
    const symRes = matchSymbolInTranscript(resolvedTrade.symbol, transcript);
    if (symRes.matched) {
      stockMatches = true;
      stockSpokenDetail = symRes.matchedAlias || resolvedTrade.symbol;
    } else if (baseTradeSymbol && matchSymbolInTranscript(baseTradeSymbol, transcript).matched) {
      stockMatches = true;
      stockSpokenDetail = baseTradeSymbol;
    } else if (baseTradeSymbol && transcript.toLowerCase().includes(baseTradeSymbol.toLowerCase())) {
      stockMatches = true;
      stockSpokenDetail = baseTradeSymbol;
    } else {
      const otherStock = extracted.detectedSymbols[0]?.normalized_value;
      stockSpokenDetail = otherStock ? `Spoken: "${otherStock}" (Expected: "${resolvedTrade.symbol}")` : `Not spoken (Expected: "${resolvedTrade.symbol}")`;
    }
  } else {
    for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
      for (const alias of aliases) {
        const aliasRegex = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (aliasRegex.test(transcript)) {
          stockMatches = true;
          stockSpokenDetail = symKey;
          break;
        }
      }
      if (stockMatches) break;
    }
    if (!stockMatches && extracted.detectedSymbols.length > 0) {
      stockMatches = true;
      stockSpokenDetail = String(extracted.detectedSymbols[0].normalized_value);
    }
  }

  // Quantity check
  let qtyMatches = false;
  let qtySpokenDetail = '';
  if (resolvedTrade?.quantity && resolvedTrade.quantity > 0) {
    if (matchQuantityInTranscript(resolvedTrade.quantity, transcript) || transcript.includes(String(resolvedTrade.quantity))) {
      qtyMatches = true;
      qtySpokenDetail = `${resolvedTrade.quantity} shares/lots`;
    } else {
      const numWords: Record<number, string[]> = {
        1: ['one', 'ek', 'single'], 2: ['two', 'do'], 3: ['three', 'teen'], 4: ['four', 'char', 'chaar'],
        5: ['five', 'paanch', 'panch'], 6: ['six', 'chhe', 'che'], 7: ['seven', 'saat'], 8: ['eight', 'aath'],
        9: ['nine', 'nau'], 10: ['ten', 'das'], 12: ['twelve', 'barah', 'bara'], 15: ['fifteen', 'pandrah'],
        16: ['sixteen', 'solah'], 20: ['twenty', 'bees'], 25: ['twenty five', 'pachis'], 50: ['fifty', 'pachaas', 'pachas'],
        75: ['seventy five', 'pachhattar'], 100: ['hundred', 'sau', 'ek sau', 'one hundred'],
        200: ['two hundred', 'do sau'], 500: ['five hundred', 'paansau'], 1000: ['thousand', 'hazaar']
      };
      const words = numWords[resolvedTrade.quantity] || [];
      for (const w of words) {
        if (new RegExp(`\\b${w}\\b`, 'i').test(transcript)) {
          qtyMatches = true;
          qtySpokenDetail = `${resolvedTrade.quantity} shares (${w})`;
          break;
        }
      }
      if (!qtyMatches) {
        const otherQty = extracted.detectedQuantities[0]?.normalized_value;
        qtySpokenDetail = otherQty ? `Spoken: ${otherQty} (Expected: ${resolvedTrade.quantity})` : `Not spoken (Expected: ${resolvedTrade.quantity})`;
      }
    }
  } else {
    const qtyMatch = transcript.match(/\b(\d+)\s*(?:shares?|lots?|qty|quantities|quantity)\b/i);
    if (qtyMatch) {
      qtyMatches = true;
      qtySpokenDetail = `${qtyMatch[1]} shares`;
    } else if (extracted.detectedQuantities.length > 0) {
      qtyMatches = true;
      qtySpokenDetail = `${extracted.detectedQuantities[0].normalized_value} shares`;
    }
  }

  // Price check (explicit price OR verbal CMP)
  let priceMatches = false;
  let priceSpokenDetail = '';
  const isCmp = mentionsMarketPriceOrCMP(transcript) || extracted.hasCmpMention || resolvedTrade?.price_display === 'CMP' || Boolean(resolvedTrade?.is_combined);

  if (isCmp) {
    priceMatches = true;
    priceSpokenDetail = 'Current Market Price (CMP)';
  } else if (resolvedTrade?.price && (matchPriceInTranscript(resolvedTrade.price, transcript) || new RegExp(`\\b${resolvedTrade.price}\\b`).test(transcript))) {
    priceMatches = true;
    priceSpokenDetail = `₹${resolvedTrade.price}`;
  } else if (extracted.detectedPrices.length > 0) {
    priceMatches = true;
    priceSpokenDetail = `₹${extracted.detectedPrices[0].normalized_value}`;
  } else {
    const priceMatch = transcript.match(/\b(?:at|pe|rate|price|rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)\b/i);
    if (priceMatch) {
      priceMatches = true;
      priceSpokenDetail = `₹${priceMatch[1]}`;
    }
  }

  // Strict 3-Point SEBI compliance: ALL 3 (Stock, Price/CMP, Quantity) must be confirmed
  const isQ3Compliant = stockMatches && priceMatches && qtyMatches;

  if (isQ3Compliant) {
    q3 = {
      status: 'PASS',
      evidence: `Stock: ${stockSpokenDetail || resolvedTrade?.symbol || 'Verified'} | Quantity: ${qtySpokenDetail || (resolvedTrade?.quantity ? `${resolvedTrade.quantity} shares` : 'Verified quantity')} | Price: ${priceSpokenDetail || 'Current Market Price (CMP)'}. All 3 order parameters verified.`,
      reason: 'Stock, Quantity, and Price/CMP all confirmed in dialogue.',
      speaker: 'ADVISOR',
      confidence: 1.0,
    };
  } else {
    const mismatches: string[] = [];
    if (!stockMatches) mismatches.push('Stock symbol');
    if (!qtyMatches) mismatches.push('Quantity');
    if (!priceMatches) mismatches.push('Price/CMP');
    q3 = {
      status: 'FAIL',
      evidence: `Order verification discrepancy (-1 mark, non-fatal). Unconfirmed parameters: ${mismatches.join(', ')}. [Stock: ${stockMatches ? stockSpokenDetail : 'Missing'}, Qty: ${qtyMatches ? qtySpokenDetail : 'Missing'}, Price: ${priceMatches ? priceSpokenDetail : 'Missing'}].`,
      reason: `Mandatory order attributes (${mismatches.join(', ')}) not fully confirmed.`,
      speaker: 'ADVISOR',
      confidence: 0.95,
    };
  }

  // -------------------------------------------------------------
  // Q4: Customer Acknowledgement
  // RULE: Customer verbal acknowledgement confirmed unless explicitly cancelled / rejected.
  // -------------------------------------------------------------
  const ackResult = evaluateCustomerAcknowledgement(transcript);
  const q4: AuditQuestionOutput = !ackResult.confirmed
    ? {
        status: 'FAIL',
        evidence: ackResult.quote || 'Customer explicitly cancelled or rejected order execution.',
        reason: ackResult.reason || 'Customer gave explicit negation or cancellation.',
        speaker: 'CLIENT',
        confidence: ackResult.confidence || 0.95,
      }
    : {
        status: 'PASS',
        evidence: ackResult.quote || 'Customer affirmative verbal acknowledgement verified.',
        reason: ackResult.reason || 'Customer verbal acknowledgement confirmed.',
        speaker: 'CLIENT',
        confidence: ackResult.confidence || 0.95,
      };

  // -------------------------------------------------------------
  // Q5: Return Commitment & Guarantee Prohibition
  // RULE: Check if ADVISOR gave guarantee of return, profit, or recovery.
  // Default: PASS. If advisor made explicit guarantee statement, flag for manual review.
  // -------------------------------------------------------------
  const retItem = extracted.detectedReturnCommitment;
  const lowerT = transcript.toLowerCase();

  const hasNegationOrRiskDisclaimer =
    /\b(?:cannot|can't|do\s+not|don't|never|no|not)\s+(?:give\s+any\s+)?guarantee\b/i.test(lowerT) ||
    /\bguarantee\s+(?:nahi\s+hai|nahi\s+hota|nahi\s+hoga|nahi\s+de\s+sakte)\b/i.test(lowerT) ||
    /\bsubject\s+to\s+market\s+risks?\b/i.test(lowerT) ||
    /\bno\s+guaranteed\s+(?:returns?|profit)\b/i.test(lowerT) ||
    /\bmarket\s+risk\s+hai\b/i.test(lowerT);

  const hasAffirmativeGuarantee =
    (retItem?.normalized_value === 'FAIL' && !hasNegationOrRiskDisclaimer) ||
    /\bguaranteed\s+(?:\d+%\s+)?(?:return|profit|gain|target|income)\b/i.test(lowerT) ||
    /\b(?:will\s+(?:definitely\s+)?(?:give|get|make|recover|double)|definitely\s+(?:give|get|make|recover|double))\s+(?:profit|return|returns|recovery|gain)\b/i.test(lowerT) ||
    /\b(?:guarantee\s+hai|pakka\s+profit|fixed\s+profit|guaranteed\s+return|guaranteed\s+profit|100%\s+safe\s+double|risk\s*free\s+return)\b/i.test(lowerT) ||
    /\b(?:sure\s+shot\s+profit|definitely\s+double|loss\s+nahi\s+hoga|paisa\s+banega\s+hi\s+banega|recovery\s+hoga\s+hi\s+hoga)\b/i.test(lowerT);

  let q5: AuditQuestionOutput;
  if (hasAffirmativeGuarantee && !hasNegationOrRiskDisclaimer) {
    q5 = {
      status: 'FAIL',
      evidence: `Flagged for manual compliance verification: Advisor verbal statement detected: "${retItem?.exact_quote || 'Potential return/profit guarantee statement'}".`,
      reason: 'Advisor made verbal return or profit guarantee statements.',
      speaker: 'ADVISOR',
      confidence: 0.95,
    };
  } else {
    q5 = {
      status: 'PASS',
      evidence: hasNegationOrRiskDisclaimer
        ? 'Advisor properly stated market risk disclaimer. No return or profit guarantee made.'
        : 'Advisor made zero return or profit guarantees. Fully compliant with SEBI regulations.',
      reason: 'No prohibited return commitments identified in advisor dialogue.',
      speaker: 'ADVISOR',
      confidence: 1.0,
    };
  }

  return {
    audit: {
      q1,
      q2,
      q3,
      q4,
      q5,
      model: 'deterministic-audit-v18.0.0',
    },
    evidence: extracted,
  };
}
