import type {
  CallRecord,
  TradeRecord,
  MatchRecord,
  AuditRecord,
  ScorecardRecord,
  PipelineStats,
  LogEntry,
  MailHistoryRecord,
  ReportArchive,
  SystemIntegrations,
  UserProfile,
  FailedJobItem,
  AdamBeeTicketRecord,
} from '../types';

export const AUTH_TOKEN_KEY = 'auditeq_auth_token';
export const ACTIVE_DB_KEY = 'auditeq_active_db';

export function getStoredToken(): string | null {
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem('token') ||
    localStorage.getItem('auditeq_session_token')
  );
}

export function setStoredToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem('token', token);
}

export function clearStoredToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('auditeq_session_token');
}

export function getStoredDatabase(): string | null {
  return localStorage.getItem(ACTIVE_DB_KEY);
}

export function setStoredDatabase(dbName: string) {
  localStorage.setItem(ACTIVE_DB_KEY, dbName);
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const activeDb = getStoredDatabase();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-AuditEQ-Token', token);
  }

  if (activeDb) {
    headers.set('X-AuditEQ-Database', activeDb);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({ error: 'Unauthorized' }));
    const error = new Error(errorData.error || 'Authentication required');
    (error as any).status = 401;
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.error || parsed.message || errorMessage;
    } catch {
      errorMessage = errorText.slice(0, 300) || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text() as unknown as T;
}

export const api = {
  // Auth
  verifySession: () => apiRequest<{ ok: boolean; authenticated: boolean; user: UserProfile }>('/api/auth/verify'),
  login: (credentials: { username: string; password: string }) =>
    apiRequest<{ ok: boolean; authenticated: boolean; token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }),
  signup: (userData: { username: string; password: string; email?: string; full_name?: string; role?: string }) =>
    apiRequest<{ ok: boolean; authenticated: boolean; token: string; user: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }),
  logout: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  getUsers: () => apiRequest<UserProfile[]>('/api/auth/users'),

  // Data endpoints
  getStats: () => apiRequest<PipelineStats>('/api/stats'),
  getCalls: (perPage = 100) => apiRequest<CallRecord[]>(`/api/calls?per_page=${perPage}`),
  getTrades: (perPage = 100) => apiRequest<TradeRecord[]>(`/api/trades?per_page=${perPage}`),
  getMatches: (perPage = 100) => apiRequest<MatchRecord[]>(`/api/matches?per_page=${perPage}`),
  getAudits: (perPage = 100) => apiRequest<AuditRecord[]>(`/api/audits?per_page=${perPage}`),
  getScorecards: (perPage = 100) => apiRequest<ScorecardRecord[]>(`/api/scorecards?per_page=${perPage}`),
  getAdvisors: () => apiRequest<string[]>('/api/scorecards/advisors'),
  getMailHistory: (perPage = 100) => apiRequest<MailHistoryRecord[]>(`/api/mail-history?per_page=${perPage}`),
  getArchives: () => apiRequest<ReportArchive[]>('/api/reports/archives'),
  getIntegrations: () => apiRequest<SystemIntegrations>('/api/integrations'),
  saveIntegrations: (settings: Record<string, string>) =>
    apiRequest<{ ok: boolean; message: string }>('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  testGroq: (key?: string) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/integrations/test-groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_key: key }),
    }),
  testSarvam: (key?: string) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/integrations/test-sarvam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sarvam_key: key }),
    }),
  testAuditEngine: (key?: string) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/integrations/test-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit_key: key }),
    }),
  getDiagnostics: () => apiRequest<any>('/api/diagnostics'),
  getLogs: (perPage = 100) => apiRequest<LogEntry[]>(`/api/logs?per_page=${perPage}`),

  // Operations
  uploadCalls: (formData: FormData) =>
    apiRequest<{ ok: boolean; imported: number; message: string }>('/api/imports/calls', {
      method: 'POST',
      body: formData,
    }),
  uploadTrades: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiRequest<{ ok: boolean; imported: number; message: string }>('/api/imports/trades', {
      method: 'POST',
      body: formData,
    });
  },
  combineSplitTrades: () =>
    apiRequest<{ ok: boolean; combined_groups: number; merged_rows: number; message: string }>(
      '/api/trades/combine-splits',
      { method: 'POST' }
    ),
  forceAudit: (callId: number) =>
    apiRequest<{ ok: boolean; audit: AuditRecord; scorecard: ScorecardRecord }>(`/api/calls/${callId}/force-audit`, {
      method: 'POST',
    }),
  runAllAudits: () =>
    apiRequest<{ ok: boolean; audited: number; total_calls: number; message: string }>('/api/audits/run-all', {
      method: 'POST',
    }),
  runMatching: () =>
    apiRequest<{ ok: boolean; matching: { matched_count: number; message: string } }>('/api/matching/run', {
      method: 'POST',
    }),
  startPipeline: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/pipeline/start', {
      method: 'POST',
    }),
  getFailedJobs: () => apiRequest<FailedJobItem[]>('/api/jobs/failed'),
  retryJob: (jobId: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/jobs/${jobId}/retry`, {
      method: 'POST',
    }),
  retryAllFailedJobs: () =>
    apiRequest<{ ok: boolean; retried: number; message: string }>('/api/jobs/retry-all', {
      method: 'POST',
    }),
  reviewAudit: (auditId: number, reviewData: any) =>
    apiRequest<{ ok: boolean; audit: AuditRecord; scorecard: ScorecardRecord }>(`/api/audits/${auditId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    }),
  sendScorecard: (scorecardId: number, to?: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/scorecards/${scorecardId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    }),
  updateScorecard: (scorecardId: number, updateData: Partial<ScorecardRecord> & { phone?: string; audit_date?: string; feedback?: string }) =>
    apiRequest<{ ok: boolean; scorecard: ScorecardRecord; message: string }>(`/api/scorecards/${scorecardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    }),
  bulkUpdateScorecards: (updates: Array<{ id: number; data: any }>) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/scorecards/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    }),
  deleteScorecard: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/scorecards/${id}`, {
      method: 'DELETE',
    }),
  createScorecard: (data: any) =>
    apiRequest<{ ok: boolean; id: number; message: string }>('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateCall: (id: number, data: Partial<CallRecord>) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/calls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  reclassifyAllCalls: () =>
    apiRequest<{ ok: boolean; updated: number; message: string }>('/api/calls/classify-all', {
      method: 'POST',
    }),
  reclassifyAndReauditAllCalls: () =>
    apiRequest<{
      ok: boolean;
      total_eligible_calls: number;
      processed: number;
      pre_order_calls: number;
      audited_calls: number;
      message: string;
      errors?: string[];
    }>('/api/calls/reclassify-and-reaudit-all', {
      method: 'POST',
    }),
  downloadCallsZipUrl: (type = 'all', search = '', advisor = '') => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (search) params.append('search', search);
    if (advisor && advisor !== 'ALL') params.append('advisor', advisor);
    const token = localStorage.getItem('auditeq_session_token');
    if (token) params.append('token', token);
    return `/api/calls/download-zip?${params.toString()}`;
  },
  getAnalytics: () => apiRequest<any>('/api/reports/analytics'),
  bulkSendScorecards: (options: {
    advisor: string;
    from_date?: string;
    to_date?: string;
    subject?: string;
    to?: string;
    cc?: string;
    marker_filter?: string;
  }) =>
    apiRequest<{ ok: boolean; sent_count: number; recipient: string; subject: string; message: string }>('/api/scorecards/bulk-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  testSmtpConnection: (config?: { host?: string; port?: number; user?: string; pass?: string; secure?: boolean }) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/mail/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    }),
  sendTestEmail: (options: { to: string; host?: string; port?: number; user?: string; pass?: string; from?: string; secure?: boolean }) =>
    apiRequest<{ ok: boolean; message: string; messageId: string; response?: string }>('/api/mail/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  archivePeriod: (label?: string) =>
    apiRequest<{ ok: boolean; archive_key: string; bundle_hash: string; message: string }>('/api/maintenance/archive-clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  permanentClear: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/maintenance/permanent-clear', {
      method: 'POST',
    }),
  getTataStatus: () =>
    apiRequest<{ configured: boolean; account_id: string; api_url: string; message: string }>('/api/tata/status'),
  testTata: (config?: { api_key?: string; account_id?: string; api_url?: string }) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/tata/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    }),
  getAdamBeeTickets: () =>
    apiRequest<AdamBeeTicketRecord[]>('/api/adambee/tickets'),
  captureAdamBeeTicket: (data: Partial<AdamBeeTicketRecord>) =>
    apiRequest<{ ok: boolean; message?: string; ticket: AdamBeeTicketRecord }>('/api/adambee/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  clearAdamBeeTickets: (id?: string) =>
    apiRequest<{ ok: boolean; message: string }>(id ? `/api/adambee/tickets?id=${encodeURIComponent(id)}` : '/api/adambee/tickets', {
      method: 'DELETE',
    }),
  syncTata: (params?: { from_date?: string; to_date?: string; limit?: number; api_key?: string; account_id?: string; api_url?: string }) =>
    apiRequest<{ ok: boolean; synced_count: number; duplicates_skipped?: number; total_fetched: number; pages_processed?: number; message: string }>('/api/tata/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    }),
  sendChatMessage: (query: string, mode: 'internal' | 'general' = 'internal') =>
    apiRequest<{ ok: boolean; answer: string; mode?: string; error?: string }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode }),
    }),
  deleteCall: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/calls/${id}`, { method: 'DELETE' }),
  bulkDeleteCalls: (options: { ids?: number[]; type?: string }) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/calls/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  getAdminUsers: () =>
    apiRequest<Array<{ id: number; username: string; email: string; full_name: string; role: string; created_at: string }>>('/api/admin/users'),
  createAdminUser: (data: { email: string; password: string; full_name?: string; role?: string }) =>
    apiRequest<{ ok: boolean; user: any }>('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateUserPassword: (id: number, password: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/admin/users/${id}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  deleteAdminUser: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  clearAllDatabase: () =>
    apiRequest<{ ok: boolean; message: string; archived_snapshot?: boolean; cleared_counts?: any }>('/api/admin/clear-database', { method: 'POST' }),
  getClearedBackups: () =>
    apiRequest<{ ok: boolean; backups: any[] }>('/api/admin/cleared-backups'),
  getClearedBackupDownloadUrl: (id: number) => {
    const token = getStoredToken();
    return `/api/admin/cleared-backups/${id}/download?token=${encodeURIComponent(token || '')}`;
  },

  // Databases (Multi-User Database Management)
  getDatabases: () =>
    apiRequest<{ ok: boolean; databases: any[]; current_database: string }>('/api/databases'),
  createDatabase: (data: { name: string; display_name?: string }) =>
    apiRequest<{ ok: boolean; database: string; message: string }>('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  switchDatabase: (database: string) =>
    apiRequest<{ ok: boolean; active_database: string; message: string }>('/api/databases/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database }),
    }),

  // Manual Trade Audit (Missing Call / Mail Confirmation)
  getMissingCallTrades: (options?: { includeAudited?: boolean; status?: 'PENDING' | 'AUDITED' | 'ALL' }) => {
    const params = new URLSearchParams();
    if (options?.includeAudited) params.set('include_audited', 'true');
    if (options?.status) params.set('status', options.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{
      ok: boolean;
      missing_trades: any[];
      total_missing?: number;
      pending_count?: number;
      audited_count?: number;
    }>(`/api/trades/missing-calls${qs}`);
  },
  matchMailConfirmationFiles: (filesOrMails: {
    files?: File[];
    mails?: Array<{ fileName: string; content: string }>;
  }) => {
    if (filesOrMails.files && filesOrMails.files.length > 0) {
      const formData = new FormData();
      for (const file of filesOrMails.files) {
        formData.append('files', file);
      }
      return apiRequest<{
        ok: boolean;
        total_files: number;
        matched_count: number;
        unmatched_count: number;
        remaining_unconfirmed_count: number;
        message?: string;
        results: Array<{
          fileName: string;
          matched: boolean;
          tradeId?: number;
          trade?: any;
          confidenceScore?: number;
          reason: string;
          evidence?: any;
          scorecardId?: number;
        }>;
      }>('/api/trades/match-mail-files', {
        method: 'POST',
        body: formData,
      });
    } else {
      return apiRequest<{
        ok: boolean;
        total_files: number;
        matched_count: number;
        unmatched_count: number;
        remaining_unconfirmed_count: number;
        message?: string;
        results: Array<{
          fileName: string;
          matched: boolean;
          tradeId?: number;
          trade?: any;
          confidenceScore?: number;
          reason: string;
          evidence?: any;
          scorecardId?: number;
        }>;
      }>('/api/trades/match-mail-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mails: filesOrMails.mails || [] }),
      });
    }
  },
  manualAuditTrade: (tradeId: number, data: any) =>
    apiRequest<{ ok: boolean; scorecard_id: number; audit_id: number; message: string }>(
      `/api/trades/${tradeId}/manual-audit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    ),
  bulkManualAuditTrades: (audits: any[]) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/trades/bulk-manual-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audits }),
    }),
};
