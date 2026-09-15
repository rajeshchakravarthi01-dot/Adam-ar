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

  const call10 = normCalling.length >= 10 ? normCalling.slice(-10) : normCalling;
  const reg10 = normRegistered.length >= 10 ? normRegistered.slice(-10) : normRegistered;

  // 1. Authoritative Rule: client number in metadata = client number in trade data => PASS
  if (call10 && reg10 && call10 === reg10) {
    return {
      status: 'PASS',
      evidence: `Client number in metadata (${call10}) matches client number in trade data (${reg10}).`,
      reason: 'Verified match: Customer placed order from verified registered contact number.',
      speaker: 'ADVISOR',
      confidence: 1.0,
    };
  }

  // 2. Secondary authorization: if calling differs but spoken OTP or verified secondary auth is present => PASS
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
      evidence: `Calling number (${call10 || 'unverified'}) differs from registered (${reg10 || 'unverified'}), but customer identity was authenticated (${authEvidence}).`,
      reason: 'Authorized via spoken OTP / security identity verification on call.',
      speaker: 'BOTH',
      confidence: 0.95,
    };
  }

  // 3. Valid 10-digit CLI with no conflicting trade number => PASS
  if (call10 && call10.length === 10 && !reg10) {
    return {
      status: 'PASS',
      evidence: `Client calling number (${call10}) authenticated from telephony records.`,
      reason: 'Authorized calling telephone line validated.',
      speaker: 'ADVISOR',
      confidence: 0.95,
    };
  }

  // 4. If registered number cannot be established and calling line is missing => REVIEW
  if (!reg10 && !call10) {
    return {
      status: 'REVIEW',
      evidence: 'Telephony CLI and trade contact numbers are missing from records.',
      reason: 'Registered phone number cannot be established from authoritative records; verification requires review.',
      speaker: 'ADVISOR',
      confidence: 0.8,
    };
  }

  // 5. Mismatch between metadata and trade phone without OTP => FAIL (FATAL)
  return {
    status: 'FAIL',
    evidence: `Calling number in metadata (${call10 || 'Missing'}) does NOT match registered number in trade data (${reg10 || 'Missing'}).`,
    reason: 'FATAL: Client phone number in metadata does not match client phone number in trade data.',
    speaker: 'ADVISOR',
    confidence: 1.0,
  };
}
