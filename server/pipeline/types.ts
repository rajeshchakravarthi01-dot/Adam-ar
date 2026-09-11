// =============================================================
// AuditEQ 9-Stage Pipeline Types & State Machine Definitions
// =============================================================

export type IdentityStatus = 'PENDING' | 'CONFIRMED' | 'REVIEW' | 'FAILED';
export type IdentitySource = 'METADATA' | 'FILENAME' | 'TRADE_EXACT' | 'MANUAL';

export type TranscriptStatus = 'PENDING' | 'VALID' | 'FAILED';

export type CallClassification = 'PENDING' | 'PRE_ORDER' | 'REGULAR' | 'SCRAP' | 'REVIEW';

export type TradeMatchStatus = 'PENDING' | 'CONFIRMED' | 'REVIEW' | 'NO_MATCH';

export type AuditStageStatus = 'PENDING' | 'AUDITED' | 'REVIEW' | 'BLOCKED' | 'FAILED';

export type ProcessingStatus = 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SpeakerRole = 'ADVISOR' | 'CLIENT' | 'UNKNOWN';

export interface TranscriptSegment {
  id?: number;
  segment_id: string;
  start_time: number;
  end_time: number;
  speaker: SpeakerRole;
  text: string;
}

export interface ClassificationEvidence {
  segment_id: string;
  start: number;
  end: number;
  speaker: SpeakerRole;
  text: string;
}

export interface ClassificationResult {
  classification: CallClassification;
  confidence: number;
  evidence: ClassificationEvidence[];
  reason: string;
  scrap_reason?: string;
  model?: string;
}

export interface ResolvedIdentity {
  caller_id: string;
  client_number?: string;
  registered_number?: string;
  advisor?: string;
  dealer?: string;
  team?: string;
  client_code?: string;
  status: IdentityStatus;
  source: IdentitySource;
  resolution_notes?: string;
}

export interface TradeMatchDecision {
  status: TradeMatchStatus;
  matched_trade_id?: number | null;
  confidence: number;
  margin: number;
  matching_factors: string[];
  reason: string;
}

export interface AuditEligibilityResult {
  eligible: boolean;
  gateCode: string;
  reason: string;
}

export interface QuestionEvidence {
  segment_id?: string;
  start_ms?: number;
  end_ms?: number;
  speaker?: SpeakerRole;
  text?: string;
}

export interface AuditQuestionResult {
  status: 'PASS' | 'FAIL' | 'REVIEW';
  flag?: 'FATAL' | 'NON_FATAL';
  evidence: string;
  reason: string;
  confidence?: number;
  evidence_verified?: boolean;
  speaker?: SpeakerRole;
  start_ms?: number;
  end_ms?: number;
}

export interface StageAuditResult {
  q1: AuditQuestionResult;
  q2: AuditQuestionResult;
  q3: AuditQuestionResult;
  q4?: AuditQuestionResult;
  q5: AuditQuestionResult;
  model: string;
}

export interface StageScoreResult {
  score: number; // 0 to 5
  max_score: 5;
  is_fatal: boolean;
  fatal_reasons: string[];
  review_reasons: string[];
  audit_comment: string;
  disposition: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
}

export interface ImportBatchRecord {
  id: number;
  batch_id: string;
  total_files: number;
  uploaded_count: number;
  status: string;
  created_at: string;
}

export interface PipelineCallState {
  id: number;
  batch_id?: string;
  original_filename: string;
  caller_id?: string;
  file_size?: number;
  mime_type?: string;
  duration_seconds?: number;
  import_status: 'CONFIRMED' | 'FAILED';
  identity_status: IdentityStatus;
  identity_source?: IdentitySource;
  client_code?: string;
  transcript_status: TranscriptStatus;
  classification: CallClassification;
  classification_confidence?: number;
  trade_match_status: TradeMatchStatus;
  matched_trade_id?: number | null;
  trade_match_confidence?: number;
  audit_status: AuditStageStatus;
  processing_status: ProcessingStatus;
  failure_reason?: string;
}
