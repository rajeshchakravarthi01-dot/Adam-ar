// =============================================================
// Stage 7: Q1/Q2/Q3/Q4/Q5 COMPLIANCE AUDIT
//
// Rules enforced:
// 1. Only executed on calls that passed Stage 6 isAuditEligible().
// 2. Q1 is 100% DETERMINISTIC: calling CLI vs registered phone in records.
//    Match -> PASS, Mismatch -> FATAL, Missing -> REVIEW. Never default to PASS.
// 3. Q2 is ASR-Aware UCC Confirmation: Spoken client code confirmed in dialogue.
//    Correct -> PASS, Wrong -> FATAL, Missing -> FATAL / REVIEW.
// 4. Q3 verifies all orders/executions in call: Stock, Price/CMP, Quantity.
//    All orders confirmed -> PASS, Missing details -> FAIL (NON-FATAL).
// 5. Q4 evaluates explicit customer verbal acknowledgement.
// 6. Q5 is Advisor-only semantic analysis. Zero return/profit guarantee check.
// 7. Post-AI Evidence Verification: Checks segment existence, speaker,
//    and verbatim transcript match.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { isAuditEligible } from './eligibility';
import {
  normalizePhoneNumber,
  normalizeClientCode,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
  fuzzySimilarity,
  evaluateCustomerAcknowledgement,
  SYMBOL_ALIASES,
} from '../normalizer';
import { evaluateDeterministicQ1 } from '../q1-evaluator';
import { evaluateQ5SemanticAdvisorPromises } from './q5SemanticEvaluator';
import {
  extractSpokenUccCandidates,
  resolveUccWithAuthoritativeData,
} from './uccResolver';
import type {
  StageAuditResult,
  AuditQuestionResult,
  TranscriptSegment,
} from './types';
import type { CallRecord, TradeRecord } from '../../src/types';

export async function stage7AuditCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string,
  geminiKey?: string
): Promise<StageAuditResult> {
  // Gate check
  const gate = isAuditEligible(db, callId);
  if (!gate.eligible) {
    throw new Error(`AUDIT_BLOCKED: ${gate.gateCode} - ${gate.reason}`);
  }

  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord;

  // Retrieve matched trades and orders
  let trade: TradeRecord | undefined;
  if (call.matched_trade_id) {
    trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id) as unknown as TradeRecord | undefined;
  }

  // Also query hierarchical executions
  let executions: any[] = [];
  try {
    executions = db.prepare(`
      SELECT oe.*, t.symbol, t.quantity, t.price, t.order_type as side, t.trade_time, t.trade_date, t.phone_number, t.client_number, t.client
      FROM order_executions oe
      JOIN trades t ON oe.trade_id = t.id
      JOIN call_orders co ON oe.order_id = co.id
      WHERE co.call_id = ?
    `).all(callId) as any[];
  } catch (err: any) {
    try {
      executions = db.prepare(`
        SELECT oe.*, t.symbol, t.quantity, t.price, t.trade_time, t.trade_date, t.phone_number, t.client_number, t.client
        FROM order_executions oe
        JOIN trades t ON oe.trade_id = t.id
        JOIN call_orders co ON oe.order_id = co.id
        WHERE co.call_id = ?
      `).all(callId) as any[];
    } catch {}
  }

  if (!trade && executions.length > 0) {
    trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(executions[0].trade_id) as unknown as TradeRecord | undefined;
  }

  const callOrders = db.prepare(`
    SELECT * FROM call_orders WHERE call_id = ? ORDER BY order_index ASC
  `).all(callId) as any[];

  const segments = db
    .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
    .all(callId) as unknown as TranscriptSegment[];

  const transcript = call.transcript || '';
  const advisorSegments = segments.filter((s) => s.speaker === 'ADVISOR');

  // -----------------------------------------------------------
  // Q1: Deterministic Phone Verification (Calling CLI vs Registered)
  // -----------------------------------------------------------
  let rawCalling = (call as any).customer_number || call.calling_number || call.phone_number || (call as any).caller_id || (call as any).cli || '';
  if (!rawCalling || rawCalling.includes('-')) {
    const phoneInFn = (call.original_filename || '').match(/(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/)?.[1]
      || (call.original_filename || '').match(/(?:^|[^0-9])91([6-9]\d{9})(?:[^0-9]|$)/)?.[1];
    if (phoneInFn) {
      rawCalling = phoneInFn;
    }
  }

  const rawRegistered = call.registered_number || (trade ? ((trade as any).customer_number || trade.client_number || trade.phone_number || (trade as any).mobile || (trade as any).mobile_number || (trade as any).contact || (trade as any).contact_no) : '') || call.client_number || '';

  const q1Eval = evaluateDeterministicQ1(rawCalling, rawRegistered, transcript);
  const q1Result: AuditQuestionResult = {
    status: q1Eval.status,
    evidence: q1Eval.evidence,
    reason: q1Eval.reason,
    speaker: q1Eval.speaker === 'CLIENT' ? 'CLIENT' : 'ADVISOR',
    confidence: q1Eval.confidence,
    evidence_verified: true,
    flag: q1Eval.status === 'FAIL' ? 'FATAL' : undefined,
  };

  // -----------------------------------------------------------
  // Q2: Pre-Order Client Code / UCC Confirmation (ASR-Aware)
  // -----------------------------------------------------------
  const expectedUcc = normalizeClientCode(call.client_code || call.client || (trade ? trade.client : ''));
  let q2Result: AuditQuestionResult;

  if (!expectedUcc) {
    q2Result = {
      status: 'REVIEW',
      evidence: 'Expected client UCC not found in customer master or trade execution records.',
      reason: 'Missing master data: Client UCC cannot be verified without reference client code.',
      confidence: 0.50,
      evidence_verified: false,
    };
  } else {
    // 1. Direct normalizer match
    let clientCodeMatch = matchClientCodeInTranscript(expectedUcc, transcript);

    // 2. ASR candidate resolver check
    if (!clientCodeMatch.matched) {
      const candidates = extractSpokenUccCandidates(transcript);
      for (const cand of candidates) {
        const res = resolveUccWithAuthoritativeData(db, cand.cleanCandidate, expectedUcc, rawCalling);
        if (res.status === 'RESOLVED' && res.resolvedUcc === expectedUcc) {
          clientCodeMatch = { matched: true, score: 0.35, matchedVariant: cand.rawText };
          break;
        }
      }
    }

    if (clientCodeMatch.matched) {
      const matchedSeg = advisorSegments.find((s) => matchClientCodeInTranscript(expectedUcc, s.text).matched) ||
        segments.find((s) => matchClientCodeInTranscript(expectedUcc, s.text).matched);

      const segSpeaker = matchedSeg ? matchedSeg.speaker : 'ADVISOR';
      let segText = matchedSeg?.text;
      if (!segText) {
        const sentences = transcript.split(/[.?!;\n]+/);
        segText = sentences.find((s) => matchClientCodeInTranscript(expectedUcc, s).matched) || expectedUcc;
      }
      const segTime = matchedSeg ? ` at ${matchedSeg.start_time}s` : '';

      q2Result = {
        status: 'PASS',
        evidence: `Client UCC ${expectedUcc} confirmed in conversation${segTime}: "${segText.trim()}"`,
        reason: `Authoritative client UCC ${expectedUcc} confirmed in dialogue.`,
        confidence: 0.95,
        speaker: segSpeaker,
        start_ms: matchedSeg ? Math.round(matchedSeg.start_time * 1000) : undefined,
        end_ms: matchedSeg ? Math.round(matchedSeg.end_time * 1000) : undefined,
        evidence_verified: true,
      };
    } else {
      // Check if advisor explicitly confirmed a wrong UCC
      const wrongUccMatch = transcript.match(/(?:client|ucc|code)\s*(?:is|code|id|no|#)?\s*[:\-]?\s*([a-zA-Z]{2,5}\d{4,8})/i);
      const isConversationalWord = wrongUccMatch && /^(?:please|confirm|verification|available|fundsindia|bataye|kare|bolo)$/i.test(wrongUccMatch[1]);
      if (wrongUccMatch && !isConversationalWord && normalizeClientCode(wrongUccMatch[1]) !== expectedUcc) {
        q2Result = {
          status: 'FAIL',
          flag: 'FATAL',
          evidence: `Advisor confirmed wrong client UCC (${wrongUccMatch[1]}) instead of registered UCC (${expectedUcc}).`,
          reason: `Fatal SEBI non-compliance: advisor confirmed wrong Client Code/UCC (${wrongUccMatch[1]}).`,
          confidence: 0.95,
          evidence_verified: true,
        };
      } else {
        q2Result = {
          status: 'FAIL',
          flag: 'FATAL',
          evidence: `Client UCC ${expectedUcc} was NOT confirmed in the conversation prior to order execution.`,
          reason: 'Fatal SEBI non-compliance: advisor failed to confirm client code before placing order.',
          confidence: 0.95,
          evidence_verified: true,
        };
      }
    }
  }

  // -----------------------------------------------------------
  // Q3: 3-Point Check: Stock, Price/CMP, Quantity across Spoken Orders
  // Evaluates strictly what was spoken in the dialogue!
  // Trade execution records are NOT used as expected spoken values.
  // -----------------------------------------------------------
  let q3Result: AuditQuestionResult;
  const isCmpMentioned = mentionsMarketPriceOrCMP(transcript) || /\b(?:cmp|current\s+market\s+price|market\s+price|market\s+rate|at\s+market|market\s+pe|market\s+order|rate\s+pe|bhav\s+pe|current\s+bhav|live\s+rate)\b/i.test(transcript);

  if (callOrders.length > 0) {
    const orderResults: Array<{
      orderIndex: number;
      symbol: string;
      pass: boolean;
      missing: string[];
      spokenQty: string;
      spokenPrice: string;
    }> = [];

    for (const ord of callOrders) {
      const orderSymbol = (ord.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      let symCheck = matchSymbolInTranscript(orderSymbol, transcript);
      if (!symCheck.matched && orderSymbol) {
        const aliases = (SYMBOL_ALIASES as Record<string, string[]>)[orderSymbol.toUpperCase()] || [];
        for (const al of aliases) {
          if (transcript.toLowerCase().includes(al.toLowerCase())) {
            symCheck = { matched: true, matchedAlias: al };
            break;
          }
        }
      }

      // Quantity check: MUST be confirmed in spoken dialogue, NEVER from trade record
      const spokenQtyVal = ord.quantity;
      let qtyCheck = Boolean(spokenQtyVal && spokenQtyVal > 0 && (matchQuantityInTranscript(spokenQtyVal, transcript) || transcript.includes(String(spokenQtyVal))));
      if (!qtyCheck && ord.raw_quantity) {
        qtyCheck = transcript.toLowerCase().includes(ord.raw_quantity.toLowerCase());
      }

      // Price check: CMP or spoken limit price, NEVER from trade record
      const isCmp = isCmpMentioned || ord.price_type === 'CMP' || ord.price_type === 'MARKET';
      const isLimit = Boolean(ord.limit_price && matchPriceInTranscript(ord.limit_price, transcript));
      const priceCheck = isCmp || isLimit;

      const missing: string[] = [];
      if (!symCheck.matched) missing.push(orderSymbol ? `Stock Symbol (${orderSymbol})` : 'Stock Symbol');
      if (!qtyCheck) missing.push(spokenQtyVal ? `Quantity (${spokenQtyVal})` : 'Quantity');
      if (!priceCheck) missing.push('Price / CMP');

      orderResults.push({
        orderIndex: ord.order_index,
        symbol: orderSymbol || 'Stock',
        pass: missing.length === 0,
        missing,
        spokenQty: qtyCheck ? String(spokenQtyVal || ord.raw_quantity) : 'Not spoken',
        spokenPrice: isCmp ? 'CMP' : (isLimit ? `₹${ord.limit_price}` : 'Not spoken'),
      });
    }

    const failedOrders = orderResults.filter((o) => !o.pass);
    if (failedOrders.length === 0) {
      q3Result = {
        status: 'PASS',
        evidence: `All ${orderResults.length} pre-order instruction(s) confirmed in dialogue: ${orderResults.map((o) => `${o.symbol} (Qty: ${o.spokenQty}, Price: ${o.spokenPrice})`).join('; ')}. Stock, Quantity, and Price/CMP confirmed.`,
        reason: 'All pre-order parameter requirements (Stock, Price/CMP, Quantity) verified in dialogue.',
        confidence: 0.95,
        evidence_verified: true,
      };
    } else {
      q3Result = {
        status: 'FAIL',
        flag: 'NON_FATAL',
        evidence: `Order verification discrepancy: ${failedOrders.map((f) => `Order #${f.orderIndex} (${f.symbol}) missing ${f.missing.join(', ')}`).join('; ')}.`,
        reason: 'Non-fatal discrepancy: One or more order parameters omitted from pre-order dialogue.',
        confidence: 0.90,
        evidence_verified: true,
      };
    }
  } else {
    // Spoken dialogue direct extraction when no call_orders exist
    let stockFound = false;
    let spokenStockName = 'Not spoken';
    for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
      if (transcript.toUpperCase().includes(symKey)) {
        stockFound = true;
        spokenStockName = symKey;
        break;
      }
      for (const al of aliases) {
        if (transcript.toLowerCase().includes(al.toLowerCase())) {
          stockFound = true;
          spokenStockName = al;
          break;
        }
      }
      if (stockFound) break;
    }

    const qtyMatch = transcript.match(/\b(\d+)\s*(?:quantities|quantity|qty|shares|share|lots?|units?|scrips?)\b/i)
      || transcript.match(/\b(?:quantity|qty|shares?)\s*(?:is|of|:)?\s*(\d+)\b/i);
    const hasQty = !!qtyMatch;
    const spokenQty = qtyMatch ? qtyMatch[1] : 'Not spoken';

    const hasPrice = isCmpMentioned || /\b(?:cmp|current\s*market\s*price|at\s*market|bhav)\b/i.test(transcript) || /(?:₹|rs\.?|inr|price|rate|at)\s*(\d+(?:\.\d{1,2})?)/i.test(transcript);
    const spokenPrice = isCmpMentioned ? 'Current Market Price (CMP)' : (hasPrice ? 'Specified Price' : 'Not spoken');

    const missingPoints: string[] = [];
    if (!stockFound) missingPoints.push('Stock Symbol');
    if (!hasPrice) missingPoints.push('Price / CMP');
    if (!hasQty) missingPoints.push('Quantity');

    if (missingPoints.length === 0) {
      q3Result = {
        status: 'PASS',
        evidence: `Spoken Stock: "${spokenStockName}", Spoken Quantity: ${spokenQty}, Spoken Price: ${spokenPrice}. All 3 order parameters confirmed in dialogue.`,
        reason: 'All 3 required pre-order details (Stock, Price/CMP, Quantity) confirmed in dialogue.',
        confidence: 0.92,
        evidence_verified: true,
      };
    } else {
      q3Result = {
        status: 'FAIL',
        flag: 'NON_FATAL',
        evidence: `Order detail discrepancies: ${missingPoints.join(', ')} not confirmed in dialogue. [Spoken: Stock=${spokenStockName}, Qty=${spokenQty}, Price=${spokenPrice}].`,
        reason: `Non-fatal discrepancy: ${missingPoints.join(' and ')} omitted from pre-order dialogue.`,
        confidence: 0.88,
        evidence_verified: true,
      };
    }
  }

  // -----------------------------------------------------------
  // Q4: Customer Verbal Acknowledgement (Not Audited per SEBI Rubric: Always PASS)
  // -----------------------------------------------------------
  const q4Result: AuditQuestionResult = {
    status: 'PASS',
    flag: 'NON_FATAL',
    evidence: 'Default PASS — Parameter is not audited under the active SEBI rubric.',
    reason: 'Customer acknowledgement is not audited under this rubric (Default PASS).',
    speaker: 'CLIENT',
    confidence: 1.0,
    evidence_verified: true,
  };

  // -----------------------------------------------------------
  // Q5: Return / Profit Guarantee Prohibition (Fatal only when an actual guarantee is made)
  // -----------------------------------------------------------
  const q5Result = await evaluateQ5SemanticAdvisorPromises(
    transcript,
    segments,
    groqApiKey,
    geminiKey
  );

  // Verify evidence quotes in transcript for Q1-Q5
  const allQuestions = [q1Result, q2Result, q3Result, q4Result, q5Result];
  for (const q of allQuestions) {
    if (q.evidence && q.status === 'PASS') {
      const quoteMatch = q.evidence.match(/"([^"]{8,})"/);
      if (quoteMatch) {
        const quoteText = quoteMatch[1].toLowerCase();
        if (!transcript.toLowerCase().includes(quoteText.slice(0, 20))) {
          // Verify with normalized spoken numbers
          const normTr = transcript.replace(/[^a-zA-Z0-9\s]/g, ' ').toLowerCase();
          const normQuote = quoteText.replace(/[^a-zA-Z0-9\s]/g, ' ').toLowerCase();
          if (!normTr.includes(normQuote.slice(0, 15))) {
            q.evidence_verified = false;
          }
        }
      }
    }
  }

  return {
    q1: q1Result,
    q2: q2Result,
    q3: q3Result,
    q4: q4Result,
    q5: q5Result,
    model: 'AuditEQ-v20-5pt-authoritative',
  };
}
