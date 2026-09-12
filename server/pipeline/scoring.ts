// =============================================================
// Stage 8: SCORING
// Unified with Single Authoritative Scoring Engine (scoring-engine.ts)
//
// Scoring Rules (5 Max Points):
// Q1 = 1 (Fatal if fail -> Score 0/5)
// Q2 = 1 (Fatal if fail -> Score 0/5)
// Q3 = 1 (Non-fatal, -1 deduction if fail)
// Q4 = 1 (Evaluated customer verbal consent, -1 deduction if fail)
// Q5 = 1 (Fatal if fail -> Score 0/5, Return Commitment Prohibition)
// MAX = 5
//
// All PASS = 5/5
// Q3 or Q4 non-pass = 4/5 or 3/5
// Q1, Q2, or Q5 FAIL = 0/5 (FATAL)
// =============================================================

import type { StageAuditResult, StageScoreResult } from './types';
import { calculateAuthoritativeScore } from '../scoring-engine';

export function stage8CalculateScore(audit: StageAuditResult): StageScoreResult {
  const authScore = calculateAuthoritativeScore({
    q1: { status: audit.q1.status },
    q2: { status: audit.q2.status },
    q3: { status: audit.q3.status },
    q4: { status: audit.q4?.status || 'FAIL' },
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
