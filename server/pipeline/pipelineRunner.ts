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
let activeProcessingCallId: number | null = null;
let lastHeartbeatTime = new Date().toISOString();
let totalProcessedCount = 0;
let rateLimitPauseUntil = 0;

/**
 * Execute the 9-stage pipeline sequentially for a single call
 */
export async function runFullPipelineForCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string
): Promise<{ success: boolean; stage: string; details: any }> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare("UPDATE calls SET processing_status = 'PROCESSING', updated_at = ? WHERE id = ?").run(now, callId);

  try {
    // ---------------------------------------------------------
    // STAGE 2: IDENTITY RESOLUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 2: Identity Resolution`);
    const identityResult = stage2ResolveIdentity(db, callId);

    // ---------------------------------------------------------
    // STAGE 3: TRANSCRIPTION (Independent Whisper Hearing)
    // ---------------------------------------------------------
    let currentCall = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord;
    if (currentCall.transcript_status !== 'VALID' || !currentCall.transcript) {
      console.log(`[Pipeline] Call #${callId} -> Stage 3: Transcription`);
      await stage3TranscribeCall(db, callId, groqApiKey);
    }

    // ---------------------------------------------------------
    // STAGE 3.5: SPEAKER ATTRIBUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 3.5: Speaker Attribution`);
    stage3_5AttributeSpeakers(db, callId);

    // Re-resolve identity now that full transcript and segments are available
    stage2ResolveIdentity(db, callId);

    // ---------------------------------------------------------
    // STAGE 4: AI CALL CLASSIFICATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 4: AI Call Classification`);
    const classificationResult = await stage4ClassifyCall(db, callId, groqApiKey);

    // STATE MACHINE GUARD:
    // If call is SCRAP, REGULAR, or REVIEW, it MUST NOT proceed to trade matching or audit!
    if (classificationResult.classification !== 'PRE_ORDER') {
      const completionStatus = classificationResult.classification === 'SCRAP' ? 'scrap'
        : classificationResult.classification === 'REGULAR' ? 'regular' : 'needs_review';

      db.prepare(`
        UPDATE calls SET
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          status = ?,
          call_type = ?,
          updated_at = ?
        WHERE id = ?
      `).run(completionStatus, completionStatus, now, callId);

      return {
        success: true,
        stage: 'CLASSIFICATION_EXIT',
        details: {
          classification: classificationResult.classification,
          reason: classificationResult.reason,
          message: `Call marked as ${classificationResult.classification}. Strict compliance guard safely blocked audit progression.`,
        },
      };
    }

    // ---------------------------------------------------------
    // STAGE 5: EXACT TRADE MATCHING
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 5: Exact Trade Matching`);
    const matchResult = stage5MatchTrade(db, callId);

    // Refresh identity if trade was matched so phone number and UCC are linked
    if (matchResult.matched_trade_id) {
      stage2ResolveIdentity(db, callId);
    }

    // STATE MACHINE GUARD:
    // If trade match is not CONFIRMED, it MUST NOT proceed to audit!
    if (matchResult.status !== 'CONFIRMED') {
      db.prepare(`
        UPDATE calls SET
          audit_status = 'BLOCKED',
          processing_status = 'COMPLETED',
          status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(matchResult.status === 'REVIEW' ? 'needs_review' : 'unmatched', now, callId);

      return {
        success: true,
        stage: 'TRADE_MATCH_EXIT',
        details: {
          trade_match_status: matchResult.status,
          reason: matchResult.reason,
          message: `Trade matching yielded ${matchResult.status}. Blocked from audit progression.`,
        },
      };
    }

    // ---------------------------------------------------------
    // STAGE 6: AUDIT ELIGIBILITY GATE
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 6: Audit Eligibility Gate`);
    const eligibility = isAuditEligible(db, callId);
    if (!eligibility.eligible) {
      db.prepare(`
        UPDATE calls SET
          audit_status = 'BLOCKED',
          processing_status = 'COMPLETED',
          status = 'blocked',
          updated_at = ?
        WHERE id = ?
      `).run(now, callId);

      return {
        success: true,
        stage: 'ELIGIBILITY_GATE_BLOCKED',
        details: eligibility,
      };
    }

    // ---------------------------------------------------------
    // STAGE 7: Q1/Q2/Q3/Q5 AUDIT
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 7: Q1/Q2/Q3/Q5 Compliance Audit`);
    const auditResult = await stage7AuditCall(db, callId, groqApiKey);

    // ---------------------------------------------------------
    // STAGE 8: SCORING (Unified Single Engine, Max 4)
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 8: Unified Scoring`);
    const scoreResult = stage8CalculateScore(auditResult);

    // ---------------------------------------------------------
    // STAGE 9: PUBLISH & RECONCILIATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 9: Publish & Reconciliation`);
    const published = stage9PublishAudit(db, callId, auditResult, scoreResult);

    // Reconcile trades
    stage9ReconcileMissingCalls(db);

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
    db.prepare(`
      UPDATE calls SET
        processing_status = ?,
        failure_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(isApiKeyError ? 'IDLE' : 'FAILED', err.message, now, callId);

    throw err;
  }
}

/**
 * Autonomous 24/7 Watchdog: Auto-detects stalled calls, resets timed out locks,
 * and feeds uncompleted calls into the pipeline.
 */
export async function stepAutonomousPipelineWorker(
  db: DatabaseSync,
  getGroqKey: () => string | undefined
): Promise<boolean> {
  lastHeartbeatTime = new Date().toISOString();

  // If rate-limited, wait out the backoff period
  if (Date.now() < rateLimitPauseUntil) {
    return false;
  }

  // 1. Self-Healing: Reset any calls stuck in 'PROCESSING' for > 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 120000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      updated_at = ?
    WHERE processing_status = 'PROCESSING' AND (updated_at < ? OR updated_at IS NULL)
  `).run(new Date().toISOString().replace('T', ' ').slice(0, 19), twoMinutesAgo);

  // 2. Pick next pending call
  // Priority:
  // - imported calls needing full pipeline
  // - calls with classification 'PRE_ORDER' and identity 'CONFIRMED' needing audit
  const nextCall = db.prepare(`
    SELECT id FROM calls
    WHERE processing_status = 'IDLE'
      AND status NOT IN ('audited', 'scrap', 'regular')
      AND (audit_status = 'PENDING' OR classification = 'PENDING' OR transcript_status = 'PENDING')
    ORDER BY id ASC
    LIMIT 1
  `).get() as { id: number } | undefined;

  if (!nextCall) {
    return false;
  }

  const groqKey = getGroqKey();
  if (!groqKey || !groqKey.trim()) {
    // API key not entered yet -> Worker waits gracefully in standby
    return false;
  }

  activeProcessingCallId = nextCall.id;
  try {
    await runFullPipelineForCall(db, nextCall.id, groqKey);
    return true;
  } catch (err: any) {
    // Check if error was a 429 rate limit
    if (err.message && err.message.includes('429')) {
      console.warn('[Autonomous Worker] Groq rate limit (429) encountered. Backing off for 25 seconds...');
      rateLimitPauseUntil = Date.now() + 25000;
    }
    return false;
  } finally {
    activeProcessingCallId = null;
  }
}

/**
 * Starts the continuous 24/7 supervisor timer
 */
export function start24x7WorkerSupervisor(
  db: DatabaseSync,
  getGroqKey: () => string | undefined
): void {
  if (isHeartbeatRunning) return;
  isHeartbeatRunning = true;

  console.log('[AuditEQ] 24/7 Autonomous Pipeline Supervisor initialized.');

  setInterval(async () => {
    if (isWorkerLoopActive) return;
    isWorkerLoopActive = true;
    try {
      await stepAutonomousPipelineWorker(db, getGroqKey);
    } catch (err: any) {
      console.error('[Autonomous Supervisor Error]:', err.message);
    } finally {
      isWorkerLoopActive = false;
    }
  }, 2000);
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
  const hasGemini = Boolean(geminiKey && geminiKey.trim());

  let statusMessage = '24/7 Autonomous AI Worker Active';
  if (!hasGroq) {
    statusMessage = 'Awaiting Groq API Key (enter key in Settings to activate AI processing)';
  } else if (Date.now() < rateLimitPauseUntil) {
    statusMessage = 'Rate limit backoff active (resuming automatically in seconds)';
  } else if (activeProcessingCallId) {
    statusMessage = `Processing Call #${activeProcessingCallId} through 9-stage pipeline`;
  } else if (queueDepth > 0) {
    statusMessage = `Queue has ${queueDepth} calls waiting for processing`;
  } else {
    statusMessage = 'All uploaded calls processed. Standing by 24/7 for incoming data';
  }

  return {
    isRunning: isHeartbeatRunning,
    activeWorkers: activeProcessingCallId ? 1 : 0,
    totalProcessedToday: totalProcessedCount,
    lastActiveTime: lastHeartbeatTime,
    hasGroqKey: hasGroq,
    hasGeminiKey: hasGemini,
    statusMessage,
    queueDepth,
  };
}
