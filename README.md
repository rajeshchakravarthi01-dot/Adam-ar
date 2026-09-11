ADAM-AR / AuditEQ

ADAM-AR (AuditEQ) is a full-stack TypeScript/React application for processing recorded equity-dealing calls through a controlled compliance-audit pipeline.

The application is built around a real-data, evidence-first workflow:

CALL / AUDIO → IDENTITY RESOLUTION → TRANSCRIPTION → SPEAKER ATTRIBUTION → CALL CLASSIFICATION → TRADE MATCHING → AUDIT ELIGIBILITY → Q1–Q5 AUDIT → SCORE → PUBLISH / RECONCILIATION

Important: The compliance rules described below are the rules implemented in this codebase. This README does not represent legal advice or certify that the implementation is compliant with SEBI regulations.

1. What the application does

The system is designed to:

Import call recordings and call metadata.

Import executed-trade data.

Resolve the client/advisor identity from metadata and transcript evidence.

Transcribe Indian-language / multilingual equity calls.

Attribute dialogue to advisor and customer.

Classify calls as:

PRE_ORDER

REGULAR

SCRAP

REVIEW

Match a PRE_ORDER call against executed trades using multiple identity and trade anchors.

Block uncertain calls from entering the compliance audit.

Evaluate Q1, Q2, Q3, Q4 and Q5 using spoken evidence.

Calculate an authoritative compliance score.

Persist audits and scorecards.

Reconcile calls and trades.

Provide dashboards, reports, diagnostics, logs, administration and integration settings.

Run an autonomous background worker that continuously processes pending calls.

2. Technology stack

Frontend

React 19

TypeScript

Vite

Tailwind CSS / Tailwind Vite integration

Lucide React icons

Motion

Backend

Node.js 20+

TypeScript

Express

tsx for development

esbuild for production server bundling

Node SQLite (node:sqlite / DatabaseSync)

Multer for uploads

XLSX for spreadsheet import/export

Nodemailer / EmailJS-related integration

AI / speech services

The repository contains integrations for:

Groq Whisper for speech-to-text.

Google Gemini for native audio / multimodal transcription.

Groq chat completion for secondary call-classification logic.

A multi-pass transcription/ensemble implementation exists in server/ensemble-transcriber.ts.

External telephony integration

The application contains a Tata Tele / Smartflo integration layer using configurable:

Tata API URL

Tata account ID

Tata API key

3. Repository structure

ADAM-AR-main/
├── server.ts                         # Express application and API routes
├── package.json                      # Dependencies and scripts
├── .env.example                      # Environment variable template
├── index.html                        # Vite HTML entry
├── metadata.json                     # Application metadata
│
├── src/
│   ├── App.tsx                       # Main React application
│   ├── main.tsx                      # React entry point
│   ├── types.ts                      # Shared application types
│   ├── index.css                     # Global styles
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

4. Processing pipeline

Stage 1 — Import

Call recordings, metadata and executed trades enter the application through import/API workflows.

Supported application areas include:

Call import

Trade import

Tata Tele synchronization

Database management

Stage 2 — Identity Resolution

Implemented in:

server/pipeline/identity.ts

The system attempts to establish the call's identity using available metadata and transcript evidence.

Important identity fields include:

Client / UCC

Phone number

Advisor / caller

Dealer

Team

Call date

Identity is intended to be confirmed before an audit can proceed.

Stage 3 — Transcription

Implemented primarily in:

server/pipeline/transcription.ts

The autonomous pipeline currently invokes the Groq Whisper transcription stage.

The transcription layer supports:

Whisper Large V3

Whisper V3 Turbo fallback

Timestamped segments

Transcript sanitization

Indian multilingual conversation handling

Preservation of transcript data in the database

The repository also contains more advanced transcription implementations:

server/dual-asr-pipeline.ts
server/ensemble-transcriber.ts
server/asr-engine.ts

These should be considered separate/advanced transcription paths unless explicitly wired into the production pipeline entry point.

Stage 3.5 — Speaker Attribution

Implemented in:

server/pipeline/speakers.ts

The pipeline attempts to identify:

ADVISOR

CUSTOMER

UNKNOWN

Speaker attribution is important because several compliance questions depend on who actually said something, not merely whether a phrase exists somewhere in the transcript.

Stage 4 — Call Classification

Implemented in:

server/pipeline/classification.ts

The classifier distinguishes calls before trade matching/auditing.

Primary classifications:

PRE_ORDER
REGULAR
SCRAP
REVIEW

The code implements deterministic evidence checks around trade-related conversation and also contains a Groq-based secondary classification path.

A critical state-machine rule is:

REGULAR, SCRAP and REVIEW calls are blocked from entering the audit pipeline.

Only PRE_ORDER calls continue.

Stage 5 — Trade Matching

Implemented in:

server/pipeline/tradeMatcher.ts
server/matcher.ts
server/normalizer.ts

The matcher scores available trades rather than blindly selecting an arbitrary first trade.

Matching factors include concepts such as:

Client/UCC

Phone number

Advisor identity

Symbol

Time

Quantity

Price

Conversational evidence

The implementation applies confidence and margin rules and can return:

CONFIRMED
REVIEW
NO_MATCH

Only CONFIRMED matches continue to the audit stage.

Stage 6 — Audit Eligibility Gate

Implemented in:

server/pipeline/eligibility.ts

This is one of the most important safety gates in the application.

The gate checks:

Classification is PRE_ORDER.

Identity is confirmed.

Transcript is valid.

Speaker attribution is usable.

Trade match is confirmed.

A matched trade record is linked.

If a prerequisite fails, the call is blocked rather than being audited with incomplete information.

Stage 7 — Compliance Audit

Implemented in:

server/pipeline/audit.ts
server/audit-evaluator.ts
server/evidence-extractor.ts

The audit engine evaluates the call against Q1–Q5.

The design is evidence-driven: the audit is intended to use actual spoken evidence from the call and compare it against authoritative trade/reference data.

The code explicitly attempts to prevent synthetic evidence from being treated as spoken proof.

5. Q1–Q5 scoring model

The scoring implementation in server/pipeline/scoring.ts uses a maximum score of 5/5.

Q1

Telephone authorization / calling-number compliance.

PASS → 1 point

FAIL → fatal

REVIEW → review

Q2

Client UCC / client identification confirmation in the dialogue.

PASS → 1 point

FAIL → fatal

REVIEW → review

Q3

Order details:

Stock

Quantity

Price / CMP

Q3 is non-fatal.

PASS → 1 point

FAIL/REVIEW → deduction / review treatment depending on the result

Q4

Customer acknowledgement / confirmation.

The pipeline scoring comments define Q4 as an always-pass point in the current production scoring model.

Q5

Prohibited return/profit assurance or guarantee detection.

PASS → 1 point

FAIL → fatal

REVIEW → review

Authoritative outcomes

Current pipeline scoring is:

Condition

Score

Disposition

Q1/Q2/Q5 fatal failure

0/5

NON_COMPLIANT

All required checks pass

5/5

COMPLIANT

Q3 not PASS without fatal failure

4/5

NEEDS_REVIEW / remarks

Review condition

Provisional

NEEDS_REVIEW

The repository also contains server/scoring-engine.ts, which acts as a broader authoritative scoring/persistence layer for audit and scorecard records.

6. Autonomous 24/7 worker

Implemented in:

server/pipeline/pipelineRunner.ts

The application contains a continuous worker supervisor.

The worker:

Checks for pending calls.

Detects calls stuck in PROCESSING.

Resets stale processing states.

Selects the next eligible queue item.

Runs the full pipeline.

Handles API-key standby state.

Backs off after Groq rate-limit errors.

Continues processing new calls automatically.

The supervisor is started from the backend and operates on a timer.

7. Database

The application uses SQLite databases.

The repository currently contains multiple database files under .data/, including:

.data/auditeq.db
.data/auditeq_backup_latest.db
.data/auditeq_production.db

The backend also creates/maintains tables including:

users

calls

trades

matches

audits

scorecards

jobs

logs

settings

mail_history

report_archives

cleared_backups

import_batches

call_segments

Important

Database files can contain real operational data, call metadata, transcripts, audit results and potentially sensitive information.

Do not commit production databases or recordings to a public Git repository.

8. Environment configuration

Copy:

cp .env.example .env

Configure the required variables.

Example:

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

AI keys

GROQ_API_KEY is required for the autonomous production pipeline's current transcription/classification path.

GEMINI_API_KEY is supported by the repository's Gemini/ensemble functionality, but the current runFullPipelineForCall() path accepts and passes the Groq key directly to the production transcription/classification stages.

Therefore, having a Gemini key configured does not by itself mean the autonomous pipeline is using Gemini for every call.

9. Installation

Requirements:

Node.js 20+

npm

Install dependencies:

npm install

Create the environment file:

cp .env.example .env

Add the required API/database configuration.

10. Development

Run the full application in development mode:

npm run dev

The project uses:

tsx server.ts

The Express backend serves the API and Vite handles the frontend during development.

11. Production build

Build:

npm run build

The build performs:

Vite frontend build
+
esbuild server.ts
→ dist/server.cjs

Start:

npm start

Production server entry:

dist/server.cjs

12. Type checking

Run:

npm run lint

This executes:

tsc --noEmit

13. Tests

Run:

npm test

The configured test command runs:

tests/golden-audit-suite.ts
tests/pipeline-accuracy-suite.ts

The accuracy suite contains tests covering areas such as:

Spoken-number normalization

Audio preparation

Transcript preservation

Multi-channel handling

Classification

Evidence extraction

Trade matching

Audit evaluation

Score calculation

Database persistence

Important testing limitation

The tests in the repository are primarily code-level/unit/integration-style checks. Passing these tests should not be interpreted as proof of 100% real-world transcription or compliance-audit accuracy.

Real production accuracy requires testing against a sufficiently large, manually verified corpus of real calls, including difficult Indian-language speech, accents, code-switching, numbers, stock names, quantities, prices, overlapping speech and poor-quality recordings.

14. API

The API is mounted at:

/api

and also:

/wp-json/auditeq/v7

Health

GET /api/health
GET /api/ready

Authentication

POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/verify
GET  /api/auth/users
POST /api/auth/logout

Calls

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

Trades

GET  /api/trades
POST /api/imports/trades
POST /api/trades/combine-splits
PUT  /api/trades/:id
POST /api/trades/recalculate-all
GET  /api/trades/missing-calls
POST /api/trades/:id/manual-audit
POST /api/trades/bulk-manual-audit

Matching

GET  /api/matches
POST /api/matching/run

Audits

GET  /api/audits
POST /api/audits/:id/review
POST /api/audits/:callId/force
POST /api/audits/run-all

Pipeline

GET  /api/pipeline/worker-status
GET  /api/pipeline/batches
GET  /api/pipeline/reconciliation
GET  /api/pipeline/accuracy-metrics
POST /api/pipeline/start

Scorecards

GET    /api/scorecards
GET    /api/scorecards/advisors
POST   /api/scorecards
PUT    /api/scorecards/:id
DELETE /api/scorecards/:id
POST   /api/scorecards/:id/send
POST   /api/scorecards/bulk-send
POST   /api/scorecards/bulk-update

Reports / mail / admin / integrations

Additional endpoints are implemented for:

Reports

Report archives

Mail history

SMTP testing

Tata Tele status/testing/synchronization

Logs

Diagnostics

Database switching

Database administration

User administration

Maintenance / clearing

AI integration testing

Compliance chatbot

The complete endpoint implementation is in:

server.ts

15. Security considerations

This repository contains functionality capable of handling:

Call recordings

Client identifiers

Phone numbers

Trade information

Transcripts

Compliance results

Database backups

Email configuration

API credentials

Before deploying:

Never commit secrets

Do not commit:

.env
API keys
SMTP passwords
database credentials
production database files

Do not expose recordings publicly

Audio endpoints should remain authenticated and protected.

Protect SQLite files

Keep production databases outside publicly served directories where possible.

Rotate exposed credentials

If an API key, password, cookie or other secret has ever been committed or shared, rotate it.

16. Current architecture observations

The repository contains several overlapping/advanced implementations. This is important when modifying the system.

A. There are multiple transcription engines

The codebase contains:

server/pipeline/transcription.ts
server/asr-engine.ts
server/dual-asr-pipeline.ts
server/ensemble-transcriber.ts

The autonomous 9-stage pipeline currently uses stage3TranscribeCall() from:

server/pipeline/transcription.ts

The more extensive Gemini/Groq multi-pass ensemble exists separately.

Do not assume that changing ensemble-transcriber.ts automatically changes the 24/7 pipeline.

B. There are multiple audit/scoring layers

The repository contains:

server/audit-evaluator.ts
server/pipeline/audit.ts
server/pipeline/scoring.ts
server/scoring-engine.ts

The intended architecture is to keep one authoritative scoring result and reconcile it into audit/scorecard records.

Any future changes should avoid creating competing scoring logic.

C. Version labels are not completely aligned

package.json currently reports:

17.0.28

while several source comments identify the application as:

v18.0.0

These should be synchronized before a formal release.

D. Do not use arbitrary trade selection

The trade-matching implementation explicitly attempts to score candidates and make a confidence/margin decision.

Future changes must preserve the rule:

No confirmed match → No compliance audit

Do not reintroduce:

trades[0]

or any other arbitrary candidate fallback.

17. Recommended production flow

For production, the safest conceptual flow is:

1. Receive/import call
        ↓
2. Store original audio + metadata
        ↓
3. Resolve identity
        ↓
4. Transcribe
        ↓
5. Attribute speakers
        ↓
6. Classify call
        ↓
7. Reject REGULAR/SCRAP/REVIEW from audit
        ↓
8. Match against ALL relevant trades
        ↓
9. Require CONFIRMED trade match
        ↓
10. Run audit eligibility gate
        ↓
11. Extract spoken evidence
        ↓
12. Evaluate Q1–Q5
        ↓
13. Calculate one authoritative score
        ↓
14. Persist audit + scorecard
        ↓
15. Reconcile call/trade records
        ↓
16. Expose result in Master Grid / reports

18. Accuracy philosophy

The application should be treated as an evidence-verification system, not simply an LLM text-generation system.

For high-accuracy operation:

Preserve the original audio.

Preserve the raw transcript.

Preserve timestamps.

Preserve speaker attribution.

Keep authoritative trade data separate from transcript evidence.

Never manufacture missing spoken evidence from trade metadata.

Require exact/confirmed identity and trade matching.

Send ambiguous cases to human review.

Keep model outputs auditable.

Maintain deterministic scoring after evidence extraction.

Test against manually labelled real calls.

No AI system can honestly guarantee 100% transcription accuracy.

For compliance workflows, the correct target is:

high automated accuracy
+
explicit confidence gates
+
evidence traceability
+
human review for uncertainty

rather than pretending that every model output is perfect.

19. Development guidelines

When modifying the pipeline:

Preserve the state machine

PRE_ORDER
    ↓
CONFIRMED IDENTITY
    ↓
VALID TRANSCRIPT
    ↓
CONFIRMED TRADE
    ↓
ELIGIBLE
    ↓
AUDIT

Never bypass eligibility

Force-audit functionality should still respect the intended compliance controls unless a deliberate, documented administrative override is required.

Keep evidence separate from reference data

A trade record can prove what was executed.

It cannot automatically prove that a specific statement was spoken on the call.

Keep scoring centralized

Do not introduce a second independent scoring formula.

Preserve raw evidence

Never overwrite the only copy of:

original audio

raw transcript

segment timestamps

speaker attribution

model outputs

20. Useful files for developers

If you are debugging the core processing pipeline, start here:

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

For frontend work:

src/App.tsx
src/lib/api.ts
src/types.ts
src/components/

For accuracy testing:

tests/golden-audit-suite.ts
tests/pipeline-accuracy-suite.ts

21. Quick start

# 1. Install
npm install

# 2. Configure
cp .env.example .env

# 3. Add at minimum
# GROQ_API_KEY=your_key

# 4. Start development server
npm run dev

# 5. Type-check
npm run lint

# 6. Run tests
npm test

# 7. Production build
npm run build

# 8. Production start
npm start

22. Project status summary

Implemented

Full React frontend

Express backend

SQLite persistence

Authentication

Call import

Trade import

Audio storage/access

Groq transcription

Gemini/ensemble transcription modules

Speaker attribution

Call classification

Candidate-based trade matching

Audit eligibility gates

Q1–Q5 audit framework

Authoritative scoring

Scorecards

Reports

Email workflows

Tata Tele integration

Diagnostics/logging

Database administration

Autonomous processing worker

Accuracy test suites

Areas requiring particular care before declaring production-grade accuracy

Validate the actual live transcription path versus the separate ensemble implementation.

Establish a large manually labelled benchmark set.

Measure transcription error rate separately for names, client codes, quantities and prices.

Measure false-positive/false-negative rates for PRE_ORDER classification.

Measure trade-match precision and recall.

Validate speaker attribution on real recordings.

Validate Q1–Q5 evidence extraction independently.

Remove production/sample data from source control.

Synchronize project version labels.

Keep one authoritative scoring implementation.

23. Ownership of truth

For audit decisions, the system should maintain a clear hierarchy:

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

The further downstream a value is generated, the more important it is that it remains traceable to the original evidence.

Repository: ADAM-AR / AuditEQ
Primary stack: React + TypeScript + Node.js + Express + SQLite
Primary speech service in autonomous pipeline: Groq Whisper
Primary principle: evidence-first automated audit with hard eligibility gates and human review for uncertainty.
