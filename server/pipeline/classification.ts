// =============================================================
// Stage 4: CALL INTENT CLASSIFICATION (SEBI Regulatory Engine)
// Classifies call into:
// PRE_ORDER | REGULAR | SCRAP | REVIEW
//
// Core Mandates:
// 1. Scrap Call:
//    - All calls <= 6s duration are SCRAP.
//    - Calls >= 7s duration are NOT SCRAP by duration.
// 2. Pre-Order Call (4-of-5 Rule):
//    - Parameters: Stock Name/Trading Symbol, Price/CMP, Quantity, Client Code, Buy/Sell Word.
//    - If 4 or more out of these 5 parameters match in conversation, call is PRE_ORDER.
//    - Verifiable against trade data: if executed trade exists in database for this client/phone
//      with trade intent, it confirms PRE_ORDER.
// 3. Regular Call:
//    - If advisor and client are talking, but no trade executed (<4 parameters), call is REGULAR.
//    - Regular calls are kept in a separate section and NEVER audited.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type {
  CallClassification,
  ClassificationResult,
  ClassificationEvidence,
  TranscriptSegment,
} from './types';
import type { CallRecord, TradeRecord } from '../../src/types';
import {
  normalizePhoneNumber,
  normalizeClientCode,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
  extractNumericTokens,
  SYMBOL_ALIASES,
} from '../normalizer';

const SCRAP_PATTERNS = [
  'please leave a message',
  'leave your message after the tone',
  'record your message after the beep',
  'subscriber is busy',
  'person you are calling is not answering',
  'currently unavailable',
  'switched off',
  'out of coverage area',
  'call rejected',
  'call ended',
  'mailbox is full',
  'number dialed does not exist',
];

const BUY_SELL_REGEX = /\b(?:buy|buying|bought|sell|selling|sold|purchase|purchasing|place\s+order|order\s+place|order\s+lagao|limit\s+order|market\s+order|kharid|kharido|kharidna|bech|becho|bechna|trade\s+execute|execution|le\s+lo|lena\s+hai|de\s+do|dena\s+hai|square\s+off|squareoff|entry\s+lena|dal\s+do|daal\s+do|laga\s+do|order)\b/i;

const PRICE_OR_CMP_REGEX = /\b(?:cmp|current\s+market\s+price|market\s+price|market\s+rate|at\s+market|market\s+pe|rate\s+pe|bhav\s+pe|current\s+bhav|live\s+rate|limit\s+price|best\s+price|market\s+order|price|rate|rupees|rs|bhav|points)\b/i;

const QUANTITY_REGEX = /\b(?:qty|quantity|lot|lots|shares|units|hisse|share|nag)\b/i;

const NUMBER_WORDS_REGEX = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|twenty\s+five|fifty|hundred|two\s+hundred|five\s+hundred|thousand|ek|do|teen|chaar|paanch|chhe|saat|aath|nau|das|bees|pachis|pachaas|pachas|sau|so|hazaar)\b/i;

/**
 * Stage 4 Entry Point: Call Intent Classification
 */
export async function stage4ClassifyCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string
): Promise<ClassificationResult> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const segments = db
    .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
    .all(callId) as unknown as TranscriptSegment[];

  const transcript = call.transcript || '';
  const durationSeconds = call.duration_seconds || 0;
  const lowerTranscript = transcript.toLowerCase();

  // -----------------------------------------------------------
  // 1. DETERMINISTIC SCRAP CHECK
  // User Mandate: "all calls below 6 seconds are scrab, 7 seconds call are not scrab"
  // -----------------------------------------------------------
  if (durationSeconds > 0 && durationSeconds <= 6) {
    const scrapResult: ClassificationResult = {
      classification: 'SCRAP',
      confidence: 1.0,
      evidence: [],
      reason: `Scrap call: Call duration (${durationSeconds}s) is within scrap threshold (<= 6s).`,
      scrap_reason: `Duration ${durationSeconds}s <= 6s`,
      model: 'deterministic-duration-gate',
    };
    persistClassification(db, callId, scrapResult);
    return scrapResult;
  }

  // Telephony automated voicemail check (only for short automated prompts)
  for (const pattern of SCRAP_PATTERNS) {
    if (lowerTranscript.includes(pattern) && (durationSeconds <= 20 || transcript.length < 150)) {
      const scrapResult: ClassificationResult = {
        classification: 'SCRAP',
        confidence: 0.98,
        evidence: [],
        reason: `Automated telephony IVR detected ("${pattern}").`,
        scrap_reason: `Voicemail/Automated IVR ("${pattern}")`,
        model: 'telephony-pattern-filter',
      };
      persistClassification(db, callId, scrapResult);
      return scrapResult;
    }
  }

  // Empty or unintelligible audio with no words
  if (!transcript.trim() && durationSeconds <= 10) {
    const scrapResult: ClassificationResult = {
      classification: 'SCRAP',
      confidence: 0.95,
      evidence: [],
      reason: `Silent or unrecorded audio recording (${durationSeconds}s).`,
      scrap_reason: 'Empty / Unrecorded Audio',
      model: 'silence-detector',
    };
    persistClassification(db, callId, scrapResult);
    return scrapResult;
  }

  // -----------------------------------------------------------
  // 2. PRE-ORDER 4-OF-5 PARAMETER RULE EVALUATION
  // Parameters to check:
  // 1. Stock Name / Trading Symbol
  // 2. Price / CMP
  // 3. Quantity
  // 4. Client Code
  // 5. Buy or Sell Word
  // -----------------------------------------------------------

  // Fetch all stock symbols from database trades
  let dbSymbols: string[] = [];
  try {
    const symRows = db.prepare('SELECT DISTINCT symbol FROM trades').all() as { symbol: string }[];
    dbSymbols = symRows.map((r) => r.symbol).filter(Boolean);
  } catch {}

  // Parameter 1: Stock Name / Trading Symbol
  let hasStockSymbol = false;
  let matchedStockName = '';
  // Check against symbols in DB
  for (const sym of dbSymbols) {
    const res = matchSymbolInTranscript(sym, transcript);
    if (res.matched) {
      hasStockSymbol = true;
      matchedStockName = res.matchedAlias || sym;
      break;
    }
  }
  // Check against SYMBOL_ALIASES
  if (!hasStockSymbol) {
    for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
      const res = matchSymbolInTranscript(symKey, transcript);
      if (res.matched) {
        hasStockSymbol = true;
        matchedStockName = res.matchedAlias || symKey;
        break;
      }
      for (const al of aliases) {
        if (lowerTranscript.includes(al.toLowerCase())) {
          hasStockSymbol = true;
          matchedStockName = al;
          break;
        }
      }
      if (hasStockSymbol) break;
    }
  }
  // Check common equity market terms
  if (!hasStockSymbol) {
    const commonStockRegex = /\b(?:shares?|stocks?|equity|nifty|banknifty|finnifty|scrip|contract|call\s+option|put\s+option)\b/i;
    const match = transcript.match(commonStockRegex);
    if (match) {
      hasStockSymbol = true;
      matchedStockName = match[0];
    }
  }

  // Parameter 2: Price / CMP
  const isCmpMentioned = mentionsMarketPriceOrCMP(transcript) || PRICE_OR_CMP_REGEX.test(transcript);
  const numericTokens = extractNumericTokens(transcript);
  const hasPrice = isCmpMentioned || numericTokens.length > 0;
  const priceDetail = isCmpMentioned ? 'CMP / Market Rate' : (numericTokens.length > 0 ? `Price tokens: ${numericTokens.slice(0, 3).join(', ')}` : '');

  // Parameter 3: Quantity
  const hasQtyKeyword = QUANTITY_REGEX.test(transcript);
  const hasNumberWords = NUMBER_WORDS_REGEX.test(transcript);
  const hasQuantity = hasQtyKeyword || hasNumberWords || numericTokens.length > 0;
  const qtyDetail = hasQtyKeyword ? 'Quantity mentioned' : (hasNumberWords ? 'Spoken quantity' : (numericTokens.length > 0 ? 'Numeric quantity' : ''));

  // Parameter 4: Client Code / UCC
  let hasClientCode = false;
  let matchedClientCode = '';
  const expectedClientCode = call.client_code || call.client || '';
  if (expectedClientCode) {
    const codeMatch = matchClientCodeInTranscript(expectedClientCode, transcript);
    if (codeMatch.matched) {
      hasClientCode = true;
      matchedClientCode = expectedClientCode;
    }
  }
  // Check against all trade clients in DB
  if (!hasClientCode) {
    try {
      const clientRows = db.prepare('SELECT DISTINCT client FROM trades').all() as { client: string }[];
      for (const cr of clientRows) {
        if (cr.client) {
          const codeMatch = matchClientCodeInTranscript(cr.client, transcript);
          if (codeMatch.matched) {
            hasClientCode = true;
            matchedClientCode = cr.client;
            break;
          }
        }
      }
    } catch {}
  }
  // Check UCC pattern in transcript
  if (!hasClientCode) {
    const uccRegex = /\b[A-Za-z]{2,5}[\s\-._]*[0-9]{3,8}\b/;
    const uccMatch = transcript.match(uccRegex);
    if (uccMatch) {
      hasClientCode = true;
      matchedClientCode = uccMatch[0];
    }
  }

  // Parameter 5: Buy or Sell Word
  const buySellMatch = transcript.match(BUY_SELL_REGEX);
  const hasBuySell = Boolean(buySellMatch);
  const buySellWord = buySellMatch ? buySellMatch[0] : '';

  // Calculate 4-of-5 parameter score
  const matchedParams: string[] = [];
  if (hasStockSymbol) matchedParams.push(`Stock (${matchedStockName})`);
  if (hasPrice) matchedParams.push(`Price (${priceDetail})`);
  if (hasQuantity) matchedParams.push(`Quantity (${qtyDetail})`);
  if (hasClientCode) matchedParams.push(`Client Code (${matchedClientCode})`);
  if (hasBuySell) matchedParams.push(`Buy/Sell (${buySellWord})`);

  const matchedCount = matchedParams.length;

  // -----------------------------------------------------------
  // 3. CROSS-VERIFY WITH TRADE MASTER DATA
  // "you can verify these details on trade data also if trade is pre-order or regular."
  // -----------------------------------------------------------
  let tradeVerified = false;
  let matchingTradeInfo = '';
  const normPhone = normalizePhoneNumber(call.calling_number || call.phone_number || '');
  const normUcc = normalizeClientCode(call.client_code || call.client || '');

  try {
    let candidateTrade: TradeRecord | undefined;
    if (normPhone) {
      candidateTrade = db.prepare(`
        SELECT * FROM trades
        WHERE phone_number = ? OR client_number = ?
        ORDER BY id DESC LIMIT 1
      `).get(normPhone, normPhone) as unknown as TradeRecord | undefined;
    }
    if (!candidateTrade && normUcc) {
      candidateTrade = db.prepare(`
        SELECT * FROM trades
        WHERE client = ?
        ORDER BY id DESC LIMIT 1
      `).get(normUcc) as unknown as TradeRecord | undefined;
    }

    if (candidateTrade) {
      tradeVerified = true;
      matchingTradeInfo = `Trade #${candidateTrade.id} (${candidateTrade.symbol}, Qty: ${candidateTrade.quantity}, Price: ${candidateTrade.price_display || candidateTrade.price})`;
    }
  } catch {}

  // Find best verbatim evidence segment
  const evidenceSeg = segments.find((s) => BUY_SELL_REGEX.test(s.text))
    || segments.find((s) => hasStockSymbol && s.text.toLowerCase().includes(matchedStockName.toLowerCase()))
    || segments[0];

  const evidenceList: ClassificationEvidence[] = evidenceSeg ? [{
    segment_id: evidenceSeg.segment_id,
    start: evidenceSeg.start_time,
    end: evidenceSeg.end_time,
    speaker: (evidenceSeg.speaker === 'ADVISOR' || evidenceSeg.speaker === 'CLIENT') ? evidenceSeg.speaker : 'ADVISOR',
    text: evidenceSeg.text,
  }] : [];

  // -----------------------------------------------------------
  // 4. CLASSIFICATION DECISION
  // Rule A: 4 or more out of 5 parameters matched -> PRE_ORDER
  // Rule B: Executed trade exists in master data and trade intent -> PRE_ORDER
  // Rule C: Advisor and client talking, but no trade executed -> REGULAR
  // -----------------------------------------------------------
  if (matchedCount >= 4) {
    const preOrderResult: ClassificationResult = {
      classification: 'PRE_ORDER',
      confidence: 0.98,
      evidence: evidenceList,
      reason: `Pre-Order verified: ${matchedCount}/5 trade parameters confirmed (${matchedParams.join(', ')}).`,
      model: 'deterministic-4of5-engine',
    };
    persistClassification(db, callId, preOrderResult);
    return preOrderResult;
  }

  if (tradeVerified && (matchedCount >= 2 || hasBuySell || hasStockSymbol)) {
    const preOrderResult: ClassificationResult = {
      classification: 'PRE_ORDER',
      confidence: 0.96,
      evidence: evidenceList,
      reason: `Pre-Order verified: Executed trade record confirmed in master data (${matchingTradeInfo}) with conversation order intent (${matchedParams.join(', ')}).`,
      model: 'trade-data-cross-verifier',
    };
    persistClassification(db, callId, preOrderResult);
    return preOrderResult;
  }

  // If Groq API key is available, attempt AI classification as secondary check for natural language nuance
  if (groqApiKey && groqApiKey.trim() && segments.length > 0) {
    try {
      const dialogueExcerpt = segments.slice(0, 40).map((s) => `[${s.speaker}]: ${s.text}`).join('\n');
      const prompt = `You are a SEBI compliance auditor.
Classify this call into PRE_ORDER or REGULAR:
1. PRE_ORDER: Trade execution discussion where stock, price, quantity, or client order is confirmed or placed.
2. REGULAR: Informational conversation, market chat, account inquiry, or greeting where NO trade order is placed.

Respond strictly in JSON format:
{
  "classification": "PRE_ORDER" | "REGULAR",
  "confidence": 0.0 to 1.0,
  "reason": "explanation"
}

TRANSCRIPT:
"""
${dialogueExcerpt}
"""`;

      const aiResponse = await callGroqChat(groqApiKey.trim(), prompt, 'llama-3.3-70b-versatile');
      if (aiResponse?.classification === 'PRE_ORDER') {
        const preOrderResult: ClassificationResult = {
          classification: 'PRE_ORDER',
          confidence: Math.min(1, Math.max(0, aiResponse.confidence || 0.90)),
          evidence: evidenceList,
          reason: aiResponse.reason || `AI verified pre-order trade conversation (${matchedCount}/5 parameters).`,
          model: 'llama-3.3-70b-versatile',
        };
        persistClassification(db, callId, preOrderResult);
        return preOrderResult;
      }
    } catch (aiErr) {
      console.warn(`[Stage 4] Groq secondary check skipped:`, (aiErr as any).message);
    }
  }

  // Otherwise: Advisor and client are talking, but no trade executed -> REGULAR CALL
  const regularResult: ClassificationResult = {
    classification: 'REGULAR',
    confidence: 0.92,
    evidence: evidenceList,
    reason: `Regular call: Dialogue contains market/account inquiry without pre-order trade execution (${matchedCount}/5 trade parameters).`,
    model: 'deterministic-regular-classifier',
  };
  persistClassification(db, callId, regularResult);
  return regularResult;
}

async function callGroqChat(apiKey: string, prompt: string, model: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.05,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a strict compliance auditor. Respond strictly in JSON format.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await response.json()) as any;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty completion content from Groq.');
    }

    return JSON.parse(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

function persistClassification(db: DatabaseSync, callId: number, result: ClassificationResult): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const evidenceSnippet = result.evidence.length > 0 ? result.evidence[0].text : '';
  const evidenceSpeaker = result.evidence.length > 0 ? result.evidence[0].speaker : 'UNKNOWN';
  const evidenceTime = result.evidence.length > 0 ? `${result.evidence[0].start}s` : '';

  db.prepare(`
    UPDATE calls SET
      classification = ?,
      classification_confidence = ?,
      classification_evidence = ?,
      call_type = ?,
      preorder_confidence = ?,
      preorder_evidence = ?,
      preorder_speaker = ?,
      preorder_timestamp = ?,
      scrap_reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    result.classification,
    result.confidence,
    JSON.stringify(result.evidence),
    result.classification.toLowerCase(),
    result.confidence,
    evidenceSnippet,
    evidenceSpeaker,
    evidenceTime,
    result.scrap_reason || null,
    now,
    callId
  );
}
