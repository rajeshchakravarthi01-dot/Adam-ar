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
 * 1. Missing registered number => ALWAYS REVIEW (Never assume calling == registered).
 * 2. Exact 10-digit match => PASS.
 * 3. Exact mismatch => Check spoken OTP/auth. If none => FAIL (Fatal).
 */
export function evaluateDeterministicQ1(
  callingNumber?: string | null,
  registeredNumber?: string | null,
  transcript?: string | null,
  aiReportedSpokenAuth?: { hasOtp: boolean; evidence?: string }
): Q1EvaluationResult {
  const normCalling = normalizePhoneNumber(callingNumber);
  const normRegistered = normalizePhoneNumber(registeredNumber);

  // 1. Missing registered number in metadata/records => Must be REVIEW
  if (!normRegistered) {
    return {
      status: 'REVIEW',
      evidence: normCalling ? `Calling Number: ${normCalling}, Registered Number: Not Provided` : 'No telephone metadata provided.',
      reason: 'Customer registered phone number is missing from CRM/trade records. Manual authorization verification required.',
      speaker: 'ADVISOR',
      confidence: 0.85,
    };
  }

  // 2. Missing calling number => REVIEW
  if (!normCalling) {
    return {
      status: 'REVIEW',
      evidence: `Registered Number: ${normRegistered}, Calling Number: Unknown`,
      reason: 'Calling telephone number is absent from telephony recording metadata. Manual review required.',
      speaker: 'ADVISOR',
      confidence: 0.85,
    };
  }

  // 3. Exact 10-digit match => Deterministic PASS
  if (normCalling === normRegistered) {
    return {
      status: 'PASS',
      evidence: `Calling Number (${normCalling}) matched Registered / Authorised Number (${normRegistered}).`,
      reason: 'Customer placed order from verified registered contact number.',
      speaker: 'ADVISOR',
      confidence: 1.0,
    };
  }

  // 4. Numbers do not match => Check for spoken OTP / security authorization
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
      confidence: 0.90,
    };
  }

  // Mismatch without spoken authentication => FAIL (FATAL)
  return {
    status: 'FAIL',
    evidence: `Calling Number (${normCalling}) does not match Registered Number (${normRegistered}) and no spoken OTP/security authentication was found.`,
    reason: 'FATAL: Order placed from unregistered contact number without secondary identity authorization.',
    speaker: 'ADVISOR',
    confidence: 1.0,
  };
}
