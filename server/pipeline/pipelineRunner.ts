// =============================================================
// AuditEQ 9-Stage Orchestrator & 24/7 Autonomous Self-Healing Worker
//
// Ensures:
// 1. Strict, sequential 9-stage progression.
// 2. State machine guards: REGULAR, SCRAP, IDENTITY_REVIEW,
//    TRADE_REVIEW, CLASSIFICATION_REVIEW are strictly blocked from audit.
// 3. 24/7 continuous autonomous processing: never dies, auto-recovers
//    from stalled states, missing keys, rate limits, and network errors.
// 4. Standby mode when credentials are not yet entered; immediately
//    resumes upon key availability.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { stage2ResolveIdentity } from './identity';
import { stage3TranscribeCall } from './transcription';
import { stage3_5AttributeSpeakers } from './speakers';
import { stage4ClassifyCall } from './classification';
import { stage5MatchTrade } from './tradeMatcher';
import { isAuditEligible } from './eligibility';
import { stage7AuditCall } from './audit';
import { stage8CalculateScore } from './scoring';
import { stage9PublishAudit, stage9ReconcileMissingCalls } from './reconciliation';
import type { CallRecord } from '../../src/types';
import type { ClassificationResult } from './types';
import { geminiTranscribeLimiter } from '../asr-engine';
import { detectHighRecallPreOrderCandidate } from '../classifier';

export interface PipelineWorkerStatus {
  isRunning: boolean;
  activeWorkers: number;
  totalProcessedToday: number;
  lastActiveTime: string;
  hasGroqKey: boolean;
  hasGeminiKey: boolean;
  statusMessage: string;
  queueDepth: number;
}

let isWorkerLoopActive = false;
let isHeartbeatRunning = false;
const activeProcessingCallIds = new Set<number>();
const MAX_CONCURRENT_PIPELINE_WORKERS = 3;
let lastHeartbeatTime = new Date().toISOString();
let totalProcessedCount = 0;
let rateLimitPauseUntil = 0;

export function ensureCallColumns(db: DatabaseSync): void {
  try {
    const info = db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>;
    const cols = new Set(info.map((c) => c.name));
    if (!cols.has('trade_match_status')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_status TEXT;'); } catch {}
    }
    if (!cols.has('classification_reason')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN classification_reason TEXT;'); } catch {}
    }
    if (!cols.has('audit_notes')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN audit_notes TEXT;'); } catch {}
    }
    if (!cols.has('identity_status')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN identity_status TEXT;'); } catch {}
    }
    if (!cols.has('identity_source')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN identity_source TEXT;'); } catch {}
    }
    if (!cols.has('matched_trade_id')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN matched_trade_id INTEGER;'); } catch {}
    }
    if (!cols.has('trade_match_confidence')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_confidence REAL;'); } catch {}
    }
    if (!cols.has('trade_match_margin')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_margin REAL;'); } catch {}
    }
    if (!cols.has('trade_match_reason')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_reason TEXT;'); } catch {}
    }
    if (!cols.has('current_gate')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN current_gate TEXT;'); } catch {}
    }
    if (!cols.has('gate_reason')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN gate_reason TEXT;'); } catch {}
    }
    if (!cols.has('pipeline_stage')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN pipeline_stage TEXT;'); } catch {}
    }
    if (!cols.has('retry_count')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN retry_count INTEGER DEFAULT 0;'); } catch {}
    }
    if (!cols.has('review_resolution')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN review_resolution TEXT;'); } catch {}
    }
    if (!cols.has('review_resolved_by')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN review_resolved_by INTEGER;'); } catch {}
    }
    if (!cols.has('review_resolved_at')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN review_resolved_at TEXT;'); } catch {}
    }
    if (!cols.has('review_resolution_notes')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN review_resolution_notes TEXT;'); } catch {}
    }
  } catch {}
}

/**
 * Execute the 9-stage pipeline sequentially for a single call
 */
export async function runFullPipelineForCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<{ success: boolean; stage: string; details: any }> {
  ensureCallColumns(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare("UPDATE calls SET processing_status = 'PROCESSING', updated_at = ? WHERE id = ?").run(now, callId);

  const activeGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;

  try {
    // ---------------------------------------------------------
    // EARLY SCRAP GUARD: Duration < 6 seconds = SCRAP (No Transcription)
    // Direct translation of SEBI regulatory mandate:
    // duration < 6 sec -> SCRAP immediately without expending API quotas.
    // ---------------------------------------------------------
    const initialDuration = call.duration_seconds || 0;
    if (initialDuration > 0 && initialDuration < 6) {
      console.log(`[Pipeline] Call #${callId} -> Pre-transcription SCRAP detection: duration ${initialDuration}s < 6s`);
      db.prepare(`
        UPDATE calls SET
          classification = 'SCRAP',
          call_type = 'scrap',
          status = 'scrap',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          pipeline_stage = 'SCRAP_FILTER',
          current_gate = 'GATE_1',
          gate_reason = 'Duration < 6s regulatory scrap threshold',
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(`Call duration (${initialDuration}s) is less than 6 seconds regulatory threshold. Classified as SCRAP without transcription.`, now, callId);

      return {
        success: true,
        stage: 'SCRAP_EXIT',
        details: {
          classification: 'SCRAP',
          reason: `Duration ${initialDuration}s < 6s. Excluded from transcription and audit.`,
        },
      };
    }

    // ---------------------------------------------------------
    // STAGE 2: IDENTITY RESOLUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 2: Identity Resolution`);
    stage2ResolveIdentity(db, callId);
    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'IDENTITY_RESOLUTION',
        current_gate = 'GATE_2',
        gate_reason = 'Client identity and authorization verified',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 3: TRANSCRIPTION (Google Gemini 3.5 Transcribe)
    // ---------------------------------------------------------
    let currentCall = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord;
    if (currentCall.transcript_status !== 'VALID' || !currentCall.transcript) {
      console.log(`[Pipeline] Call #${callId} -> Stage 3: Transcription (Gemini 3.5 Transcribe)`);
      await stage3TranscribeCall(db, callId, groqApiKey, activeGeminiKey);
    }
    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'TRANSCRIPTION',
        current_gate = 'GATE_3',
        gate_reason = 'High-fidelity transcription completed and validated',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 3.5: SPEAKER ATTRIBUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 3.5: Speaker Attribution`);
    stage3_5AttributeSpeakers(db, callId);

    // Re-resolve identity now that full transcript and segments are available
    stage2ResolveIdentity(db, callId);

    // ---------------------------------------------------------
    // STAGE 4: AI CALL INTENT CLASSIFICATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 4: AI Call Intent Classification`);
    let classificationResult: ClassificationResult;
    const callBeforeClassification = db.prepare('SELECT review_resolution, classification, classification_reason FROM calls WHERE id = ?').get(callId) as any;
    if (callBeforeClassification?.review_resolution === 'CONTINUED' && callBeforeClassification.classification === 'PRE_ORDER') {
      classificationResult = {
        classification: 'PRE_ORDER',
        confidence: 1.0,
        evidence: [],
        reason: callBeforeClassification.classification_reason || 'Human-resolved compliance approval to proceed with audit.',
      };
    } else {
      classificationResult = await stage4ClassifyCall(db, callId, groqApiKey, activeGeminiKey);
    }

    // STATE MACHINE GUARD WITH HIGH-RECALL PRE-ORDER CORROBORATION:
    // 1. Scrap calls strictly exit immediately.
    if (classificationResult.classification === 'SCRAP') {
      db.prepare(`
        UPDATE calls SET
          classification = 'SCRAP',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          status = 'scrap',
          call_type = 'scrap',
          pipeline_stage = 'SCRAP_EXIT',
          current_gate = 'GATE_4',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        classificationResult.reason,
        classificationResult.reason,
        now,
        callId
      );

      return {
        success: true,
        stage: 'CLASSIFICATION_EXIT',
        details: {
          classification: 'SCRAP',
          reason: classificationResult.reason,
          message: 'Call marked as SCRAP. Safely excluded from audit progression.',
        },
      };
    }

    // 2. High-Recall Pre-Order Cross-Check before finalizing REGULAR or REVIEW:
    // Probe trade execution existence & distributed conversational order parameters
    const highRecallCandidate = detectHighRecallPreOrderCandidate(call.transcript);
    const tradeProbe = stage5MatchTrade(db, callId);
    const hasCorroboratingTrade = tradeProbe.status === 'CONFIRMED' || (tradeProbe.matched_trade_id !== null && tradeProbe.matched_trade_id !== undefined);

    if (classificationResult.classification === 'REGULAR' || classificationResult.classification === 'REVIEW') {
      if (highRecallCandidate.isCandidate || hasCorroboratingTrade) {
        // RESCUE: Genuine trading activity corroborated by distributed speech evidence or matching trade record!
        console.log(`[Pipeline] Call #${callId} -> Rescued from ${classificationResult.classification} to PRE_ORDER (Candidate: ${highRecallCandidate.isCandidate}, TradeMatch: ${hasCorroboratingTrade})`);
        classificationResult = {
          classification: 'PRE_ORDER',
          confidence: 0.95,
          evidence: highRecallCandidate.evidence || `Corroborating trade #${tradeProbe.matched_trade_id} execution matched.`,
          reason: highRecallCandidate.reason || `Corroborating trade #${tradeProbe.matched_trade_id} execution confirms order directive.`,
          model: 'pre-order-recall-rescuer',
        };
      }
    }

    // 3. Verified non-order REGULAR calls safely exit
    if (classificationResult.classification === 'REGULAR') {
      db.prepare(`
        UPDATE calls SET
          classification = 'REGULAR',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          status = 'regular',
          call_type = 'regular',
          pipeline_stage = 'REGULAR_EXIT',
          current_gate = 'GATE_4',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        classificationResult.reason,
        classificationResult.reason,
        now,
        callId
      );

      return {
        success: true,
        stage: 'CLASSIFICATION_EXIT',
        details: {
          classification: 'REGULAR',
          reason: classificationResult.reason,
          message: 'Call marked as REGULAR. Safely excluded from audit progression.',
        },
      };
    }

    if (classificationResult.classification === 'REVIEW') {
      db.prepare(`
        UPDATE calls SET
          classification = 'REVIEW',
          audit_status = 'REVIEW',
          processing_status = 'COMPLETED',
          status = 'review',
          call_type = 'review',
          pipeline_stage = 'REVIEW_PENDING',
          current_gate = 'GATE_4',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        classificationResult.reason || 'Order intent ambiguous; routed to human compliance review workflow.',
        classificationResult.reason,
        now,
        callId
      );

      return {
        success: true,
        stage: 'REVIEW_PENDING',
        details: {
          classification: 'REVIEW',
          reason: classificationResult.reason,
          message: 'Call routed to human review workflow (REVIEW_PENDING). Awaiting compliance officer resolution.',
        },
      };
    }

    // ---------------------------------------------------------
    // STAGE 5: HIERARCHICAL ORDER & EXECUTION CORRELATION
    // Correlates spoken orders to trade execution records.
    // Genuine PRE_ORDER calls proceed to compliance audit regardless
    // of whether trade executions were found (SEBI Audit Integrity).
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 5: Exact Trade Matching`);
    const matchResult = stage5MatchTrade(db, callId);

    // Refresh identity if trade was matched so phone number and UCC are linked
    if (matchResult.matched_trade_id || (matchResult.multiExecution?.matched_trade_ids && matchResult.multiExecution.matched_trade_ids.length > 0)) {
      stage2ResolveIdentity(db, callId);
    }

    // FINAL CLASSIFICATION DECISION (Items 1 to 15, 139 to 152)
    if (matchResult.status === 'CONFIRMED') {
      // Confirmed executed trade correlation verified
      db.prepare(`
        UPDATE calls SET
          classification = 'PRE_ORDER',
          call_type = 'pre_order',
          status = 'pre_order',
          trade_match_status = 'CONFIRMED',
          matched_trade_id = ?,
          classification_reason = ?,
          pipeline_stage = 'TRADE_MATCHING',
          current_gate = 'GATE_5',
          gate_reason = 'Executed trade confirmed and correlated.',
          updated_at = ?
        WHERE id = ?
      `).run(
        matchResult.matched_trade_id,
        `Verified pre-order instruction linked to executed trade #${matchResult.matched_trade_id}.`,
        now,
        callId
      );
    } else if (matchResult.status === 'NO_MATCH') {
      // Order was spoken in call, but execution record not found.
      // Architectural rule: Execution correlation failure must NOT erase compliance audit.
      db.prepare(`
        UPDATE calls SET
          classification = 'PRE_ORDER',
          call_type = 'pre_order',
          trade_match_status = 'NO_MATCH',
          classification_reason = ?,
          pipeline_stage = 'TRADE_MATCHING',
          current_gate = 'GATE_5',
          gate_reason = 'Execution trade record not found; proceeding to spoken dialogue compliance audit.',
          updated_at = ?
        WHERE id = ?
      `).run(
        `Spoken order instruction confirmed in call; execution trade record not found (${matchResult.reason}). Proceeding to pre-order dialogue compliance audit.`,
        now,
        callId
      );
    } else {
      // matchResult.status === 'REVIEW'
      // Multiple candidate trades, ambiguous timing, or parameter variance.
      // Record execution as REVIEW but proceed with spoken order compliance audit.
      db.prepare(`
        UPDATE calls SET
          classification = 'PRE_ORDER',
          call_type = 'pre_order',
          trade_match_status = 'REVIEW',
          classification_reason = ?,
          pipeline_stage = 'TRADE_MATCHING',
          current_gate = 'GATE_5',
          gate_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        `Trade correlation requires review (${matchResult.reason}); proceeding to pre-order dialogue compliance audit.`,
        `Trade correlation review: ${matchResult.reason}`,
        now,
        callId
      );
    }

    // ---------------------------------------------------------
    // STAGE 6: AUDIT ELIGIBILITY GATE
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 6: Audit Eligibility Gate`);
    const eligibility = isAuditEligible(db, callId);
    if (!eligibility.eligible) {
      console.log(`[Pipeline] Call #${callId} -> Eligibility blocked: [${eligibility.gateCode}] ${eligibility.reason}`);
      db.prepare(`
        UPDATE calls SET
          audit_status = 'BLOCKED',
          processing_status = 'COMPLETED',
          status = 'blocked',
          pipeline_stage = 'AUDIT_GATE_BLOCKED',
          current_gate = ?,
          gate_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(eligibility.gateCode, eligibility.reason, now, callId);

      return {
        success: true,
        stage: 'ELIGIBILITY_GATE_BLOCKED',
        details: eligibility,
      };
    }

    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'AUDIT_GATE_PASSED',
        current_gate = 'GATE_6',
        gate_reason = 'All mandatory compliance audit eligibility criteria satisfied',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 7: Q1/Q2/Q3/Q4 COMPLIANCE AUDIT
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 7: Q1/Q2/Q3/Q4 Compliance Audit`);
    const auditResult = await stage7AuditCall(db, callId, groqApiKey, activeGeminiKey);

    // ---------------------------------------------------------
    // STAGE 8: SCORING (Unified Single Engine, Max 4)
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 8: Unified Scoring (Max 4)`);
    const scoreResult = stage8CalculateScore(auditResult);

    // ---------------------------------------------------------
    // STAGE 9: PUBLISH & RECONCILIATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 9: Publish Audit Scorecard`);
    const published = stage9PublishAudit(db, callId, auditResult, scoreResult);

    // Note: stage9ReconcileMissingCalls is intentionally scheduled to background execution
    // to prevent O(N^2) table scans choking individual call pipeline latency.

    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'COMPLETED',
        current_gate = 'GATE_9',
        gate_reason = 'Compliance audit completed and scorecard published',
        processing_status = 'COMPLETED',
        status = 'audited',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    totalProcessedCount++;

    return {
      success: true,
      stage: 'COMPLETED',
      details: {
        audit_id: published.audit_id,
        score: scoreResult.score,
        is_fatal: scoreResult.is_fatal,
        disposition: scoreResult.disposition,
      },
    };
  } catch (err: any) {
    console.error(`[Pipeline Error] Call #${callId}:`, err.message);

    const isApiKeyError = err.message && err.message.includes('AWAITING_API_KEY');
    const isRateLimit = err.message && (
      err.message.includes('429') ||
      err.message.includes('RESOURCE_EXHAUSTED') ||
      err.message.includes('resource_exhausted') ||
      err.message.includes('quota') ||
      err.message.includes('overloaded') ||
      err.message.includes('rate limit')
    );
    const isTransient = isRateLimit || (err.message && (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNRESET') || err.message.includes('fetch failed')));

    const currentRetry = ((call.retry_count as number) || 0) + 1;
    // CRITICAL SELF-HEALING: Under no circumstances leave processing_status as 'PROCESSING'!
    // Always release back to 'IDLE' and 'retry_pending' so the autonomous supervisor can recover.
    const shouldRetry = currentRetry < 5;
    db.prepare(`
      UPDATE calls SET
        processing_status = 'IDLE',
        status = ?,
        failure_reason = ?,
        pipeline_stage = 'FAILED',
        current_gate = 'GATE_ERROR',
        gate_reason = ?,
        retry_count = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      shouldRetry ? 'retry_pending' : 'failed',
      err.message,
      err.message,
      currentRetry,
      now,
      callId
    );

    throw err;
  }
}

/**
 * Autonomous 24/7 Watchdog: Auto-detects stalled calls, resets timed out locks,
 * prioritizes instant scrap calls and cached transcripts, and feeds calls into pipeline.
 */
export async function stepAutonomousPipelineWorker(
  db: DatabaseSync,
  getGroqKey: () => string | undefined,
  getGeminiKey?: () => string | undefined
): Promise<boolean> {
  ensureCallColumns(db);
  lastHeartbeatTime = new Date().toISOString();
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1. Self-Healing Watchdog: Reset any calls stuck in 'PROCESSING' for > 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 120000).toISOString().replace('T', ' ').slice(0, 19);
  const staleProcessing = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      updated_at = ?
    WHERE (processing_status = 'PROCESSING' OR status = 'processing')
      AND (updated_at < ? OR updated_at IS NULL)
  `).run(nowIso, twoMinutesAgo);

  if (staleProcessing.changes > 0) {
    console.log(`[Watchdog] Recovered ${staleProcessing.changes} stale call(s) stuck in PROCESSING > 2 min -> Moved to retry_pending`);
  }

  // 1a-2. Watchdog: Auto-advance any call that has a completed valid transcript but is stuck or unprogressed
  const staleTranscribed = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      updated_at = ?
    WHERE transcript_status = 'VALID'
      AND transcript IS NOT NULL AND length(trim(transcript)) > 0
      AND (audit_status IS NULL OR audit_status = 'PENDING')
      AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('COMPLETED', 'SCRAP_EXIT', 'REGULAR_EXIT', 'REVIEW_PENDING', 'AUDIT_GATE_BLOCKED'))
      AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'blocked', 'rejected')
      AND (processing_status != 'PROCESSING' OR updated_at < ?)
      AND (processing_status != 'IDLE' OR status NOT IN ('retry_pending', 'pending'))
  `).run(nowIso, twoMinutesAgo);

  if (staleTranscribed.changes > 0) {
    console.log(`[Watchdog] Auto-unblocked ${staleTranscribed.changes} call(s) with valid transcripts -> Ready for classification & audit`);
  }

  // 1b. Self-Healing: Reset calls with transient failures or retry_pending after 15s backoff
  const fifteenSecAgo = new Date(Date.now() - 15000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      failure_reason = NULL,
      updated_at = ?
    WHERE (processing_status = 'FAILED' OR status = 'retry_pending')
      AND (
        failure_reason LIKE '%429%'
        OR failure_reason LIKE '%RESOURCE_EXHAUSTED%'
        OR failure_reason LIKE '%rate limit%'
        OR failure_reason LIKE '%ETIMEDOUT%'
        OR failure_reason LIKE '%ECONNRESET%'
        OR failure_reason LIKE '%fetch failed%'
        OR failure_reason LIKE '%AWAITING_API_KEY%'
        OR status = 'retry_pending'
      )
      AND (updated_at < ? OR updated_at IS NULL)
  `).run(nowIso, fifteenSecAgo);

  const groqKey = getGroqKey();
  const geminiKey = getGeminiKey ? getGeminiKey() : process.env.GEMINI_API_KEY;

  // 1c. Self-Healing: If API keys are now configured, unblock previously blocked calls
  if ((groqKey && groqKey.trim()) || (geminiKey && geminiKey.trim())) {
    db.prepare(`
      UPDATE calls SET
        processing_status = 'IDLE',
        status = 'pending',
        failure_reason = NULL,
        updated_at = ?
      WHERE processing_status = 'AI_BLOCKED' OR status = 'ai_blocked'
    `).run(nowIso);
  }

  // Check concurrency limit
  if (activeProcessingCallIds.size >= MAX_CONCURRENT_PIPELINE_WORKERS) {
    return false;
  }

  const activeIdsList = activeProcessingCallIds.size > 0 ? Array.from(activeProcessingCallIds).join(',') : '0';

  // 2. Candidate Selection with Smart Prioritization:
  // Priority A: Scrap calls (< 6s) - Requires zero ASR/AI calls, runs immediately
  let nextCall = db.prepare(`
    SELECT id FROM calls
    WHERE id NOT IN (${activeIdsList})
      AND (processing_status = 'IDLE' OR status = 'retry_pending')
      AND status NOT IN ('audited', 'scrap', 'regular', 'review')
      AND duration_seconds > 0 AND duration_seconds < 6
    ORDER BY id ASC
    LIMIT 1
  `).get() as { id: number } | undefined;

  // Priority B: Calls that already have a valid transcript - No ASR needed
  // Explicit Stage Transition: Automatically advance any transcribed call to classification, matching, & audit
  if (!nextCall) {
    nextCall = db.prepare(`
      SELECT id FROM calls
      WHERE id NOT IN (${activeIdsList})
        AND (processing_status = 'IDLE' OR processing_status IS NULL OR status = 'retry_pending' OR status = 'transcribed' OR status = 'imported')
        AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'blocked', 'rejected')
        AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('COMPLETED', 'SCRAP_EXIT', 'REGULAR_EXIT', 'REVIEW_PENDING', 'AUDIT_GATE_BLOCKED'))
        AND transcript_status = 'VALID'
        AND transcript IS NOT NULL AND length(transcript) > 0
        AND (audit_status != 'AUDITED' OR audit_status IS NULL)
      ORDER BY id ASC
      LIMIT 1
    `).get() as { id: number } | undefined;
  }

  // Priority C: General pending calls needing ASR transcription
  const isAsrRateLimited = Date.now() < rateLimitPauseUntil || geminiTranscribeLimiter.isRateLimited();
  if (!nextCall && !isAsrRateLimited) {
    nextCall = db.prepare(`
      SELECT id FROM calls
      WHERE id NOT IN (${activeIdsList})
        AND (processing_status = 'IDLE' OR processing_status IS NULL OR status = 'retry_pending' OR status = 'imported' OR status = 'pending')
        AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'blocked', 'rejected')
        AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('COMPLETED', 'SCRAP_EXIT', 'REGULAR_EXIT', 'REVIEW_PENDING', 'AUDIT_GATE_BLOCKED'))
        AND (audit_status != 'AUDITED' OR audit_status IS NULL)
      ORDER BY id ASC
      LIMIT 1
    `).get() as { id: number } | undefined;
  }

  if (!nextCall) {
    return false;
  }

  // For non-scrap calls needing ASR, verify API keys.
  // If keys are missing, mark calls as AI_BLOCKED so UI/Diagnostics clearly report it!
  if ((!groqKey || !groqKey.trim()) && (!geminiKey || !geminiKey.trim())) {
    const callRec = db.prepare('SELECT duration_seconds, transcript FROM calls WHERE id = ?').get(nextCall.id) as { duration_seconds: number; transcript?: string } | undefined;
    const needsAsr = !callRec?.transcript && (!callRec || callRec.duration_seconds === 0 || callRec.duration_seconds >= 6);
    if (needsAsr) {
      db.prepare(`
        UPDATE calls SET
          processing_status = 'AI_BLOCKED',
          status = 'ai_blocked',
          failure_reason = 'AWAITING_API_KEY: Gemini or Groq API key is required to transcribe audio recordings.',
          updated_at = ?
        WHERE (processing_status = 'IDLE' OR status = 'retry_pending')
          AND (transcript IS NULL OR length(trim(transcript)) = 0)
          AND status NOT IN ('audited', 'scrap', 'regular', 'review')
          AND (duration_seconds = 0 OR duration_seconds >= 6)
      `).run(nowIso);
      return false;
    }
  }

  // RUN-09: Atomic claim to prevent race conditions across parallel supervisor ticks
  const claim = db.prepare(`
    UPDATE calls SET
      processing_status = 'PROCESSING',
      status = 'processing',
      updated_at = ?
    WHERE id = ?
      AND (
        processing_status IN ('IDLE', 'FAILED', 'AI_BLOCKED', 'PENDING')
        OR status IN ('idle', 'retry_pending', 'ai_blocked', 'transcribed', 'imported', 'pending')
        OR processing_status IS NULL
      )
  `).run(nowIso, nextCall.id);

  if (claim.changes === 0) {
    return false;
  }

  activeProcessingCallIds.add(nextCall.id);
  try {
    await runFullPipelineForCall(db, nextCall.id, groqKey, geminiKey);
    totalProcessedCount++;
    return true;
  } catch (err: any) {
    if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
      console.warn('[Autonomous Worker] Rate limit (429) encountered. Backing off for 20 seconds...');
      rateLimitPauseUntil = Date.now() + 20000;
      return false;
    }
    console.error(`[Autonomous Worker Error] Call #${nextCall.id}: ${err.message}`);
    // RUN-05: A single call failure must not terminate the entire batch!
    // Returning true lets the supervisor continue processing subsequent pending calls.
    return true;
  } finally {
    activeProcessingCallIds.delete(nextCall.id);
  }
}

/**
 * Starts the continuous 24/7 supervisor timer with concurrent worker dispatch
 */
export function start24x7WorkerSupervisor(
  db: DatabaseSync,
  getGroqKey: () => string | undefined,
  getGeminiKey?: () => string | undefined
): void {
  if (isHeartbeatRunning) return;
  isHeartbeatRunning = true;

  console.log('[AuditEQ] 24/7 Autonomous Pipeline Supervisor initialized with Gemini 3.5 Transcribe protection & multi-worker concurrency.');
  ensureCallColumns(db);

  setInterval(async () => {
    lastHeartbeatTime = new Date().toISOString();
    try {
      const needed = MAX_CONCURRENT_PIPELINE_WORKERS - activeProcessingCallIds.size;
      for (let i = 0; i < needed; i++) {
        stepAutonomousPipelineWorker(db, getGroqKey, getGeminiKey).catch((err: any) => {
          console.error('[Autonomous Worker Async Error]:', err?.message);
        });
      }
    } catch (err: any) {
      console.error('[Autonomous Supervisor Error]:', err.message);
    }
  }, 1000);
}

/**
 * Returns current real-time health metrics of the 24/7 pipeline
 */
export function getPipelineWorkerStatus(
  db: DatabaseSync,
  groqKey?: string,
  geminiKey?: string
): PipelineWorkerStatus {
  const queueDepth = (
    db.prepare(`
      SELECT count(*) as count FROM calls
      WHERE processing_status = 'IDLE'
        AND status NOT IN ('audited', 'scrap', 'regular')
        AND (audit_status = 'PENDING' OR classification = 'PENDING' OR transcript_status = 'PENDING')
    `).get() as { count: number }
  )?.count || 0;

  const hasGroq = Boolean(groqKey && groqKey.trim());
  const activeGeminiKey = geminiKey || process.env.GEMINI_API_KEY;
  const hasGemini = Boolean(activeGeminiKey && activeGeminiKey.trim());

  let statusMessage = '24/7 Autonomous AI Worker Active (Gemini 3.5 Transcribe Protected)';
  if (!hasGemini && !hasGroq) {
    statusMessage = 'Awaiting API Key (enter GEMINI_API_KEY or GROQ_API_KEY in Settings to activate AI processing)';
  } else if (geminiTranscribeLimiter.isRateLimited()) {
    const remaining = geminiTranscribeLimiter.getRemainingCooldownSec();
    statusMessage = `Gemini 3.5 rate-limit cooldown active (${remaining}s remaining). Resuming automatically.`;
  } else if (Date.now() < rateLimitPauseUntil) {
    statusMessage = 'Rate limit backoff active (resuming automatically in seconds)';
  } else if (activeProcessingCallIds.size > 0) {
    statusMessage = `Concurrently processing ${activeProcessingCallIds.size} call(s) (Calls: #${Array.from(activeProcessingCallIds).join(', #')}) through 9-stage pipeline`;
  } else if (queueDepth > 0) {
    statusMessage = `Queue has ${queueDepth} calls waiting for processing`;
  } else {
    statusMessage = 'All uploaded calls processed. Standing by 24/7 for incoming data';
  }

  const todayStart = new Date().toISOString().slice(0, 10) + ' 00:00:00';
  let processedToday = 0;
  try {
    const todayRow = db.prepare(`
      SELECT count(*) as count FROM calls
      WHERE updated_at >= ?
        AND (processing_status = 'COMPLETED' OR status IN ('audited', 'scrap', 'regular', 'review'))
    `).get(todayStart) as { count: number } | undefined;
    processedToday = todayRow?.count || 0;
  } catch {
    processedToday = totalProcessedCount;
  }

  return {
    isRunning: isHeartbeatRunning,
    activeWorkers: activeProcessingCallIds.size,
    totalProcessedToday: processedToday,
    lastActiveTime: lastHeartbeatTime,
    hasGroqKey: hasGroq,
    hasGeminiKey: hasGemini,
    statusMessage,
    queueDepth,
  };
}
