// =========================================================================
// AuditEQ — Comprehensive Pipeline Accuracy & Regression Test Suite
// Verifies Sarvam AI transcription defaults, GPT-OSS audit defaults,
// 9-Stage pipeline accuracy, SEBI gating rules, and advisor routing.
// =========================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SARVAM_KEY } from '../server/pipeline/transcription';
import { DEFAULT_AUDIT_KEY, stage7AuditCall, evaluateDeterministicQ1 } from '../server/pipeline/audit';
import { stage4ClassifyCall } from '../server/pipeline/classification';
import { isAuditEligible } from '../server/pipeline/eligibility';
import { stage8CalculateScore } from '../server/pipeline/scoring';
import {
  normalizeCanonicalPhone,
  matchClientCodeFuzzy,
  normalizeCanonicalClientCode,
} from '../server/pipeline/matching';
import {
  matchPriceInTranscript,
  matchQuantityInTranscript,
  mentionsMarketPriceOrCMP,
} from '../server/normalizer';
import { determineComplianceRouting, renderScorecardEmailHtml } from '../server/email-service';
import type { StageAuditResult } from '../server/pipeline/types';

console.log('--- Running AuditEQ Pipeline Accuracy Suite ---');

// 1. Verify Default Provider Keys (Sarvam AI + GPT-OSS)
console.log('1. Checking default provider credentials...');
assert.strictEqual(
  DEFAULT_SARVAM_KEY,
  'sk_bl18l2w6_EJeAwkIjgIINAy9hwaVVSA5A',
  'DEFAULT_SARVAM_KEY must be pre-configured with user Sarvam key'
);
assert.strictEqual(
  DEFAULT_AUDIT_KEY,
  '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',
  'DEFAULT_AUDIT_KEY must be pre-configured with user GPT-OSS key'
);

// 2. Q1 Deterministic Phone Matching (10-Digit & 91 Prefix Handling)
console.log('2. Testing Q1 deterministic phone matching & 91 stripping...');
assert.strictEqual(normalizeCanonicalPhone('919904706239'), '9904706239', '12-digit phone must strip 91 prefix');
assert.strictEqual(normalizeCanonicalPhone('+91 9904706239'), '9904706239', 'Formatted phone must normalize to 10 digits');
assert.strictEqual(normalizeCanonicalPhone('9904706239'), '9904706239', '10-digit phone must normalize cleanly');

const q1DirectMatch = evaluateDeterministicQ1('919904706239', '9904706239');
assert.strictEqual(q1DirectMatch.status, 'PASS', 'Normalized identical phone numbers must PASS Q1 deterministically');

const q1Mismatch = evaluateDeterministicQ1('9822211111', '9833322222', 'Hello, please place my order directly.');
assert.strictEqual(q1Mismatch.status, 'FAIL', 'Mismatched phone numbers without OTP must FAIL Q1');

const q1OtpRecovery = evaluateDeterministicQ1('9822211111', '9833322222', 'Calling from alternate mobile, spoken OTP is 5421.');
assert.strictEqual(q1OtpRecovery.status, 'PASS', 'Mismatched phone with spoken OTP must PASS Q1');

// 3. Q2 Client Code Fuzzy / Phonetic Tolerance
console.log('3. Testing Q2 client code speech tolerance (~90% phonetic match)...');
assert.strictEqual(normalizeCanonicalClientCode('WIA-18143'), 'WIA18143', 'Punctuation must be stripped from UCC');
const fuzzyUcc = matchClientCodeFuzzy('WAS9767', 'WAA9767');
assert.strictEqual(fuzzyUcc.matched, true, 'WAS 9767 speech error must match WAA9767 with high similarity');
assert.ok(fuzzyUcc.similarity >= 0.8, 'Similarity score must be >= 0.8');

// 4. Q3 3-Point Check (Stock, Price/CMP, Quantity)
console.log('4. Testing Q3 3-point check (Stock, Price/CMP, Quantity)...');
assert.strictEqual(mentionsMarketPriceOrCMP('order at market price pe execute karna'), true, 'CMP colloquial Hindi phrase must match');
assert.strictEqual(mentionsMarketPriceOrCMP('execute at live rate'), true, 'Live rate must match CMP');
assert.strictEqual(matchQuantityInTranscript(25, 'order 25 shares of INFY'), true, 'Numeric quantity token must match');
assert.strictEqual(matchPriceInTranscript(1850, 'at 1850 rupees per share'), true, 'Numeric price token must match');

// 5. In-Memory Database Pipeline Tests
console.log('5. Setting up SQLite test environment for Stage 4-8 testing...');
const testDb = new DatabaseSync(':memory:');
testDb.exec(`
  CREATE TABLE calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_filename TEXT,
    audio_path TEXT,
    duration_seconds REAL,
    transcript TEXT,
    transcript_status TEXT DEFAULT 'COMPLETED',
    classification TEXT DEFAULT 'PENDING',
    classification_confidence REAL DEFAULT 0,
    classification_evidence TEXT,
    call_type TEXT,
    preorder_confidence REAL,
    preorder_evidence TEXT,
    preorder_speaker TEXT,
    preorder_timestamp TEXT,
    confidence REAL DEFAULT 0,
    classification_reason TEXT,
    scrap_reason TEXT,
    status TEXT DEFAULT 'pending',
    call_date TEXT,
    created_at TEXT,
    updated_at TEXT,
    phone_number TEXT,
    calling_number TEXT,
    registered_number TEXT,
    client_number TEXT,
    ucc TEXT,
    identity_status TEXT DEFAULT 'CONFIRMED',
    matched_trade_id INTEGER,
    trade_match_status TEXT DEFAULT 'NONE',
    audit_status TEXT DEFAULT 'PENDING',
    processing_status TEXT DEFAULT 'IDLE',
    failure_reason TEXT
  );

  CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT,
    trade_date TEXT,
    trade_time TEXT,
    ucc TEXT,
    client TEXT,
    client_code TEXT,
    client_name TEXT,
    client_number TEXT,
    phone_number TEXT,
    contact_no TEXT,
    symbol TEXT,
    quantity INTEGER,
    price REAL,
    side TEXT,
    matched_call_id INTEGER
  );

  CREATE TABLE call_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER,
    segment_id INTEGER,
    start_time REAL,
    end_time REAL,
    speaker TEXT,
    text TEXT,
    language TEXT,
    created_at TEXT
  );
`);

// Test A: Client WIA81138 -> Must classify as REGULAR and gate from SEBI audit
console.log('5A. Testing Client WIA81138 (Inquiry) -> REGULAR classification & audit gating...');
testDb.prepare(`
  INSERT INTO calls (id, duration_seconds, transcript, call_date, calling_number, ucc, client_number, status)
  VALUES (101, 75, 'Namaskar, I am calling from FundsIndia to discuss your monthly statement for account WIA81138. No trades today, just account balance query.', '2026-09-01', '9811181138', 'WIA81138', '9811181138', 'pending')
`).run();

const class101 = await stage4ClassifyCall(testDb, 101);
assert.strictEqual(class101.classification, 'REGULAR', 'Client WIA81138 inquiry must classify as REGULAR');
const gate101 = isAuditEligible(testDb, 101);
assert.strictEqual(gate101.eligible, false, 'Client WIA81138 REGULAR call must be gated from Stage 7 audit');
assert.strictEqual(gate101.gateCode, 'NOT_PRE_ORDER', 'Gate code must indicate NOT_PRE_ORDER');

// Test B: Client WIA18143 -> Must classify as PRE_ORDER and pass SEBI audit
console.log('5B. Testing Client WIA18143 (Order Execution) -> PRE_ORDER & Stage 7 SEBI Audit...');
testDb.prepare(`
  INSERT INTO trades (id, order_no, trade_date, ucc, client_code, client_number, phone_number, symbol, quantity, price, side)
  VALUES (201, 'ORD201', '2026-09-01', 'WIA18143', 'WIA18143', '9822218143', '9822218143', 'INFY', 25, 1850, 'BUY')
`).run();

testDb.prepare(`
  INSERT INTO calls (id, duration_seconds, transcript, call_date, calling_number, registered_number, ucc, client_number, status, matched_trade_id, trade_match_status)
  VALUES (102, 60, 'ADVISOR: Good morning client WIA18143. Confirming your pre-order for 25 shares of INFY at market CMP.\nCLIENT: Haan, confirm kar dijiye buy.', '2026-09-01', '9822218143', '9822218143', 'WIA18143', '9822218143', 'matched', 201, 'CONFIRMED')
`).run();

testDb.prepare(`
  INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
  VALUES (102, 1, 0, 4.5, 'ADVISOR', 'Good morning client WIA18143. Confirming your pre-order for 25 shares of INFY at market CMP.', 'en', '2026-09-01 10:00:00')
`).run();

testDb.prepare(`
  INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
  VALUES (102, 2, 4.5, 7.0, 'CLIENT', 'Haan, confirm kar dijiye buy.', 'hi', '2026-09-01 10:00:05')
`).run();

const class102 = await stage4ClassifyCall(testDb, 102);
assert.strictEqual(class102.classification, 'PRE_ORDER', 'Client WIA18143 order call must classify as PRE_ORDER');
const gate102 = isAuditEligible(testDb, 102);
assert.strictEqual(gate102.eligible, true, 'Client WIA18143 PRE_ORDER call must pass audit eligibility gate');

const audit102 = await stage7AuditCall(testDb, 102);
assert.strictEqual(audit102.q1.status, 'PASS', 'Q1 must PASS on 10-digit phone match');
assert.strictEqual(audit102.q2.status, 'PASS', 'Q2 must PASS on client code WIA18143 confirmation');
assert.strictEqual(audit102.q3.status, 'PASS', 'Q3 must PASS on Stock, CMP price, and Quantity 25');
assert.strictEqual(audit102.q4.status, 'PASS', 'Q4 customer acknowledgment must PASS');
assert.strictEqual(audit102.q5.status, 'PASS', 'Q5 must PASS as no prohibited guarantee was made');

// 6. Stage 8 Scoring Engine Verification
console.log('6. Testing Stage 8 scoring engine...');
const score102 = stage8CalculateScore(audit102);
assert.strictEqual(score102.score, 5, 'All-passing audit must receive maximum score 5');
assert.strictEqual(score102.max_score, 5, 'Max score must be 5');
assert.strictEqual(score102.is_fatal, false, 'Passing audit must not be fatal');
assert.strictEqual(score102.disposition, 'COMPLIANT', 'Passing audit disposition must be COMPLIANT');

// Test Fatal Disposition on Mismatched Q1
const fatalAudit: StageAuditResult = {
  ...audit102,
  q1: {
    status: 'FAIL',
    flag: 'FATAL',
    evidence: 'Mismatched telephone without OTP',
    reason: 'Unregistered telephone',
    confidence: 1.0,
    evidence_verified: true,
  },
};
const fatalScore = stage8CalculateScore(fatalAudit);
assert.strictEqual(fatalScore.score, 0, 'Fatal flag must collapse score to 0');
assert.strictEqual(fatalScore.is_fatal, true, 'is_fatal flag must be true');
assert.strictEqual(fatalScore.disposition, 'NON_COMPLIANT', 'Fatal failure disposition must be NON_COMPLIANT');

// 7. Email Notification Generator & Compliance Routing
console.log('7. Testing advisor email notification generation & compliance routing...');
const mockScorecard = {
  id: 1,
  call_id: 102,
  order_no: 'ORD201',
  client: 'WIA18143',
  client_code: 'WIA18143',
  stock: 'INFY',
  score: 5.0,
  max_score: 5.0,
  is_fatal: false,
  disposition: 'COMPLIANT' as const,
  q1_status: audit102.q1.status,
  q2_status: audit102.q2.status,
  q3_status: audit102.q3.status,
  q3_evidence: audit102.q3.evidence,
  q4_status: audit102.q4.status,
  q5_status: audit102.q5.status,
  advisor_name: 'Adarsh',
  advisor_email: 'adarsh@fundsindia.com',
  created_at: '2026-09-01T10:00:00Z',
};

const routing = determineComplianceRouting({
  scorecards: [mockScorecard as any],
  advisorName: 'Adarsh',
});

assert.ok(routing.to, 'Routing must determine a recipient email');
assert.strictEqual(routing.isFatalAlone, false, 'Non-fatal scorecard must not be classified as fatal alone');

const emailHtml = renderScorecardEmailHtml([mockScorecard as any], 'Adarsh');
assert.ok(emailHtml.includes('INFY'), 'Rendered HTML must include stock symbol INFY');
assert.ok(emailHtml.includes('WIA18143'), 'Rendered HTML must include client code WIA18143');
assert.ok(emailHtml.includes('Regulatory Norm') || emailHtml.includes('Pre Order Confirmation'), 'Rendered HTML must include regulatory audit comment');

console.log('✅ ALL PIPELINE ACCURACY & REGRESSION SUITE CHECKS PASSED!');
