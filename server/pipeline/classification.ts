// =============================================================
// Stage 4: CALL INTENT CLASSIFICATION (Authoritative Semantic Engine)
// Classifies call into:
// PRE_ORDER | REGULAR | SCRAP | REVIEW
//
// Core Mandates:
// 1. Scrap Call:
//    - All calls < 6s duration are SCRAP.
//    - Calls >= 6s duration are NOT SCRAP by duration alone (eligible for transcription).
//    - Silent, empty, or automated voicemail/carrier disconnects are SCRAP.
// 2. Pre-Order Call:
//    - The core question: Was an actionable order instruction given for immediate execution?
//    - DO NOT use trade existence as proof of PRE_ORDER.
//    - DO NOT classify based on words like BUY/SELL alone.
// 3. Regular Call:
//    - Market discussion, portfolio inquiry, advice without immediate order directive is REGULAR.
//    - Regular calls are safely finalized and NEVER audited.
// 4. Review Call:
//    - Ambiguous, disputable, or cut-off order intent is REVIEW.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type {
  ClassificationResult,
  ClassificationEvidence,
  TranscriptSegment,
  CallClassification,
} from './types';
import type { CallRecord } from '../../src/types';
import {
  detectScrapCall,
  classifyCallIntent,
  classifyCallIntentWithAI,
  validateEvidenceInTranscript,
  type PreOrderClassificationResult,
} from '../classifier';

/**
 * Stage 4 Entry Point: Call Intent Classification
 */
export async function stage4ClassifyCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string,
  geminiApiKey?: string
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

  // 1. SCRAP Detection (Strictly before any AI or complex processing)
  const scrapCheck = detectScrapCall(transcript, durationSeconds);
  if (scrapCheck) {
    const scrapResult: ClassificationResult = {
      classification: 'SCRAP',
      confidence: scrapCheck.confidence,
      evidence: [],
      reason: scrapCheck.reason,
      scrap_reason: scrapCheck.evidence,
      model: scrapCheck.model_used || 'scrap-filter',
    };
    persistClassification(db, callId, scrapResult);
    return scrapResult;
  }

  // 2. Semantic Intent Classification
  // Pure hearing evaluation of what was actually spoken in the call.
  // CRITICAL: Trade data is NOT used here. Intent must be independently verified from speech.
  const activeGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  let aiResult: PreOrderClassificationResult;

  if (activeGeminiKey || groqApiKey) {
    try {
      aiResult = await classifyCallIntentWithAI(
        transcript,
        durationSeconds,
        groqApiKey,
        activeGeminiKey
      );
    } catch {
      aiResult = classifyCallIntent(transcript, durationSeconds);
    }
  } else {
    aiResult = classifyCallIntent(transcript, durationSeconds);
  }

  // 3. Map to Stage Classification Types
  // Stage 4 establishes call classification directly from spoken dialogue.
  // When order intent is spoken, the call IS a PRE_ORDER call.
  let stageClassification: CallClassification = 'REGULAR';
  if (aiResult.call_type === 'pre_order') {
    stageClassification = 'PRE_ORDER';
  } else if (aiResult.call_type === 'scrap') {
    stageClassification = 'SCRAP';
  } else if (aiResult.call_type === 'review') {
    stageClassification = 'REVIEW';
  } else {
    stageClassification = 'REGULAR';
  }

  // 4. Evidence Validation: Strict verification against transcript segments
  const validEv = validateEvidenceInTranscript(aiResult.evidence, transcript);
  const matchedSegment = segments.find((s) =>
    s.text.toLowerCase().includes(validEv.normalizedEvidence.slice(0, 30).toLowerCase())
  );

  const evidenceList: ClassificationEvidence[] = [];
  let classificationReason = aiResult.reason;

  if (aiResult.evidence && validEv.isValid && matchedSegment) {
    evidenceList.push({
      segment_id: matchedSegment.segment_id,
      start: matchedSegment.start_time,
      end: matchedSegment.end_time,
      speaker: (aiResult.evidence_speaker === 'CLIENT' || aiResult.evidence_speaker === 'ADVISOR')
        ? aiResult.evidence_speaker
        : 'ADVISOR',
      text: aiResult.evidence,
    });
  } else if (stageClassification === 'PRE_ORDER' && (!validEv.isValid || !matchedSegment)) {
    // If order intent was claimed but cannot be found in verbatim transcript segments, route to REVIEW
    stageClassification = 'REVIEW';
    classificationReason = 'Order intent evidence text could not be verified in audio segments; routed to compliance REVIEW.';
  }

  const result: ClassificationResult = {
    classification: stageClassification,
    confidence: stageClassification === 'REVIEW' ? 0.7 : aiResult.confidence,
    evidence: evidenceList,
    reason: classificationReason,
    model: aiResult.model_used || 'authoritative-intent-classifier',
  };

  persistClassification(db, callId, result);
  return result;
}

function persistClassification(
  db: DatabaseSync,
  callId: number,
  res: ClassificationResult
): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const primaryEvidence = res.evidence[0];

  try {
    db.prepare(`
      UPDATE calls SET
        classification = ?,
        classification_confidence = ?,
        classification_evidence = ?,
        preorder_confidence = ?,
        preorder_evidence = ?,
        preorder_speaker = ?,
        preorder_timestamp = ?,
        scrap_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      res.classification,
      res.confidence,
      primaryEvidence?.text || res.reason,
      res.confidence,
      primaryEvidence?.text || res.reason,
      primaryEvidence?.speaker || null,
      primaryEvidence ? `${primaryEvidence.start}s` : null,
      res.scrap_reason || null,
      now,
      callId
    );
  } catch (err: any) {
    if (err.message && err.message.includes('no such column')) {
      db.prepare(`
        UPDATE calls SET
          classification = ?,
          preorder_confidence = ?,
          preorder_evidence = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        res.classification,
        res.confidence,
        primaryEvidence?.text || res.reason,
        now,
        callId
      );
    } else {
      throw err;
    }
  }
}
