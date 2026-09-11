// =============================================================
// AuditEQ v17.0.28 — Golden Verification Test Suite
// =============================================================

import assert from 'node:assert';
import {
  normalizePhoneNumber,
  normalizeClientCode,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
} from '../server/normalizer';
import {
  scoreTradeCandidates,
  evaluateMatchingDecision,
} from '../server/matcher';
import { evaluateDeterministicQ1 } from '../server/q1-evaluator';
import { classifyCallIntent } from '../server/classifier';
import { ManualReviewSchema } from '../server/validation';
import { computeSHA256, verifyArchiveIntegrity } from '../server/archive-service';
import { renderScorecardEmailHtml } from '../server/email-service';
import type { CallRecord, TradeRecord, ScorecardRecord } from '../src/types';

console.log('--- Starting AuditEQ v17.0.28 Golden Test Suite ---');

// 1. Normalization & Speech Matching
console.log('Testing Normalization & Speech Tolerance...');
assert.strictEqual(normalizeClientCode('W I A 46884'), 'WIA46884');
assert.strictEqual(normalizeClientCode('WIA-46884'), 'WIA46884');
assert.strictEqual(normalizeClientCode('WIA 46884'), 'WIA46884');
assert.strictEqual(normalizeClientCode('wia46884'), 'WIA46884');
assert.strictEqual(normalizePhoneNumber('+91 98765 43210'), '9876543210');
assert.strictEqual(normalizePhoneNumber('09876543210'), '9876543210');

const clientTranscriptMatch = matchClientCodeInTranscript('WIA46884', 'Good morning, confirming account W I A 4 6 8 8 4 for your order.');
assert.strictEqual(clientTranscriptMatch.matched, true, 'Spoken client code should match');

// 2. Symbol Aliases & Word Boundaries
console.log('Testing Symbol Alias Matching & Boundary Protection...');
assert.strictEqual(matchSymbolInTranscript('RELIANCE', 'Please buy RIL shares').matched, true);
assert.strictEqual(matchSymbolInTranscript('RELIANCE', 'Buy Reliance Industries today').matched, true);
assert.strictEqual(matchSymbolInTranscript('TCS', 'Please purchase Tata Consultancy Services').matched, true);
assert.strictEqual(matchSymbolInTranscript('INFY', 'Order 50 Infosys shares').matched, true);
assert.strictEqual(matchSymbolInTranscript('LT', 'Do not melt the copper').matched, false, 'LT should not match "melt"');

// 3. Price & Quantity Tokenization (Anti-Collision)
console.log('Testing Numeric Tokenization & Substring Anti-Collision...');
assert.strictEqual(matchPriceInTranscript(2450, 'The market price is ₹2,450.00 right now'), true);
assert.strictEqual(matchPriceInTranscript(2450, 'The price is 24500 rupees'), false, '2450 must NOT match 24500');
assert.strictEqual(matchQuantityInTranscript(100, 'Please place 100 shares limit order'), true);
assert.strictEqual(matchQuantityInTranscript(100, 'I want to sell 1000 shares'), false, '100 must NOT match 1000');

// 4. SEBI 5-Anchor Matching Engine & Margin Threshold
console.log('Testing Matching Confidence & Margin Threshold Policy...');
const sampleCall: CallRecord = {
  id: 1,
  external_id: 'call_1',
  recording_name: 'test_call.mp3',
  client: 'WIA46884',
  calling_number: '9876543210',
  transcript: 'Hello, this is client WIA46884. Buy 100 shares of Reliance at 2450.',
  source: 'upload',
  status: 'transcribed',
  created_at: '2026-08-31',
  updated_at: '2026-08-31',
  call_date: '2026-08-31',
};

const highMatchTrade: TradeRecord = {
  id: 101,
  external_id: 'trade_101',
  client: 'WIA46884',
  client_number: '9876543210',
  symbol: 'RELIANCE',
  quantity: 100,
  price: 2450,
  trade_date: '2026-08-31',
  created_at: '2026-08-31',
};

const candidateScored = scoreTradeCandidates(sampleCall, [highMatchTrade]);
const decision = evaluateMatchingDecision(candidateScored);
assert.strictEqual(decision.matchStatus, 'matched');
assert.strictEqual(decision.verificationStatus, 'confirmed');
assert.strictEqual(decision.confidence >= 0.80, true);

// Ambiguous Candidate Check (Margin < 0.15)
const ambiguousDecision = evaluateMatchingDecision([
  { trade: { ...highMatchTrade, id: 1 }, score: 0.75, reasons: ['Trade A'] },
  { trade: { ...highMatchTrade, id: 2 }, score: 0.73, reasons: ['Trade B'] },
]);
assert.strictEqual(ambiguousDecision.matchStatus, 'review', 'Small margin candidate must require review');
assert.strictEqual(ambiguousDecision.verificationStatus, 'pending_review');

// 5. Deterministic Q1 Compliance Evaluator
console.log('Testing Deterministic Q1 Compliance...');
const q1Missing = evaluateDeterministicQ1('9876543210', null, 'Hello buy shares');
assert.strictEqual(q1Missing.status, 'REVIEW', 'Missing registered number must yield REVIEW, never PASS');

const q1Exact = evaluateDeterministicQ1('9876543210', '9876543210', 'Hello buy shares');
assert.strictEqual(q1Exact.status, 'PASS', 'Exact matching numbers must PASS');

const q1MismatchNoAuth = evaluateDeterministicQ1('9876543210', '9876540000', 'Hello buy shares');
assert.strictEqual(q1MismatchNoAuth.status, 'FAIL', 'Mismatched unverified numbers must FAIL (Fatal)');

const q1MismatchWithOtp = evaluateDeterministicQ1('9876543210', '9876540000', 'Identity verified via OTP 482910.');
assert.strictEqual(q1MismatchWithOtp.status, 'PASS', 'Mismatched numbers with spoken OTP must PASS');

// 6. Pre-Order Intent Classifier
console.log('Testing Intent Classification...');
const preOrderClassification = classifyCallIntent('Hello advisor, please place a buy order for 50 shares of TCS at market price.');
assert.strictEqual(preOrderClassification.call_type, 'pre_order');

const regularClassification = classifyCallIntent('Hi, I am calling to discuss market view on Nifty and I need the contract note and ledger statement.');
assert.strictEqual(regularClassification.call_type, 'regular');

const scrapShortDuration = classifyCallIntent('Hello, can you hear me?', 4);
assert.strictEqual(scrapShortDuration.call_type, 'scrap');

const scrapVoicemail = classifyCallIntent('Please leave a message after the tone. The subscriber is currently unavailable.');
assert.strictEqual(scrapVoicemail.call_type, 'scrap');

// 7. Zod Validation & Schema Guard
console.log('Testing Zod Manual Review Validation...');
const validReview = ManualReviewSchema.safeParse({
  q1: 'PASS',
  q2: 'FAIL',
  review_reason: 'Audited by Compliance Lead',
});
assert.strictEqual(validReview.success, true);

const invalidReview = ManualReviewSchema.safeParse({
  q1: 'BANANA', // Invalid status
});
assert.strictEqual(invalidReview.success, false, 'Invalid status string BANANA must be rejected');

// 8. Cryptographic Archive Verification
console.log('Testing Cryptographic Manifest Archiving...');
const sampleManifest = {
  archive_id: 'ARCHIVE_TEST_01',
  label: 'Test Period',
  archived_at: '2026-08-31 12:00:00',
  application_version: '17.0.28',
  rubric_version: '4.3',
  counts: { calls: 1, trades: 1, matches: 1, audits: 1, scorecards: 1 },
  records: { calls: [], trades: [], matches: [], audits: [], scorecards: [] },
};
const sha = computeSHA256(JSON.stringify(sampleManifest));
assert.strictEqual(verifyArchiveIntegrity(sampleManifest, sha), true);

// 9. Email HTML Rendering
console.log('Testing Email Template Generation...');
const sampleScorecard: ScorecardRecord = {
  id: 1,
  audit_id: 1,
  call_id: 1,
  caller_name: 'Rohit Sharma',
  team: 'Wealth Advisors',
  client: 'WIA46884',
  trade_phone: '9876543210',
  calling_number: '9876543210',
  registered_number: '9876543210',
  trade_date: '2026-08-31',
  call_date: '2026-08-31',
  score: 5,
  is_fatal: false,
  fatal_reasons: '',
  q1_status: 'PASS',
  q1_evidence: 'Numbers matched',
  q2_status: 'PASS',
  q2_evidence: 'Client code confirmed',
  q3_status: 'PASS',
  q3_evidence: 'Stock price qty confirmed',
  q4_status: 'PASS',
  q4_evidence: 'Client acknowledged',
  q5_status: 'PASS',
  q5_evidence: 'No return commitment',
  audit_comment: 'Compliant',
  created_at: '2026-08-31',
};
const html = renderScorecardEmailHtml([sampleScorecard], 'Rohit Sharma');
assert.strictEqual(html.includes('AuditEQ Quality & Compliance Intelligence'), true);
assert.strictEqual(html.includes('Rohit Sharma'), true);
assert.strictEqual(html.includes('WIA46884'), true);

console.log('✅ ALL GOLDEN VERIFICATION TESTS PASSED SUCCESSFULLY!');
