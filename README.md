# ADAM-AR

**ADAM-AR** is a full-stack TypeScript/React application for processing recorded equity-dealing calls through a controlled compliance-audit pipeline.

The application follows a real-data, evidence-first workflow:

```
CALL / AUDIO → IDENTITY RESOLUTION → TRANSCRIPTION → SPEAKER ATTRIBUTION
→ CALL CLASSIFICATION → TRADE MATCHING → AUDIT ELIGIBILITY → Q1–Q5 AUDIT
→ SCORE → PUBLISH / RECONCILIATION
```

> **Note:** The compliance rules described below are the rules implemented in this codebase. This README does not represent legal advice or certify that the implementation is compliant with SEBI regulations.

---

## Table of Contents

- [What the Application Does](#what-the-application-does)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Processing Pipeline](#processing-pipeline)
- [Q1–Q5 Scoring Model](#q1q5-scoring-model)
- [Autonomous 24/7 Worker](#autonomous-247-worker)
- [Database](#database)
- [Environment Configuration](#environment-configuration)
- [Installation](#installation)
- [Development](#development)
- [Production Build](#production-build)
- [Type Checking](#type-checking)
- [Tests](#tests)
- [API Reference](#api-reference)
- [Security Considerations](#security-considerations)
- [Architecture Observations](#architecture-observations)
- [Recommended Production Flow](#recommended-production-flow)
- [Accuracy Philosophy](#accuracy-philosophy)
- [Development Guidelines](#development-guidelines)
- [Useful Files for Developers](#useful-files-for-developers)
- [Quick Start](#quick-start)
- [Project Status Summary](#project-status-summary)
- [Ownership of Truth](#ownership-of-truth)

---

## What the Application Does

The system is designed to:

- Import call recordings and call metadata
- Import executed-trade data
- Resolve the client/advisor identity from metadata and transcript evidence
- Transcribe Indian-language / multilingual equity calls
- Attribute dialogue to advisor and customer
- Classify calls as `PRE_ORDER`, `REGULAR`, `SCRAP`, or `REVIEW`
- Match a `PRE_ORDER` call against executed trades using multiple identity and trade anchors
- Block uncertain calls from entering the compliance audit
- Evaluate Q1–Q5 using spoken evidence
- Calculate an authoritative compliance score
- Persist audits and scorecards
- Reconcile calls and trades
- Provide dashboards, reports, diagnostics, logs, administration, and integration settings
- Run an autonomous background worker that continuously processes pending calls

---

## Technology Stack

### Frontend
| Component | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS (Vite integration) |
| Icons | Lucide React |
| Animation | Motion |

### Backend
| Component | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | Express |
| Dev server | tsx |
| Production bundler | esbuild |
| Database driver | Node SQLite (`node:sqlite` / `DatabaseSync`) |
| File uploads | Multer |
| Spreadsheets | XLSX |
| Email | Nodemailer / EmailJS integration |

### AI / Speech Services
- **Groq Whisper** — speech-to-text
- **Google Gemini** — native audio / multimodal transcription
- **Groq chat completion** — secondary call-classification logic
- A multi-pass transcription/ensemble implementation exists in `server/ensemble-transcriber.ts`

### External Telephony
A **Tata Tele / Smartflo** integration layer, configured via:
- `TATA_API_URL`
- `TATA_ACCOUNT_ID`
- `TATA_API_KEY`

---

## Repository Structure

```
ADAM-AR-main/
├── server.ts                    # Express application and API routes
├── package.json                 # Dependencies and scripts
├── .env.example                 # Environment variable template
├── index.html                   # Vite HTML entry
├── metadata.json                # Application metadata
│
├── src/
│   ├── App.tsx                  # Main React application
│   ├── main.tsx                 # React entry point
│   ├── types.ts                 # Shared application types
│   ├── index.css                # Global styles
│   │
│   ├── components/
│   │   ├── DashboardView.tsx
│   │   ├── CallsView.tsx
│   │   ├── TradesView.tsx
│   │   ├── MatchingView.tsx
│   │   ├── AuditView.tsx
│   │   ├── AuditedMasterView.tsx
│   │   ├── PipelineView.tsx
│   │   ├── ScorecardsView.tsx
│   │   ├── ReportsView.tsx
│   │   ├── IntegrationsView.tsx
│   │   ├── AdminView.tsx
│   │   ├── DiagnosticsView.tsx
│   │   ├── LogsView.tsx
│   │   ├── MailView.tsx
│   │   ├── TataView.tsx
│   │   └── ...
│   │
│   └── lib/
│       ├── api.ts
│       └── fundsindia-directory.ts
│
├── server/
│   ├── asr-engine.ts
│   ├── audio-preprocessor.ts
│   ├── audit-evaluator.ts
│   ├── classifier.ts
│   ├── dual-asr-pipeline.ts
│   ├── ensemble-transcriber.ts
│   ├── evidence-extractor.ts
│   ├── matcher.ts
│   ├── normalizer.ts
│   ├── scoring-engine.ts
│   ├── validation.ts
│   ├── email-service.ts
│   │
│   └── pipeline/
│       ├── pipelineRunner.ts
│       ├── identity.ts
│       ├── transcription.ts
│       ├── speakers.ts
│       ├── classification.ts
│       ├── tradeMatcher.ts
│       ├── eligibility.ts
│       ├── audit.ts
│       ├── scoring.ts
│       ├── reconciliation.ts
│       ├── import.ts
│       └── types.ts
│
├── tests/
│   ├── golden-audit-suite.ts
│   └── pipeline-accuracy-suite.ts
│
└── .data/
    ├── auditeq.db
    ├── auditeq_backup_latest.db
    ├── auditeq_production.db
    └── uploads/
```

---

## Processing Pipeline

### Stage 1 — Import
Call recordings, metadata, and executed trades enter the application through import/API workflows: call import, trade import, Tata Tele synchronization, and database management.

### Stage 2 — Identity Resolution
**File:** `server/pipeline/identity.ts`

Resolves the call's identity using available metadata and transcript evidence. Key identity fields:
- Client / UCC
- Phone number
- Advisor / caller
- Dealer
- Team
- Call date

Identity must be confirmed before an audit can proceed.

### Stage 3 — Transcription
**File:** `server/pipeline/transcription.ts`

The autonomous pipeline currently invokes the **Groq Whisper** transcription stage, supporting:
- Whisper Large V3
- Whisper V3 Turbo fallback
- Timestamped segments
- Transcript sanitization
- Indian multilingual conversation handling
- Preservation of transcript data in the database

More advanced transcription implementations exist separately and are **not** wired into the production entry point unless stated otherwise:
- `server/dual-asr-pipeline.ts`
- `server/ensemble-transcriber.ts`
- `server/asr-engine.ts`

### Stage 3.5 — Speaker Attribution
**File:** `server/pipeline/speakers.ts`

Identifies `ADVISOR`, `CUSTOMER`, or `UNKNOWN`. This matters because several compliance questions depend on *who* said something, not merely whether a phrase exists in the transcript.

### Stage 4 — Call Classification
**File:** `server/pipeline/classification.ts`

Classifies calls as `PRE_ORDER`, `REGULAR`, `SCRAP`, or `REVIEW` using deterministic evidence checks plus a Groq-based secondary path.

> **State-machine rule:** `REGULAR`, `SCRAP`, and `REVIEW` calls are blocked from entering the audit pipeline. Only `PRE_ORDER` calls continue.

### Stage 5 — Trade Matching
**Files:** `server/pipeline/tradeMatcher.ts`, `server/matcher.ts`, `server/normalizer.ts`

Scores available trades rather than blindly selecting an arbitrary first trade, using: client/UCC, phone number, advisor identity, symbol, time, quantity, price, and conversational evidence.

Confidence and margin rules produce one of: `CONFIRMED`, `REVIEW`, `NO_MATCH`. Only `CONFIRMED` matches continue to the audit stage.

### Stage 6 — Audit Eligibility Gate
**File:** `server/pipeline/eligibility.ts`

One of the most important safety gates in the application. Checks that:
- Classification is `PRE_ORDER`
- Identity is confirmed
- Transcript is valid
- Speaker attribution is usable
- Trade match is confirmed
- A matched trade record is linked

If a prerequisite fails, the call is **blocked** rather than audited with incomplete information.

### Stage 7 — Compliance Audit
**Files:** `server/pipeline/audit.ts`, `server/audit-evaluator.ts`, `server/evidence-extractor.ts`

Evaluates the call against Q1–Q5 using actual spoken evidence compared against authoritative trade/reference data. The design explicitly attempts to prevent synthetic evidence from being treated as spoken proof.

---

## Q1–Q5 Scoring Model

Implemented in `server/pipeline/scoring.ts`. Maximum score: **5/5**.

| # | Question | Description | Pass | Fail | Review |
|---|---|---|---|---|---|
| Q1 | Telephone authorization | Calling-number compliance | +1 point | Fatal | Review |
| Q2 | Client UCC / identification | Confirmed in dialogue | +1 point | Fatal | Review |
| Q3 | Order details | Stock, quantity, price/CMP (non-fatal) | +1 point | Deduction/review | Review |
| Q4 | Customer acknowledgement | Currently defined as an always-pass point | +1 point | — | — |
| Q5 | Prohibited assurances | Return/profit guarantee detection | +1 point | Fatal | Review |

### Authoritative Outcomes

| Condition | Score | Disposition |
|---|---|---|
| Q1 / Q2 / Q5 fatal failure | 0/5 | `NON_COMPLIANT` |
| All required checks pass | 5/5 | `COMPLIANT` |
| Q3 not PASS, no fatal failure | 4/5 | `NEEDS_REVIEW` / remarks |
| Review condition | Provisional | `NEEDS_REVIEW` |

`server/scoring-engine.ts` acts as the broader authoritative scoring/persistence layer for audit and scorecard records.

---

## Autonomous 24/7 Worker

**File:** `server/pipeline/pipelineRunner.ts`

A continuous worker supervisor that:
- Checks for pending calls
- Detects calls stuck in `PROCESSING`
- Resets stale processing states
- Selects the next eligible queue item
- Runs the full pipeline
- Handles API-key standby state
- Backs off after Groq rate-limit errors
- Continues processing new calls automatically

Started from the backend and operates on a timer.

---

## Database

SQLite-based persistence. The repository currently contains multiple database files under `.data/`:

```
.data/auditeq.db
.data/auditeq_backup_latest.db
.data/auditeq_production.db
```

Backend-maintained tables include: `users`, `calls`, `trades`, `matches`, `audits`, `scorecards`, `jobs`, `logs`, `settings`, `mail_history`, `report_archives`, `cleared_backups`, `import_batches`, `call_segments`.

> ⚠️ **Important:** Database files can contain real operational data, call metadata, transcripts, audit results, and potentially sensitive information. **Do not commit production databases or recordings to a public Git repository.**

---

## Environment Configuration

```bash
cp .env.example .env
```

```env
ADMIN_PASSWORD=
USER_PASSWORD=

GROQ_API_KEY=
GEMINI_API_KEY=

DATABASE_PATH=
DATABASES_DIR=
UPLOADS_DIR=

COMPLIANCE_HEAD_EMAIL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

TATA_ACCOUNT_ID=
TATA_API_KEY=
TATA_API_URL=
```

**AI keys:**
- `GROQ_API_KEY` is required for the autonomous production pipeline's current transcription/classification path.
- `GEMINI_API_KEY` is supported by the repository's Gemini/ensemble functionality, but the current `runFullPipelineForCall()` path passes the Groq key directly to production stages. **Having a Gemini key configured does not by itself mean the autonomous pipeline uses Gemini for every call.**

---

## Installation

**Requirements:** Node.js 20+, npm

```bash
npm install
cp .env.example .env
# then add the required API/database configuration
```

---

## Development

```bash
npm run dev
```

Runs `tsx server.ts`. The Express backend serves the API and Vite handles the frontend during development.

---

## Production Build

```bash
npm run build
```

Performs a Vite frontend build + esbuild bundling of `server.ts` → `dist/server.cjs`.

```bash
npm start
```

Production entry point: `dist/server.cjs`

---

## Type Checking

```bash
npm run lint
```

Runs `tsc --noEmit`.

---

## Tests

```bash
npm test
```

Runs:
- `tests/golden-audit-suite.ts`
- `tests/pipeline-accuracy-suite.ts`

Covers: spoken-number normalization, audio preparation, transcript preservation, multi-channel handling, classification, evidence extraction, trade matching, audit evaluation, score calculation, and database persistence.

> **Testing limitation:** These are primarily code-level/unit/integration checks. Passing them is **not** proof of 100% real-world transcription or compliance-audit accuracy. Real production accuracy requires testing against a large, manually verified corpus of real calls — including difficult Indian-language speech, accents, code-switching, numbers, stock names, quantities, prices, overlapping speech, and poor-quality recordings.

---

## API Reference

Mounted at `/api` and also `/wp-json/auditeq/v7`.

<details>
<summary><strong>Health</strong></summary>

```
GET /api/health
GET /api/ready
```
</details>

<details>
<summary><strong>Authentication</strong></summary>

```
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/verify
GET  /api/auth/users
POST /api/auth/logout
```
</details>

<details>
<summary><strong>Calls</strong></summary>

```
GET    /api/calls
DELETE /api/calls/:id
PATCH  /api/calls/:id
POST   /api/calls/classify-all
POST   /api/calls/:id/force-audit
POST   /api/calls/:id/pipeline-run
POST   /api/calls/bulk-delete
GET    /api/calls/:id/audio
GET    /api/calls/download-zip
POST   /api/imports/calls
```
</details>

<details>
<summary><strong>Trades</strong></summary>

```
GET  /api/trades
POST /api/imports/trades
POST /api/trades/combine-splits
PUT  /api/trades/:id
POST /api/trades/recalculate-all
GET  /api/trades/missing-calls
POST /api/trades/:id/manual-audit
POST /api/trades/bulk-manual-audit
```
</details>

<details>
<summary><strong>Matching</strong></summary>

```
GET  /api/matches
POST /api/matching/run
```
</details>

<details>
<summary><strong>Audits</strong></summary>

```
GET  /api/audits
POST /api/audits/:id/review
POST /api/audits/:callId/force
POST /api/audits/run-all
```
</details>

<details>
<summary><strong>Pipeline</strong></summary>

```
GET  /api/pipeline/worker-status
GET  /api/pipeline/batches
GET  /api/pipeline/reconciliation
GET  /api/pipeline/accuracy-metrics
POST /api/pipeline/start
```
</details>

<details>
<summary><strong>Scorecards</strong></summary>

```
GET    /api/scorecards
GET    /api/scorecards/advisors
POST   /api/scorecards
PUT    /api/scorecards/:id
DELETE /api/scorecards/:id
POST   /api/scorecards/:id/send
POST   /api/scorecards/bulk-send
POST   /api/scorecards/bulk-update
```
</details>

<details>
<summary><strong>Reports / Mail / Admin / Integrations</strong></summary>

Additional endpoints are implemented for: reports, report archives, mail history, SMTP testing, Tata Tele status/testing/synchronization, logs, diagnostics, database switching, database administration, user administration, maintenance/clearing, AI integration testing, and the compliance chatbot.

The complete endpoint implementation is in `server.ts`.
</details>

---

## Security Considerations

This repository handles call recordings, client identifiers, phone numbers, trade information, transcripts, compliance results, database backups, email configuration, and API credentials.

**Before deploying:**

- 🔒 **Never commit secrets** — `.env`, API keys, SMTP passwords, database credentials, production database files
- 🔒 **Do not expose recordings publicly** — audio endpoints must remain authenticated and protected
- 🔒 **Protect SQLite files** — keep production databases outside publicly served directories
- 🔒 **Rotate exposed credentials** — if any API key, password, cookie, or secret has ever been committed or shared, rotate it immediately

---

## Architecture Observations

**A. Multiple transcription engines exist.** The codebase contains `server/pipeline/transcription.ts`, `server/asr-engine.ts`, `server/dual-asr-pipeline.ts`, and `server/ensemble-transcriber.ts`. The autonomous 9-stage pipeline currently uses `stage3TranscribeCall()` from `server/pipeline/transcription.ts`. The Gemini/Groq multi-pass ensemble exists separately — **changing `ensemble-transcriber.ts` does not automatically change the 24/7 pipeline.**

**B. Multiple audit/scoring layers exist.** `server/audit-evaluator.ts`, `server/pipeline/audit.ts`, `server/pipeline/scoring.ts`, and `server/scoring-engine.ts` all relate to scoring. The intended architecture keeps **one authoritative scoring result** and reconciles it into audit/scorecard records. Avoid creating competing scoring logic.

**C. Version labels are misaligned.** `package.json` reports `17.0.28` while source comments identify the app as `v18.0.0`. These should be synchronized before a formal release.

**D. Do not use arbitrary trade selection.** The matcher explicitly scores candidates and makes a confidence/margin decision. Preserve the rule: **no confirmed match → no compliance audit.** Do not reintroduce `trades[0]` or any arbitrary fallback.

---

## Recommended Production Flow

```
 1. Receive/import call
 2. Store original audio + metadata
 3. Resolve identity
 4. Transcribe
 5. Attribute speakers
 6. Classify call
 7. Reject REGULAR/SCRAP/REVIEW from audit
 8. Match against ALL relevant trades
 9. Require CONFIRMED trade match
10. Run audit eligibility gate
11. Extract spoken evidence
12. Evaluate Q1–Q5
13. Calculate one authoritative score
14. Persist audit + scorecard
15. Reconcile call/trade records
16. Expose result in Master Grid / reports
```

---

## Accuracy Philosophy

AuditEQ should be treated as an **evidence-verification system**, not simply an LLM text-generation system.

For high-accuracy operation:
- Preserve the original audio, raw transcript, and timestamps
- Preserve speaker attribution
- Keep authoritative trade data separate from transcript evidence
- Never manufacture missing spoken evidence from trade metadata
- Require exact/confirmed identity and trade matching
- Send ambiguous cases to human review
- Keep model outputs auditable
- Maintain deterministic scoring after evidence extraction
- Test against manually labelled real calls

No AI system can honestly guarantee 100% transcription accuracy. The correct target is:

> **high automated accuracy + explicit confidence gates + evidence traceability + human review for uncertainty**

...rather than pretending every model output is perfect.

---

## Development Guidelines

**Preserve the state machine:**

```
PRE_ORDER → CONFIRMED IDENTITY → VALID TRANSCRIPT → CONFIRMED TRADE → ELIGIBLE → AUDIT
```

- **Never bypass eligibility.** Force-audit functionality should still respect compliance controls unless a deliberate, documented administrative override is required.
- **Keep evidence separate from reference data.** A trade record proves what was executed — it cannot automatically prove that a specific statement was spoken on the call.
- **Keep scoring centralized.** Do not introduce a second independent scoring formula.
- **Preserve raw evidence.** Never overwrite the only copy of original audio, raw transcript, segment timestamps, speaker attribution, or model outputs.

---

## Useful Files for Developers

**Core pipeline:**
```
server/pipeline/pipelineRunner.ts
server/pipeline/identity.ts
server/pipeline/transcription.ts
server/pipeline/speakers.ts
server/pipeline/classification.ts
server/pipeline/tradeMatcher.ts
server/pipeline/eligibility.ts
server/pipeline/audit.ts
server/pipeline/scoring.ts
server/pipeline/reconciliation.ts
server/normalizer.ts
server/matcher.ts
server/evidence-extractor.ts
server/scoring-engine.ts
```

**Frontend:**
```
src/App.tsx
src/lib/api.ts
src/types.ts
src/components/
```

**Accuracy testing:**
```
tests/golden-audit-suite.ts
tests/pipeline-accuracy-suite.ts
```

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Add at minimum: GROQ_API_KEY=your_key

# 3. Start development server
npm run dev

# 4. Type-check
npm run lint

# 5. Run tests
npm test

# 6. Production build
npm run build

# 7. Production start
npm start
```

---

## Project Status Summary

### ✅ Implemented
Full React frontend · Express backend · SQLite persistence · Authentication · Call import · Trade import · Audio storage/access · Groq transcription · Gemini/ensemble transcription modules · Speaker attribution · Call classification · Candidate-based trade matching · Audit eligibility gates · Q1–Q5 audit framework · Authoritative scoring · Scorecards · Reports · Email workflows · Tata Tele integration · Diagnostics/logging · Database administration · Autonomous processing worker · Accuracy test suites

### ⚠️ Areas Requiring Care Before Declaring Production-Grade Accuracy
- Validate the actual live transcription path versus the separate ensemble implementation
- Establish a large, manually labelled benchmark set
- Measure transcription error rate separately for names, client codes, quantities, and prices
- Measure false-positive/false-negative rates for `PRE_ORDER` classification
- Measure trade-match precision and recall
- Validate speaker attribution on real recordings
- Validate Q1–Q5 evidence extraction independently
- Remove production/sample data from source control
- Synchronize project version labels
- Keep one authoritative scoring implementation

---

## Ownership of Truth

For audit decisions, the system maintains a clear hierarchy:

```
ORIGINAL AUDIO
     ↓
RAW / VERIFIED TRANSCRIPT
     ↓
TIMESTAMPED SPEAKER EVIDENCE
     ↓
RESOLVED CLIENT + TRADE
     ↓
DETERMINISTIC COMPLIANCE RULES
     ↓
AUTHORITATIVE SCORE
```

The further downstream a value is generated, the more important it is that it remains traceable to the original evidence.

---

<div align="center">

**Repository:** ADAM-AR / AuditEQ
**Primary stack:** React + TypeScript + Node.js + Express + SQLite
**Primary speech service (autonomous pipeline):** Groq Whisper
**Primary principle:** *Evidence-first automated audit with hard eligibility gates and human review for uncertainty.*

</div>