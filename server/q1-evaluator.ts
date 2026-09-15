// =============================================================
// AuditEQ v17.0.28 — Deterministic Q1 (Calling vs Registered) Evaluator
// =============================================================

import { normalizePhoneNumber } from './normalizer';

export interface Q1EvaluationResult {
  status: 'PASS' | 'FAIL' | 'REVIEW';
  evidence: string;
  reason: string;
  speaker: 'ADVISOR' | 'CLIENT' | 'BOTH';
  confidence: number;
}

// Spoken authentication markers in transcript when numbers differ
const SPOKEN_AUTH_PATTERNS = [
  /\b(?:otp|one time password|security question|date of birth|pan card|mother(?:'s)? maiden name)\b/i,
  /\b(?:authenticated via|verified via otp|verified your identity)\b/i,
];

/**
 * Deterministically evaluates SEBI Q1 Compliance Check.
 * Rule:
 * client number is meta data = client number is trade data = pass or else fail.
 */
export function evaluateDeterministicQ1(
  callingNumber?: string | null,
  registeredNumber?: string | null,
  transcript?: string | null,
  aiReportedSpokenAuth?: { hasOtp: boolean; evidence?: string }
): Q1EvaluationResult {
  const normCalling = normalizePhoneNumber(callingNumber);
  const normRegistered = normalizePhoneNumber(registeredNumber);

  // Exact 10-digit match between calling/metadata number and registered/trade number => PASS
  if (normCalling && normRegistered && normCalling === normRegistered) {
    return {
      status: 'PASS',
      evidence: `Client calling number in metadata (${normCalling}) matches registered client number in trade data (${normRegistered}).`,
      reason: 'Verified match: Customer placed order from verified registered contact number.',
      speaker: 'ADVISOR',
      confidence: 1.0,
    };
  }

  // Secondary authorization: if calling differs but spoken OTP or verified secondary auth is present
  if (normCalling && normRegistered) {
    const text = (transcript || '').toLowerCase();
    let hasSpokenAuth = false;
    let authEvidence = '';

    for (const p of SPOKEN_AUTH_PATTERNS) {
      const match = text.match(p);
      if (match) {
        hasSpokenAuth = true;
        authEvidence = `Spoken security marker identified: "${match[0]}"`;
        break;
      }
    }

    if (aiReportedSpokenAuth?.hasOtp && aiReportedSpokenAuth.evidence) {
      hasSpokenAuth = true;
      authEvidence = aiReportedSpokenAuth.evidence;
    }

    if (hasSpokenAuth) {
      return {
        status: 'PASS',
        evidence: `Calling number (${normCalling}) differs from registered (${normRegistered}), but customer identity was authenticated (${authEvidence}).`,
        reason: 'Authorized via spoken OTP / security identity verification on call.',
        speaker: 'BOTH',
        confidence: 0.95,
      };
    }
  }

  // If registered number cannot be established from authoritative source -> REVIEW/UNVERIFIED
  if (!normRegistered) {
    return {
      status: 'REVIEW',
      evidence: `Calling number is ${normCalling || 'Missing'}, but registered contact number was not found in trade or client master data.`,
      reason: 'Registered phone number cannot be established from authoritative records; verification requires review.',
      speaker: 'ADVISOR',
      confidence: 0.8,
    };
  }

  // Mismatch or missing calling number => FAIL (FATAL)
  return {
    status: 'FAIL',
    evidence: `Calling number in metadata (${normCalling || 'Missing'}) does NOT match registered number in trade data (${normRegistered}).`,
    reason: 'FATAL: Client phone number in metadata does not match client phone number in trade data.',
    speaker: 'ADVISOR',
    confidence: 1.0,
  };
}
