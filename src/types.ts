export type AuditStatus = 'queued' | 'processing' | 'audited' | 'scored' | 'manual_review' | 'matching_exception' | 'failed' | 'stale';

export interface ScorecardRecord {
  id: number;
  audit_id: number;
  call_id: number;
  caller_name: string;
  dealer?: string;
  advisor_email?: string;
  team: string;
  client: string;
  client_code?: string;
  trade_phone: string;
  calling_number: string;
  registered_number: string;
  trade_date: string;
  call_date: string;
  score: number;
  is_fatal: boolean;
  fatal_reasons: string;
  q1_status: string;
  q1_evidence: string;
  q2_status: string;
  q2_evidence: string;
  q3_status: string;
  q3_evidence: string;
  q4_status: string;
  q4_evidence: string;
  q5_status?: string;
  q5_evidence?: string;
  audit_comment: string;
  recording_name?: string;
  model?: string;
  transcript?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  trades?: TradeRecord[];
  resolved_trade_id?: number | null;
  generated_at?: string;
  created_at: string;
}

export interface RubricItem {
  id: string; // Q1, Q2, Q3, Q4
  question: string;
  fatal: boolean;
  weight: number;
  rule: string;
}

export interface CallRecord {
  id: number;
  external_id: string;
  recording_name: string;
  recording_url?: string;
  storage_path?: string;
  file_sha256?: string;
  dealer?: string;
  caller_name?: string;
  team?: string;
  client?: string;
  client_number?: string;
  phone_number?: string;
  calling_number?: string;
  registered_number?: string;
  authorized_numbers?: string;
  agent_number?: string;
  call_date?: string;
  call_time?: string;
  duration_seconds?: number;
  source: string;
  status: 'imported' | 'transcribing' | 'transcribed' | 'linked_duplicate' | 'failed' | 'audited' | 'scrap' | 'regular' | 'needs_review' | 'blocked' | 'review' | 'pre_order' | 'retry_pending' | 'rejected';
  call_type?: 'unknown' | 'pre_order' | 'regular' | 'scrap' | 'non_pre_order' | 'review';
  preorder_confidence?: number;
  preorder_evidence?: string;
  preorder_speaker?: string;
  preorder_timestamp?: string;
  transcript?: string;
  transcript_raw?: string;
  transcript_meta?: string;
  transcript_model?: string;
  // 9-Stage Pipeline state machine fields
  batch_id?: string;
  original_filename?: string;
  file_size?: number;
  mime_type?: string;
  import_status?: 'CONFIRMED' | 'REJECTED';
  identity_status?: 'CONFIRMED' | 'REVIEW' | 'PENDING';
  identity_source?: string;
  client_code?: string;
  transcript_status?: 'VALID' | 'PENDING' | 'REJECTED';
  classification?: 'PRE_ORDER' | 'REGULAR' | 'SCRAP' | 'REVIEW' | 'PENDING';
  classification_confidence?: number;
  classification_evidence?: string;
  trade_match_status?: 'CONFIRMED' | 'REVIEW' | 'NO_MATCH' | 'PENDING';
  matched_trade_id?: number | null;
  trade_match_confidence?: number;
  trade_match_margin?: number;
  trade_match_reason?: string;
  audit_status?: 'AUDITED' | 'PENDING' | 'BLOCKED' | 'REVIEW';
  processing_status?: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_reason?: string;
  scrap_reason?: string;
  pipeline_stage?: string;
  current_gate?: string;
  gate_reason?: string;
  retry_count?: number;
  review_resolution?: 'CONTINUED' | 'REJECTED' | 'PENDING';
  review_resolved_by?: number;
  review_resolved_at?: string;
  review_resolution_notes?: string;
  total_orders_count?: number;
  total_executions_count?: number;
  total_matched_quantity?: number;
  orders?: CallOrderRecord[];
  executions?: OrderExecutionRecord[];
  created_at: string;
  updated_at: string;
}

export interface CallOrderRecord {
  id: string;
  call_id: number;
  order_index: number;
  intent_type: 'BUY' | 'SELL' | 'CANCEL' | 'MODIFY';
  symbol: string | null;
  raw_symbol: string | null;
  quantity: number | null;
  raw_quantity: string | null;
  price_type: 'CMP' | 'LIMIT' | 'MARKET' | null;
  limit_price: number | null;
  raw_price: string | null;
  confidence: number;
  created_at: string;
}

export interface OrderExecutionRecord {
  id: string;
  order_id: string;
  trade_id: number;
  matched_quantity: number;
  confidence: number;
  margin?: number;
  reason?: string;
  symbol?: string;
  side?: string;
  trade_quantity?: number;
  trade_price?: number;
  trade_time?: string;
  trade_date?: string;
  trade_client?: string;
  created_at: string;
}

export interface ImportBatchRecord {
  id: number;
  batch_id: string;
  total_files: number;
  uploaded_count: number;
  status: string;
  created_at: string;
}

export interface MissingCallItem {
  trade_id: number;
  trade_external_id?: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  trade_date: string;
  trade_phone?: string;
  reconciliation_status: 'MATCHED' | 'MISSING_CALL' | 'REVIEW';
  matched_call_id?: number | null;
  notes: string;
}

export interface PipelineAccuracyMetrics {
  total_calls: number;
  classification_accuracy: number;
  classification_breakdown: {
    pre_order: number;
    regular: number;
    scrap: number;
    review: number;
  };
  trade_matching_accuracy: number;
  trade_match_breakdown: {
    confirmed: number;
    review: number;
    no_match: number;
  };
  transcription_success_rate: number;
  identity_resolution_rate: number;
  audit_completion_rate: number;
  false_fatal_rate: number;
  review_rate: number;
}

export interface TradeRecord {
  id: number;
  external_id: string;
  dealer?: string;
  advisor_name?: string;
  team?: string;
  client?: string;
  client_number?: string;
  phone_number?: string;
  trade_date?: string;
  trade_time?: string;
  symbol?: string;
  side?: 'BUY' | 'SELL' | 'B' | 'S';
  quantity?: number;
  price?: number;
  price_display?: string;
  is_combined?: boolean | number;
  split_count?: number;
  notes?: string;
  raw_json?: string;
  created_at: string;
}

export interface MatchRecord {
  id: number;
  call_id: number;
  trade_id: number;
  confidence: number;
  second_confidence?: number;
  score_margin?: number;
  reason?: string;
  status: 'matched' | 'review' | 'unmatched';
  manual_override: number;
  reviewed_by?: number;
  reviewed_at?: string;
  run_id?: string;
  verification_status: 'pending' | 'confirmed' | 'review' | 'manual_confirmed' | 'unmatched';
  verification_confidence?: number;
  verification_evidence?: string;
  verification_reason?: string;
  verification_model?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;

  // Joined fields for display
  recording_name?: string;
  call_client?: string;
  call_date?: string;
  call_time?: string;
  trade_client?: string;
  trade_client_number?: string;
  advisor_name?: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  price?: number;
  trade_date?: string;
  trade_time?: string;
}

export interface AuditQuestionAnswer {
  status: 'PASS' | 'FAIL';
  evidence: string;
  reason: string;
}

export interface AuditRecord {
  id: number;
  audit_call_key?: number;
  call_id: number;
  trade_id?: number | null;
  match_id?: number | null;
  trade_context?: string;
  transcript_snapshot?: string;
  compliance_disposition?: string;
  rubric_version?: string;
  rubric_snapshot?: string;
  prompt_version?: string;
  model?: string;
  scoring_version?: string;
  q1: 'PASS' | 'FAIL' | 'MANUAL';
  q1_flag: 'FATAL' | 'NON_FATAL';
  q1_evidence: string;
  q1_confidence: number;
  q1_start_ms?: number | null;
  q1_end_ms?: number | null;
  q1_speaker?: string;
  q2: 'PASS' | 'FAIL' | 'MANUAL';
  q2_flag: 'FATAL' | 'NON_FATAL';
  q2_evidence: string;
  q2_confidence: number;
  q2_start_ms?: number | null;
  q2_end_ms?: number | null;
  q2_speaker?: string;
  q3: 'PASS' | 'FAIL' | 'MANUAL';
  q3_flag: 'FATAL' | 'NON_FATAL';
  q3_evidence: string;
  q3_confidence: number;
  q3_start_ms?: number | null;
  q3_end_ms?: number | null;
  q3_speaker?: string;
  q4: 'PASS' | 'FAIL' | 'MANUAL';
  q4_flag: 'FATAL' | 'NON_FATAL';
  q4_evidence: string;
  q4_confidence: number;
  q4_start_ms?: number | null;
  q4_end_ms?: number | null;
  q4_speaker?: string;
  q5?: 'PASS' | 'FAIL' | 'MANUAL';
  q5_flag?: 'FATAL' | 'NON_FATAL';
  q5_evidence?: string;
  q5_confidence?: number;
  q5_start_ms?: number | null;
  q5_end_ms?: number | null;
  q5_speaker?: string;
  score: number | null;
  is_fatal?: boolean | number;
  audit_comment?: string;
  status: AuditStatus;
  transcript_hash?: string;
  evidence_bundle_hash?: string;
  audit_input_hash?: string;
  pipeline_run_id?: string;
  human_review_reason?: string;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  email_sent_at?: string | null;
  email_attempts: number;
  resolved_trade_id?: number | null;
  created_at: string;
  updated_at: string;

  // Joined fields for display
  caller_name?: string;
  dealer?: string;
  team?: string;
  client?: string;
  client_code?: string;
  client_number?: string;
  phone_number?: string;
  calling_number?: string;
  trade_phone?: string;
  registered_number?: string;
  authorized_numbers?: string;
  call_date?: string;
  call_time?: string;
  trade_date?: string;
  recording_name?: string;
  call_type?: string;
  advisor_name?: string;
  advisor_email?: string;
  trades?: TradeRecord[];
  rubric?: RubricItem[];
  trade_count?: number;
}

export interface QueueJob {
  id: number;
  job_type: 'transcribe' | 'preorder_classify' | 'match_verify' | 'preorder_audit' | 'audit' | 'score' | 'email';
  entity_id: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  available_at: string;
  locked_at?: string | null;
  locked_by?: string | null;
  lease_until?: string | null;
  heartbeat_at?: string | null;
  idempotency_key?: string;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStats {
  calls: number;
  trades: number;
  matches: number;
  review_matches: number;
  unmatched_matches: number;
  verification_pending: number;
  transcribed: number;
  preorder_calls: number;
  non_preorder_calls: number;
  preorder_review: number;
  audits: number;
  scored: number;
  manual_review: number;
  matching_exceptions: number;
  audit_coverage: number;
  trade_exception_gap: number;
  queued: number;
  claimable: number;
  processing: number;
  failed: number;
  recordings_ready: number;
  transcription_pending: number;
  transcription_blocked: number;
  pending_without_job: number;
  scorecard_coverage: number;
  matching_ready: boolean;
  avg_score: number;
  alerts: string[];
  db_utc: string;
  last_matching_failure: string;
  pipeline_stage: string;
  coverage_percent: number;
}

export interface LogEntry {
  id: number;
  level: 'info' | 'warning' | 'error' | 'debug';
  event: string;
  message: string;
  context?: string;
  created_at: string;
}

export interface MailHistoryRecord {
  id: number;
  audit_id?: number | null;
  batch_id?: string | null;
  mail_type: string;
  recipient_to: string;
  recipient_cc?: string;
  recipient_bcc?: string;
  subject: string;
  scorecard_count: number;
  status: 'sent' | 'failed';
  error_message?: string | null;
  actor_id?: number | null;
  caller_name?: string;
  client?: string;
  score?: number;
  sent_at: string;
  created_at: string;
}

export interface ReportArchive {
  id: number;
  archive_key: string;
  label: string;
  archived_at: string;
  period_start?: string;
  period_end?: string;
  call_count: number;
  trade_count: number;
  match_count: number;
  audit_count: number;
  scored_count: number;
  bundle_hash: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
  created_at?: string;
}

export interface AuthResponse {
  ok: boolean;
  authenticated: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'tata'
  | 'calls'
  | 'trades'
  | 'matching'
  | 'audit'
  | 'pipeline'
  | 'master_table'
  | 'manual_trade_audit'
  | 'scorecards'
  | 'mail'
  | 'reports'
  | 'integrations'
  | 'diagnostics'
  | 'logs'
  | 'maintenance'
  | 'admin'
  | 'adambee';

export interface AdamBeeTicketRecord {
  id: string;
  sourceUrl: string;
  pageTitle: string;
  extractedAt: string;
  ticketId?: string;
  clientId?: string;
  advisorName?: string;
  phoneNumber?: string;
  tradeSymbol?: string;
  category?: string;
  riskScore: number;
  complianceStatus: 'COMPLIANT' | 'FLAGGED' | 'FATAL' | 'PENDING';
  rawSnippets: string[];
  findings: string;
}

export interface ComplianceQuestionResult {
  status: 'PASS' | 'FAIL' | 'REVIEW';
  evidence: string;
  reason: string;
  speaker?: string;
  confidence?: number;
}

export interface SpokenEvidenceExtraction {
  spokenClientCode: string | null;
  spokenStock: string | null;
  spokenQuantity: number | null;
  spokenPrice: number | null;
  spokenMarketOrder: boolean;
  spokenAssuranceFound: boolean;
  spokenAssuranceEvidence: string | null;
  rawDetails?: string;
}

/**
 * Authoritative ResolvedCallContext that flows through the entire AuditEQ pipeline
 * Call -> Metadata -> Client -> Trade -> Audit -> Scorecard
 */
export interface ResolvedCallContext {
  callId: number;
  callerId: string;
  metadataRecord: Record<string, any> | null;
  authoritativeRegisteredNumber: string | null;
  authoritativeClientCode: string | null;
  candidateTradeIds: number[];
  resolvedTradeId: number | null;
  resolvedTrade: TradeRecord | null;
  transcript: string;
  callType: 'pre_order' | 'regular' | 'scrap' | 'unknown';
  spokenEvidence: SpokenEvidenceExtraction;
  auditDecisions: {
    q1: ComplianceQuestionResult;
    q2: ComplianceQuestionResult;
    q3: ComplianceQuestionResult;
    q4: ComplianceQuestionResult;
    q5?: ComplianceQuestionResult;
  };
  scorecard: ScorecardRecord | null;
}

export interface TataCallRecord {
  id: string;
  call_id: string;
  caller_id: string;
  calling_number: string;
  call_date: string;
  call_time: string;
  duration_seconds: number;
  advisor_name?: string;
  agent_id?: string;
  direction?: 'inbound' | 'outbound';
  recording_url?: string;
  status: string;
  call_type?: 'pre_order' | 'regular' | 'scrap' | 'unknown';
  ingested: boolean;
  already_in_db?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  data_points?: Record<string, any>;
  sources?: string[];
}

export interface SystemIntegrations {
  ai_provider: 'groq';
  transcription_model: string;
  groq_transcription_model: string;
  audit_model: string;
  groq_audit_model: string;
  groq_configured: boolean;
  tata_configured: boolean;
  tata_account_id?: string;
  tata_api_url?: string;
  tata_api_key_set?: boolean;
  worker_configured: boolean;
  advisor_email_map: string;
  email_recipients: string;
  audit_rubric_json: string;
  frontend_origin?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_encryption?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  versions: {
    rubric: string;
    prompt: string;
    scoring: string;
  };
}

export interface FailedJobItem {
  id: number;
  job_type: string;
  entity_id: number;
  entity_name?: string;
  caller_name?: string;
  stage: string;
  attempts: number;
  max_attempts: number;
  last_error: string;
  original_error?: string;
  action_hint: string;
  can_retry: boolean;
  created_at: string;
  updated_at: string;
}

export interface MissingCallTrade {
  id: number;
  external_id?: string;
  dealer?: string;
  advisor_name?: string;
  team?: string;
  trade_date?: string;
  trade_time?: string;
  client?: string;
  client_number?: string;
  phone_number?: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  price?: number;
  has_scorecard?: boolean;
  scorecard_id?: number | null;
  audit_status?: 'PENDING_AUDIT' | 'AUDITED_MAIL' | 'REVIEW';
  mail_reference?: string;
}

export interface DatabaseWorkspaceInfo {
  name: string;
  display_name: string;
  size_bytes: number;
  calls_count: number;
  trades_count: number;
  scorecards_count: number;
  is_current: boolean;
  owner: string;
}


