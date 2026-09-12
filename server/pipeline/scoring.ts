// =============================================================
// Stage 8: SCORING
// Unified with Single Authoritative Scoring Engine (scoring-engine.ts)
//
// Scoring Rules (5 Max Points):
// Q1 = Fatal if fail -> Score 0/5
// Q2 = Fatal if fail -> Score 0/5
// Q3 = Non-fatal, 1 point (-1 deduction if fail)
// Q4 = Not audited. Always PASS.
// Q5 = Fatal only when an actual guarantee is made -> Score 0/5
// MAX = 5
// =============================================================

import type { StageAuditResult, StageScoreResult } from './types';
import { calculateAuthoritativeScore } from '../scoring-engine';

export function stage8CalculateScore(audit: StageAuditResult): StageScoreResult {
  const authScore = calculateAuthoritativeScore({
    q1: { status: audit.q1.status },
    q2: { status: audit.q2.status },
    q3: { status: audit.q3.status },
    q4: { status: 'PASS' },
    q5: { status: audit.q5?.status || 'PASS' },
  });

  return {
    score: authScore.finalScore,
    max_score: 5,
    is_fatal: authScore.isFatal,
    fatal_reasons: authScore.fatal_reasons,
    review_reasons: authScore.review_reasons,
    audit_comment: authScore.audit_comment,
    disposition: authScore.disposition,
  };
}
