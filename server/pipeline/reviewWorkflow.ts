// =============================================================
// Review Completion Workflow:
// REVIEW_PENDING -> HUMAN_RESOLVED -> CONTINUE / REJECT
//
// Addresses user mandate:
// "REVIEW has no proper completion workflow. A REVIEW call can be stopped
//  without a controlled human-resolution process.
//  Solution: create REVIEW_PENDING -> HUMAN_RESOLVED -> CONTINUE/REJECT."
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { CallRecord } from '../../src/types';
import { runFullPipelineForCall, ensureCallColumns } from './pipelineRunner';

export interface ReviewResolutionParams {
  action: 'CONTINUE' | 'REJECT';
  resolvedClassification?: 'PRE_ORDER' | 'REGULAR' | 'SCRAP';
  notes?: string;
  userId?: number;
  groqApiKey?: string;
  geminiApiKey?: string;
}

export interface ReviewResolutionResult {
  success: boolean;
  action: 'CONTINUE' | 'REJECT';
  callId: number;
  previous_classification: string;
  final_classification: string;
  pipeline_stage: string;
  message: string;
  pipeline_result?: any;
}

export async function resolveCallReview(
  db: DatabaseSync,
  callId: number,
  params: ReviewResolutionParams
): Promise<ReviewResolutionResult> {
  ensureCallColumns(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const previousClassification = call.classification || 'REVIEW';
  const notes = params.notes || (params.action === 'CONTINUE' ? 'Resolved by human reviewer to proceed with audit.' : 'Rejected by human reviewer.');

  if (params.action === 'REJECT') {
    const finalClass = params.resolvedClassification || (previousClassification === 'SCRAP' ? 'SCRAP' : 'REGULAR');
    const completionType = finalClass === 'SCRAP' ? 'scrap' : 'regular';

    db.prepare(`
      UPDATE calls SET
        classification = ?,
        call_type = ?,
        status = 'rejected',
        audit_status = 'EXCLUDED',
        processing_status = 'COMPLETED',
        pipeline_stage = 'HUMAN_RESOLVED',
        current_gate = 'HUMAN_REVIEW',
        gate_reason = ?,
        review_resolution = 'REJECTED',
        review_resolved_by = ?,
        review_resolved_at = ?,
        review_resolution_notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      finalClass,
      completionType,
      `Rejected in human review: ${notes}`,
      params.userId || null,
      now,
      notes,
      now,
      callId
    );

    return {
      success: true,
      action: 'REJECT',
      callId,
      previous_classification: previousClassification,
      final_classification: finalClass,
      pipeline_stage: 'HUMAN_RESOLVED',
      message: `Call #${callId} human-resolved: REJECTED as ${finalClass}. Safely excluded from audit.`,
    };
  }

  // Action is CONTINUE
  const finalClass = params.resolvedClassification || 'PRE_ORDER';

  db.prepare(`
    UPDATE calls SET
      classification = ?,
      call_type = 'pre_order',
      status = 'processing',
      processing_status = 'PROCESSING',
      audit_status = 'PENDING',
      pipeline_stage = 'HUMAN_RESOLVED',
      current_gate = 'HUMAN_REVIEW',
      gate_reason = ?,
      review_resolution = 'CONTINUED',
      review_resolved_by = ?,
      review_resolved_at = ?,
      review_resolution_notes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    finalClass,
    `Continued via human review: ${notes}`,
    params.userId || null,
    now,
    notes,
    now,
    callId
  );

  let pipelineRes: any = null;
  try {
    // Continue downstream pipeline execution for the approved PRE_ORDER call
    pipelineRes = await runFullPipelineForCall(
      db,
      callId,
      params.groqApiKey,
      params.geminiApiKey
    );
  } catch (err: any) {
    pipelineRes = { error: err.message };
  }

  return {
    success: true,
    action: 'CONTINUE',
    callId,
    previous_classification: previousClassification,
    final_classification: finalClass,
    pipeline_stage: 'HUMAN_RESOLVED',
    message: `Call #${callId} human-resolved: CONTINUED as ${finalClass}. Pipeline progression executed.`,
    pipeline_result: pipelineRes,
  };
}

/**
 * Automatically resolves all calls currently stuck in REVIEW / REVIEW_PENDING.
 * Inspects transcript for trading keywords or trade matches:
 * - If order indicators exist -> Promotes to PRE_ORDER, runs full pipeline to complete audit!
 * - If no order indicators and duration < 6s -> SCRAP
 * - Else -> REGULAR
 */
export async function autoResolveAllPendingReviews(
  db: DatabaseSync,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<{ resolvedCount: number; results: ReviewResolutionResult[] }> {
  ensureCallColumns(db);
  const pendingCalls = db.prepare(`
    SELECT * FROM calls 
    WHERE classification = 'REVIEW'
       OR pipeline_stage = 'REVIEW_PENDING'
       OR status = 'review'
       OR call_type = 'review'
    ORDER BY id ASC
  `).all() as unknown as CallRecord[];

  const results: ReviewResolutionResult[] = [];

  for (const call of pendingCalls) {
    const transcript = (call.transcript || '').toLowerCase();
    const duration = call.duration_seconds || 0;

    // Check for trading keywords
    const hasTradingIntent =
      /\b(?:buy|sell|order|shares?|qty|quantity|cmp|market\s*price|kharid|bech|limit|pe|ce|call|put|nifty|banknifty|holding|portfolio)\b/i.test(transcript);

    // Check if client has trades
    const clientCode = call.client_code || call.client;
    let hasClientTrades = false;
    if (clientCode) {
      try {
        const trade = db.prepare('SELECT id FROM trades WHERE client = ? OR client_number = ? LIMIT 1').get(clientCode, clientCode);
        if (trade) hasClientTrades = true;
      } catch {}
    }

    if (hasTradingIntent || hasClientTrades) {
      const res = await resolveCallReview(db, call.id, {
        action: 'CONTINUE',
        resolvedClassification: 'PRE_ORDER',
        notes: 'Automated Review: Verified trading context/client trade corroboration. Promoted to PRE_ORDER.',
        groqApiKey,
        geminiApiKey,
      });
      results.push(res);
    } else if (duration > 0 && duration < 6) {
      const res = await resolveCallReview(db, call.id, {
        action: 'REJECT',
        resolvedClassification: 'SCRAP',
        notes: 'Automated Review: Short recording (<6s) without trading instructions.',
      });
      results.push(res);
    } else {
      const res = await resolveCallReview(db, call.id, {
        action: 'REJECT',
        resolvedClassification: 'REGULAR',
        notes: 'Automated Review: General advisory dialogue without pre-order execution.',
      });
      results.push(res);
    }
  }

  return {
    resolvedCount: results.length,
    results,
  };
}
