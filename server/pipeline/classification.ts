// =============================================================
// Stage 4: CALL INTENT CLASSIFICATION (Dual-Track Trade & Speech Engine)
//
// Rules enforced:
// 1. DETERMINISTIC SCRAP CHECK:
//    - Duration <= 6s -> SCRAP (100% confidence).
//    - Telephony automated voicemail, IVR patterns -> SCRAP.
//    - Empty / unintelligible audio with duration <= 10s -> SCRAP.
//
// 2. PRIMARY SIGNAL A: EXECUTED TRADE MATCHING
//    - If client code or 10-digit phone number matches an executed trade in the database
//      -> PRE_ORDER (Confidence: 0.98, linked to trade).
//
// 3. PRIMARY SIGNAL B: SPOKEN PRE-ORDER INTENT & FINANCIAL DIALOGUE
//    - Analyzes verbatim transcript for pre-order trade dialogue:
//      a) Order Placement Actions (buy, sell, kharid, bech, punch, execute, delivery, intraday, square off, daal do, laga do, le lo, bech do).
//      b) Securities / Assets (Indian equities, tickers, shares, stocks, lots, Nifty, Bank Nifty, options, derivatives).
//      c) Order Parameters (quantities, price, CMP, limit rate, target, stoploss).
//      d) Client Authorization / Confirmation (confirm, yes, theek hai, kar do, haan buy karo).
//    - If spoken trade action + security/parameter is detected -> PRE_ORDER (Confidence: 0.94).
//
// 4. UNTRANSCRIBED AUDIO GATE:
//    - If audio has NOT been transcribed yet and no trade matches:
//      -> PENDING / UNCLASSIFIED (Awaiting ASR speech analysis).
//      NEVER falsely classify an untranscribed multi-minute call as Regular!
//
// 5. REGULAR ADVISORY / RELATIONSHIP MANAGEMENT:
//    - Spoken dialogue present and analyzed, but NO trade execution or order intent found.
//      (General KYC, portfolio review, greeting, market query, software assistance).
//      -> REGULAR (Confidence: 0.95).
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import {
  SCRAP_DURATION_THRESHOLD_SECONDS,
  TELEPHONY_SCRAP_PATTERNS,
} from './constants';
import {
  normalizeCanonicalPhone,
  normalizeCanonicalClientCode,
  findExecutedTradesForCall,
} from './matching';
import type {
  CallClassification,
  ClassificationResult,
  ClassificationEvidence,
  TranscriptSegment,
} from './types';
import type { CallRecord, TradeRecord } from '../../src/types';

// Regex patterns for pre-order trade intent detection
const TRADE_ACTION_REGEX = /\b(?:buy|bought|purchase|sell|sold|order|place order|order place|placing|punch|punching|executed|execute|execution|bid|ask|intraday|delivery|square off|squareoff|cover|kharid|khareed|kharido|kharidna|kharid lo|kharid lijiye|bech|becho|bechna|bech do|bech dijiye|daal do|daal dijiye|laga do|laga dijiye|lagao|kat do|kaat do|kaat lijiye|le lo|le lijiye|le rahe|bech rahe|sauda|deal)\b/i;

const SECURITIES_REGEX = /\b(?:shares?|stocks?|equity|equities|lot|lots|nifty|banknifty|bank nifty|fin nifty|finnifty|sensex|options?|derivatives?|future|futures|call option|put option|ce|pe|reliance|infy|infosys|tcs|tatamotors|tata motors|tatasteel|tata steel|hdfc|hdfcbank|sbi|sbin|state bank|itc|icici|icicibank|wipro|airtel|bharti|bhartiartl|maruti|bajaj|bajfinance|adani|adanient|kotak|kotakbank|lt|l&t|axis|axisbank|titan|sunpharma|nestle|ongc|ntpc|powergrid|coalindia|zomato|paytm|jiofin|vedl|bel|hal|cipla|drreddy|grasim|hcltech|heromotoco|hindalco|hindunilvr|indusindbk|jswsteel|m&m|techm|ultracemco|siemens|dlf|asianpaint)\b/i;

const TRADE_PARAMS_REGEX = /\b(?:(?:\d+\s*(?:shares?|stocks?|units?|lots?|qty|quantity|sau|hazar))|(?:(?:price|rate|at|pe|cmp|market price|limit)\s*(?:of|is|pe)?\s*(?:rs\.?|inr|₹)?\s*\d+)|(?:cmp|current market price|market rate|bhav)|(?:buy|sell|kharid|bech)\s+\d+)\b/i;

/**
 * Text & duration based call intent classifier for standalone testing and routing
 */
export function classifyCallIntent(
  transcript: string,
  durationSeconds?: number
): { call_type: 'pre_order' | 'regular' | 'scrap'; confidence: number; evidence?: string } {
  if (typeof durationSeconds === 'number' && durationSeconds > 0 && durationSeconds <= SCRAP_DURATION_THRESHOLD_SECONDS) {
    return { call_type: 'scrap', confidence: 1.0, evidence: `Call duration (${durationSeconds}s) <= ${SCRAP_DURATION_THRESHOLD_SECONDS}s.` };
  }
  const lower = (transcript || '').toLowerCase().trim();
  if (!lower && typeof durationSeconds === 'number' && durationSeconds <= 10) {
    return { call_type: 'scrap', confidence: 0.95, evidence: 'Silent or empty audio.' };
  }
  for (const pattern of TELEPHONY_SCRAP_PATTERNS) {
    if (lower.includes(pattern)) {
      return { call_type: 'scrap', confidence: 0.98, evidence: `IVR / Voicemail pattern: "${pattern}"` };
    }
  }

  const hasAction = TRADE_ACTION_REGEX.test(lower);
  const hasSecurity = SECURITIES_REGEX.test(lower);
  const hasParams = TRADE_PARAMS_REGEX.test(lower);

  if (hasAction && (hasSecurity || hasParams)) {
    // Extract matching sentence snippet as evidence
    const sentences = transcript.split(/[.!?\n]+/);
    const matchSentence = sentences.find((s) => TRADE_ACTION_REGEX.test(s) && (SECURITIES_REGEX.test(s) || TRADE_PARAMS_REGEX.test(s))) || transcript.slice(0, 150);
    return {
      call_type: 'pre_order',
      confidence: 0.94,
      evidence: matchSentence.trim(),
    };
  }

  return {
    call_type: 'regular',
    confidence: 0.92,
    evidence: 'General advisory conversation without pre-order trade placement.',
  };
}

/**
 * Stage 4 Entry Point: Call Intent Classification
 */
export async function stage4ClassifyCall(
  db: DatabaseSync,
  callId: number,
  _groqApiKey?: string
): Promise<ClassificationResult> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const durationSeconds = call.duration_seconds || 0;
  const rawTranscript = (call.transcript || '').trim();
  const lowerTranscript = rawTranscript.toLowerCase();

  // -----------------------------------------------------------
  // 1. DETERMINISTIC SCRAP CHECK
  // Calls <= 6s duration are SCRAP. Calls >= 7s are not scrap by duration.
  // -----------------------------------------------------------
  if (durationSeconds > 0 && durationSeconds <= SCRAP_DURATION_THRESHOLD_SECONDS) {
    const scrapResult: ClassificationResult = {
      classification: 'SCRAP',
      confidence: 1.0,
      evidence: [],
      reason: `Scrap call: duration (${durationSeconds}s) is <= ${SCRAP_DURATION_THRESHOLD_SECONDS}s.`,
      scrap_reason: `Duration ${durationSeconds}s <= ${SCRAP_DURATION_THRESHOLD_SECONDS}s`,
      model: 'deterministic-duration-gate',
    };
    persistClassification(db, callId, scrapResult);
    return scrapResult;
  }

  // Telephony automated voicemail/IVR check
  for (const pattern of TELEPHONY_SCRAP_PATTERNS) {
    if (lowerTranscript.includes(pattern) && (durationSeconds <= 25 || rawTranscript.length < 160)) {
      const scrapResult: ClassificationResult = {
        classification: 'SCRAP',
        confidence: 0.98,
        evidence: [],
        reason: `Automated telephony IVR/voicemail detected ("${pattern}").`,
        scrap_reason: `Voicemail/Automated IVR ("${pattern}")`,
        model: 'telephony-pattern-filter',
      };
      persistClassification(db, callId, scrapResult);
      return scrapResult;
    }
  }

  // Empty or unintelligible audio with no words and short duration
  if (!rawTranscript && durationSeconds > 0 && durationSeconds <= 10) {
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
  // 2. PRIMARY SIGNAL A: EXECUTED TRADE MATCHING
  // Check if this caller/client has an executed trade around trade date
  // -----------------------------------------------------------
  let candidateTrades = findExecutedTradesForCall(db, call);

  // If candidateTrades is empty, also check broad match (phone or client code in trades table)
  if (candidateTrades.length === 0) {
    const callingPhone = normalizeCanonicalPhone(call.calling_number || call.phone_number || (call as any).caller_id);
    const clientCode = normalizeCanonicalClientCode(call.client_code || call.client);
    if (callingPhone) {
      const broadTrades = db.prepare(`
        SELECT * FROM trades
        WHERE phone_number = ? OR client_number = ?
        ORDER BY id DESC LIMIT 1
      `).all(callingPhone, callingPhone) as unknown as TradeRecord[];
      if (broadTrades.length > 0) {
        candidateTrades = [{
          trade: broadTrades[0],
          matchType: 'PHONE_EXACT',
          confidence: 0.95,
          reason: `10-digit phone match (${callingPhone}) against trade registered phone.`,
        }];
      }
    } else if (clientCode) {
      const broadTrades = db.prepare(`
        SELECT * FROM trades
        WHERE client = ?
        ORDER BY id DESC LIMIT 1
      `).all(clientCode) as unknown as TradeRecord[];
      if (broadTrades.length > 0) {
        candidateTrades = [{
          trade: broadTrades[0],
          matchType: 'CLIENT_CODE_EXACT',
          confidence: 0.95,
          reason: `Client code match (${clientCode}) against trade record.`,
        }];
      }
    }
  }

  // If a matching executed trade exists for this client or phone -> PRE_ORDER, full stop!
  if (candidateTrades.length > 0) {
    const bestCandidate = candidateTrades[0];
    const trade = bestCandidate.trade;

    // Link the matched trade in call record if not already linked
    if (!call.matched_trade_id) {
      db.prepare(`
        UPDATE calls SET
          matched_trade_id = ?,
          trade_match_status = 'CONFIRMED',
          client = COALESCE(NULLIF(client, ''), ?),
          client_code = COALESCE(NULLIF(client_code, ''), ?),
          registered_number = COALESCE(NULLIF(registered_number, ''), ?),
          updated_at = ?
        WHERE id = ?
      `).run(
        trade.id,
        trade.client,
        trade.client,
        normalizeCanonicalPhone(trade.client_number || trade.phone_number),
        new Date().toISOString().replace('T', ' ').slice(0, 19),
        callId
      );
    }

    const preOrderResult: ClassificationResult = {
      classification: 'PRE_ORDER',
      confidence: bestCandidate.confidence,
      evidence: [
        {
          segment_id: 'trade_exec',
          speaker: 'ADVISOR',
          start: 0,
          end: 0,
          text: `Executed trade #${trade.id} (${trade.symbol} ${trade.quantity}@${trade.price}) confirmed for client ${trade.client} (${bestCandidate.reason})`,
        },
      ],
      reason: `PRE_ORDER: Executed trade #${trade.id} (${trade.symbol}) confirmed for client ${trade.client}. ${bestCandidate.reason}`,
      model: 'trade-execution-primary-gate',
    };
    persistClassification(db, callId, preOrderResult);
    return preOrderResult;
  }

  // -----------------------------------------------------------
  // 3. PRIMARY SIGNAL B: SPOKEN PRE-ORDER INTENT & FINANCIAL DIALOGUE
  // Check if dialogue contains order placement, buy/sell instructions, or stock/quantity terms
  // -----------------------------------------------------------
  if (rawTranscript) {
    const hasAction = TRADE_ACTION_REGEX.test(lowerTranscript);
    const hasSecurity = SECURITIES_REGEX.test(lowerTranscript);
    const hasParams = TRADE_PARAMS_REGEX.test(lowerTranscript);

    if (hasAction && (hasSecurity || hasParams)) {
      // Find the best sentence showing the order instruction
      const sentences = rawTranscript.split(/[.!?\n]+/);
      const matchSentence = sentences.find((s) => TRADE_ACTION_REGEX.test(s) && (SECURITIES_REGEX.test(s) || TRADE_PARAMS_REGEX.test(s))) || rawTranscript.slice(0, 180);

      const preOrderSpeechResult: ClassificationResult = {
        classification: 'PRE_ORDER',
        confidence: 0.94,
        evidence: [
          {
            segment_id: 'speech_intent',
            speaker: 'CLIENT',
            start: 0,
            end: 0,
            text: matchSentence.trim(),
          },
        ],
        reason: `PRE_ORDER: Spoken order placement intent detected in call transcript: "${matchSentence.trim()}".`,
        model: 'speech-intent-semantic-gate',
      };
      persistClassification(db, callId, preOrderSpeechResult);
      return preOrderSpeechResult;
    }
  }

  // -----------------------------------------------------------
  // 4. UNTRANSCRIBED AUDIO GATE
  // If call has NO transcript yet, do NOT falsely force to REGULAR!
  // Mark as PENDING so user clearly sees it is awaiting ASR analysis.
  // -----------------------------------------------------------
  if (!rawTranscript) {
    const pendingResult: ClassificationResult = {
      classification: 'PENDING',
      confidence: 0.50,
      evidence: [],
      reason: 'PENDING: Awaiting ASR speech-to-text transcription to determine pre-order intent.',
      model: 'pending-transcription-gate',
    };
    persistClassification(db, callId, pendingResult);
    return pendingResult;
  }

  // -----------------------------------------------------------
  // 5. REGULAR ADVISORY CALL (Spoken Dialogue Evaluated, No Trade Intent)
  // Audio was transcribed and analyzed: contains relationship management,
  // KYC, general market queries, or account updates without order execution.
  // -----------------------------------------------------------
  const regularResult: ClassificationResult = {
    classification: 'REGULAR',
    confidence: 0.95,
    evidence: [],
    reason: 'REGULAR: Customer dialogue evaluated. No pre-order trade placement instruction or executed trade found.',
    model: 'trade-absence-regular-gate',
  };
  persistClassification(db, callId, regularResult);
  return regularResult;
}

function persistClassification(db: DatabaseSync, callId: number, result: ClassificationResult): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const evidenceSnippet = result.evidence.length > 0 ? result.evidence[0].text : '';
  const evidenceSpeaker = result.evidence.length > 0 ? result.evidence[0].speaker : 'UNKNOWN';
  const evidenceTime = result.evidence.length > 0 ? `${result.evidence[0].start}s` : '';

  const mappedCallType =
    result.classification === 'PRE_ORDER'
      ? 'pre_order'
      : result.classification === 'SCRAP'
      ? 'scrap'
      : result.classification === 'PENDING'
      ? 'pending'
      : result.classification === 'REVIEW'
      ? 'needs_review'
      : 'regular';

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
      matched_trade_id = CASE WHEN ? = 'PRE_ORDER' THEN matched_trade_id ELSE NULL END,
      trade_match_status = CASE WHEN ? = 'PRE_ORDER' THEN trade_match_status ELSE 'NONE' END,
      updated_at = ?
    WHERE id = ?
  `).run(
    result.classification,
    result.confidence,
    JSON.stringify(result.evidence),
    mappedCallType,
    result.confidence,
    evidenceSnippet,
    evidenceSpeaker,
    evidenceTime,
    result.scrap_reason || null,
    result.classification,
    result.classification,
    now,
    callId
  );
}
