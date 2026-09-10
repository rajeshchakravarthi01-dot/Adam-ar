// =============================================================
// Stage 8: SCORING
// The Single Authoritative Scoring Engine.
// Nothing else calculates scores.
//
// Rules:
// Q1 = 1
// Q2 = 1
// Q3 = 1
// Q5 = 1
// MAX = 4
//
// Fatal rules:
// Q1 FAIL -> FATAL -> Score 0
// Q2 FAIL -> FATAL -> Score 0
// Q5 FAIL -> FATAL -> Score 0
// Q3 FAIL -> Score 3 (Non-fatal)
// All PASS -> Score 4
//
// User Mandate Scoring Rules:
// Q1 = 1 (Fatal if fail)
// Q2 = 1 (Fatal if fail)
// Q3 = 1 (Non-fatal, -1 if fail)
// Q4 = 1 (Always PASS, never fail)
// Q5 = 1 (Fatal if fail)
// MAX = 5
//
// All PASS = 5/5
// Q3 FAIL = 4/5
// Q1/Q2/Q5 FAIL = 0/FATAL
// =============================================================

import type { StageAuditResult, StageScoreResult } from './types';

export function stage8CalculateScore(audit: StageAuditResult): StageScoreResult {
  const q1 = audit.q1.status;
  const q2 = audit.q2.status;
  const q3 = audit.q3.status;
  const q5 = audit.q5.status;

  const fatal_reasons: string[] = [];
  const review_reasons: string[] = [];

  // Check Fatal Violations: Q1, Q2, Q5
  if (q1 === 'FAIL') {
    fatal_reasons.push('Q1 Fatal: Calling phone does not match registered phone number.');
  } else if (q1 === 'REVIEW') {
    review_reasons.push('Q1: Telephone authorization requires compliance verification.');
  }

  if (q2 === 'FAIL') {
    fatal_reasons.push('Q2 Fatal: Client UCC not confirmed in dialogue prior to order execution.');
  } else if (q2 === 'REVIEW') {
    review_reasons.push('Q2: Spoken client UCC requires human compliance review.');
  }

  if (q5 === 'FAIL') {
    fatal_reasons.push('Q5 Fatal: Prohibited return, assurance, or profit guarantee was identified.');
  } else if (q5 === 'REVIEW') {
    review_reasons.push('Q5: Potential return guarantee requires compliance officer review.');
  }

  // Non-fatal check: Q3
  if (q3 === 'REVIEW') {
    review_reasons.push('Q3: Stock, quantity, or price/CMP verification requires inspection.');
  }

  const is_fatal = fatal_reasons.length > 0;

  let score = 0;
  let disposition: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW' = 'COMPLIANT';
  let audit_comment = '';

  if (is_fatal) {
    score = 0;
    disposition = 'NON_COMPLIANT';
    audit_comment = `NON-COMPLIANT: Fatal compliance violation (${fatal_reasons.join(' ')}). Authoritative Score: 0/5.`;
  } else {
    // Base 5 points (Q1=1, Q2=1, Q3=1, Q4=1, Q5=1)
    let currentScore = 5;
    if (q3 !== 'PASS') {
      currentScore -= 1; // Q3 non-fatal deduction -> 4
    }
    score = currentScore;

    if (review_reasons.length > 0) {
      disposition = 'NEEDS_REVIEW';
      audit_comment = `NEEDS REVIEW: Pre-order confirmation pending compliance verification (${review_reasons.join(' ')}). Provisional Score: ${score}/5.`;
    } else if (score === 5) {
      disposition = 'COMPLIANT';
      audit_comment = 'COMPLIANT: Pre-order confirmation is strictly compliant with SEBI regulatory norms. Score: 5/5.';
    } else {
      disposition = 'COMPLIANT';
      audit_comment = `COMPLIANT WITH REMARKS: Pre-order confirmed with minor order detail remarks. Score: ${score}/5.`;
    }
  }

  return {
    score,
    max_score: 5,
    is_fatal,
    fatal_reasons,
    review_reasons,
    audit_comment,
    disposition,
  };
}
