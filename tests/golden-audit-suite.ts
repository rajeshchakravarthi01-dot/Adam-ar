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
import { evaluateDeterministicQ1 } from '../server/pipeline/audit';
import { classifyCallIntent, stage4ClassifyCall } from '../server/pipeline/classification';
import { isAuditEligible } from '../server/pipeline/eligibility';
import { detectSegmentLanguage, cleanTranscribedText } from '../server/pipeline/transcription';
import { DatabaseSync } from 'node:sqlite';
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

// 10. Regression Test 9: Call with no matching trade row (wrong date) must NOT classify as PRE_ORDER and must never reach Stage 7
console.log('Testing Regression Test 9: Wrong call date must not classify as PRE_ORDER or reach Stage 7...');
{
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

  // Insert trade executed on 2026-08-31
  testDb.prepare(`
    INSERT INTO trades (id, order_no, trade_date, ucc, client_code, client_number, symbol, quantity, price, side)
    VALUES (101, 'ORD101', '2026-08-31', 'WIA999', 'WIA999', '9876543210', 'TCS', 50, 3500, 'BUY')
  `).run();

  // Insert call from client WIA999 / 9876543210 but with call date 2026-08-25 (mismatched date)
  testDb.prepare(`
    INSERT INTO calls (id, duration_seconds, transcript, call_date, calling_number, ucc, client_number, status)
    VALUES (1, 45, 'Hello, I want to discuss my account and general queries.', '2026-08-25', '9876543210', 'WIA999', 'WIA999', 'pending')
  `).run();

  // Stage 4 Classification
  const result = await stage4ClassifyCall(testDb, 1);
  assert.notStrictEqual(
    result.classification,
    'PRE_ORDER',
    'Call with mismatched trade date must NOT be classified as PRE_ORDER'
  );
  assert.strictEqual(
    result.classification,
    'REGULAR',
    'Call with no matching trade on call date must be classified as REGULAR'
  );

  // Stage 6 Eligibility gate
  const eligibility = isAuditEligible(testDb, 1);
  assert.strictEqual(
    eligibility.eligible,
    false,
    'Non-PRE_ORDER call must fail audit eligibility gate'
  );
  assert.ok(
    eligibility.reason.includes('REGULAR') || eligibility.reason.includes('PRE_ORDER'),
    'Rejection reason must indicate non-PRE_ORDER status'
  );
}

// 11. Regression Test 10: Call with Tamil/Telugu dialogue and code-switching must transcribe with non-empty text, not fall back to Arabic script hallucination or throw
console.log('Testing Regression Test 10: Multilingual Indian speech & Arabic script sanitization...');
{
  const tamilDialogue = 'வணக்கம் சார், TCS 50 shares market price-la buy pannidunga. Romba nalla rate.';
  const teluguDialogue = 'నమస్కారం, Reliance 100 shares current market price lo buy cheyyandi. Sare andi.';
  const codeSwitchedHindiEnglish = 'Haan sir, buy 50 shares of Tata Motors at CMP, theek hai kar dijiye.';

  assert.strictEqual(detectSegmentLanguage(tamilDialogue), 'ta', 'Tamil speech detected as ta');
  assert.strictEqual(detectSegmentLanguage(teluguDialogue), 'te', 'Telugu speech detected as te');
  assert.strictEqual(detectSegmentLanguage(codeSwitchedHindiEnglish), 'hi', 'Hindi speech detected as hi');

  // Arabic script hallucination sanitization
  const hallucinatedArabicWithTamil = 'வணக்கம் சார் \u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645 buy 50 shares at CMP';
  const cleaned = cleanTranscribedText(hallucinatedArabicWithTamil);
  assert.strictEqual(cleaned.includes('\u0627\u0644\u0633\u0644\u0627\u0645'), false, 'Hallucinated Arabic script must be stripped');
  assert.strictEqual(cleaned.includes('வணக்கம் சார்'), true, 'Tamil text must be preserved');
  assert.strictEqual(cleaned.includes('buy 50 shares at CMP'), true, 'English text must be preserved');
  assert.ok(cleaned.length > 0, 'Cleaned text must be non-empty');
}

// 12. Regression Test 11: Client WIA81138 must be classified as REGULAR and gated from audit
console.log('Testing Regression Test 11: Client WIA81138 -> REGULAR (Inquiry / Non-trade)...');
{
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

  testDb.prepare(`
    INSERT INTO calls (id, duration_seconds, transcript, call_date, calling_number, ucc, client_number, status)
    VALUES (11, 60, 'Namaskar, I am calling from FundsIndia to discuss your monthly statement for account WIA81138. No trades today, just account balance query.', '2026-09-01', '9811181138', 'WIA81138', '9811181138', 'pending')
  `).run();

  const classResult = await stage4ClassifyCall(testDb, 11);
  assert.strictEqual(classResult.classification, 'REGULAR', 'WIA81138 general query call must be classified as REGULAR');

  const eligibility = isAuditEligible(testDb, 11);
  assert.strictEqual(eligibility.eligible, false, 'WIA81138 REGULAR call must be ineligible for Stage 7 audit');
}

// 13. Regression Test 12: Client WIA18143 must be classified as PRE_ORDER and pass audit eligibility gate
console.log('Testing Regression Test 12: Client WIA18143 -> PRE_ORDER (Trade order verification)...');
{
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

  testDb.prepare(`
    INSERT INTO trades (id, order_no, trade_date, ucc, client_code, client_number, phone_number, symbol, quantity, price, side)
    VALUES (143, 'ORD143', '2026-09-01', 'WIA18143', 'WIA18143', '9822218143', '9822218143', 'INFY', 25, 1850, 'BUY')
  `).run();

  testDb.prepare(`
    INSERT INTO calls (id, duration_seconds, transcript, call_date, calling_number, ucc, client_number, status, matched_trade_id)
    VALUES (12, 55, 'ADVISOR: Hello, please place order for 25 shares of Infosys INFY at market price for client WIA18143.\nCLIENT: Haan kar dijiye buy.', '2026-09-01', '9822218143', 'WIA18143', '9822218143', 'matched', 143)
  `).run();

  testDb.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
    VALUES (12, 1, 0, 5, 'ADVISOR', 'Hello, please place order for 25 shares of Infosys INFY at market price for client WIA18143.', 'en', '2026-09-01 10:00:00')
  `).run();

  testDb.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, language, created_at)
    VALUES (12, 2, 5, 10, 'CLIENT', 'Haan kar dijiye buy.', 'hi', '2026-09-01 10:00:05')
  `).run();

  const classResult = await stage4ClassifyCall(testDb, 12);
  assert.strictEqual(classResult.classification, 'PRE_ORDER', 'WIA18143 order execution call must be classified as PRE_ORDER');

  const eligibility = isAuditEligible(testDb, 12);
  assert.strictEqual(eligibility.eligible, true, 'WIA18143 PRE_ORDER call with matched trade must be eligible for Stage 7 audit');
}

console.log('✅ ALL GOLDEN VERIFICATION TESTS PASSED SUCCESSFULLY!');
