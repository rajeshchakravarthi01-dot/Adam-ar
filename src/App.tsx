import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CallsView } from './components/CallsView';
import { TradesView } from './components/TradesView';
import { MatchingView } from './components/MatchingView';
import { AuditView } from './components/AuditView';
import { PipelineView } from './components/PipelineView';
import { AuditedMasterView } from './components/AuditedMasterView';
import { ManualTradeAuditView } from './components/ManualTradeAuditView';
import { ScorecardsView } from './components/ScorecardsView';
import { MailView } from './components/MailView';
import { ReportsView } from './components/ReportsView';
import { IntegrationsView } from './components/IntegrationsView';
import { TataView } from './components/TataView';
import { ComplianceChatbot } from './components/ComplianceChatbot';
import { DiagnosticsView } from './components/DiagnosticsView';
import { LogsView } from './components/LogsView';
import { MaintenanceView } from './components/MaintenanceView';
import { AdminView } from './components/AdminView';
import { AdamBeeView } from './components/AdamBeeView';
import { AdamBeeMascot } from './components/AdamBeeMascot';
import { AuthModal } from './components/AuthModal';
import { LoginScreen } from './components/LoginScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api, clearStoredToken, getStoredToken } from './lib/api';

import type {
  ActiveTab,
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
  AdamBeeTicketRecord,
} from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);

  // AdamBee Agent State
  const [isBeeFlying, setIsBeeFlying] = useState(false);
  const [adamBeeTickets, setAdamBeeTickets] = useState<AdamBeeTicketRecord[]>(() => {
    try {
      const saved = localStorage.getItem('adambee_tickets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Core Data State
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRecord[]>([]);
  const [advisors, setAdvisors] = useState<string[]>([]);
  const [mailHistory, setMailHistory] = useState<MailHistoryRecord[]>([]);
  const [archives, setArchives] = useState<ReportArchive[]>([]);
  const [integrations, setIntegrations] = useState<SystemIntegrations | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const verifyUserSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setCurrentUser(null);
      setIsCheckingAuth(false);
      return;
    }
    try {
      const res = await api.verifySession();
      if (res.ok && res.user) {
        setCurrentUser(res.user);
      } else {
        clearStoredToken();
        setCurrentUser(null);
      }
    } catch {
      // Session unauthenticated or token invalid
      clearStoredToken();
      setCurrentUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;

    try {
      const [
        statsRes,
        callsRes,
        tradesRes,
        matchesRes,
        auditsRes,
        scorecardsRes,
        advisorsRes,
        mailRes,
        archivesRes,
        integrationsRes,
        diagRes,
        logsRes,
      ] = await Promise.allSettled([
        api.getStats(),
        api.getCalls(100),
        api.getTrades(100),
        api.getMatches(100),
        api.getAudits(100),
        api.getScorecards(100),
        api.getAdvisors(),
        api.getMailHistory(100),
        api.getArchives(),
        api.getIntegrations(),
        api.getDiagnostics(),
        api.getLogs(100),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (callsRes.status === 'fulfilled' && Array.isArray(callsRes.value)) setCalls(callsRes.value);
      if (tradesRes.status === 'fulfilled' && Array.isArray(tradesRes.value)) setTrades(tradesRes.value);
      if (matchesRes.status === 'fulfilled' && Array.isArray(matchesRes.value)) setMatches(matchesRes.value);
      if (auditsRes.status === 'fulfilled' && Array.isArray(auditsRes.value)) setAudits(auditsRes.value);
      if (scorecardsRes.status === 'fulfilled' && Array.isArray(scorecardsRes.value)) setScorecards(scorecardsRes.value);
      if (advisorsRes.status === 'fulfilled' && Array.isArray(advisorsRes.value)) setAdvisors(advisorsRes.value);
      if (mailRes.status === 'fulfilled' && Array.isArray(mailRes.value)) setMailHistory(mailRes.value);
      if (archivesRes.status === 'fulfilled' && Array.isArray(archivesRes.value)) setArchives(archivesRes.value);
      if (integrationsRes.status === 'fulfilled') setIntegrations(integrationsRes.value);
      if (diagRes.status === 'fulfilled') setDiagnostics(diagRes.value);
      if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) setLogs(logsRes.value);

      // Verify before logging out on 401
      const firstRejected = [statsRes, callsRes, tradesRes].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstRejected && (firstRejected.reason as any)?.status === 401) {
        const verifyRes = await api.verifySession().catch(() => null);
        if (!verifyRes || !verifyRes.ok) {
          clearStoredToken();
          setCurrentUser(null);
        }
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await verifyUserSession();
      if (active && getStoredToken()) {
        fetchAllData();
      }
    };
    initialize();

    const interval = setInterval(() => {
      if (getStoredToken()) {
        fetchAllData();
      }
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchAllData, verifyUserSession]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    clearStoredToken();
    setCurrentUser(null);
    showToast('Signed out successfully.');
  };

  const handleSaveApiKey = async (apiKey: string): Promise<boolean> => {
    try {
      await api.saveIntegrations({ groq_key: apiKey });
      const testRes = await api.testGroq();
      await fetchAllData();
      return Boolean(testRes.ok);
    } catch {
      return false;
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchAllData();
    setIsLoading(false);
    showToast('Data refreshed successfully.');
  };

  const handleStartPipeline = async () => {
    setPipelineRunning(true);
    try {
      const data = await api.startPipeline();
      showToast(data.message || 'Pipeline started successfully!');
      await fetchAllData();
    } catch (err: unknown) {
      showToast(`Pipeline start failed: ${(err as Error).message}`, 'error');
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleUploadCalls = async (formData: FormData) => {
    const data = await api.uploadCalls(formData);
    await fetchAllData();
    showToast(data.message || 'Calls imported and queued for transcription.');
  };

  const handleUploadTrades = async (file: File) => {
    const data = await api.uploadTrades(file);
    await fetchAllData();
    showToast(data.message || 'Trades imported successfully.');
  };

  const handleRunMatching = async () => {
    const data = await api.runMatching();
    await fetchAllData();
    showToast(data.matching?.message || 'Matching complete.');
  };

  const handleForceAudit = async (callId: number) => {
    await api.forceAudit(callId);
    await fetchAllData();
    showToast(`Audit completed and scorecard finalized for Call #${callId}.`);
  };

  const handleReviewAudit = async (auditId: number, data: Partial<AuditRecord>) => {
    await api.reviewAudit(auditId, data);
    await fetchAllData();
    showToast(`Audit #${auditId} updated & finalized.`);
  };

  const handleSendScorecard = async (scorecardId: number, toEmail?: string) => {
    await api.sendScorecard(scorecardId, toEmail);
    await fetchAllData();
    showToast(`Scorecard #${scorecardId} dispatched to ${toEmail || 'advisor'}.`);
  };

  const handleUpdateScorecard = async (
    id: number,
    data: Partial<ScorecardRecord> & { phone?: string; audit_date?: string; feedback?: string }
  ) => {
    await api.updateScorecard(id, data);
    await fetchAllData();
    showToast(`Audited record #${id} updated and synchronized across scorecards and audits.`);
  };

  const handleBulkUpdateScorecards = async (updates: Array<{ id: number; data: any }>) => {
    const res = await api.bulkUpdateScorecards(updates);
    await fetchAllData();
    showToast(res.message || `Successfully updated ${updates.length} audit records.`);
  };

  const handleDeleteScorecard = async (id: number) => {
    const res = await api.deleteScorecard(id);
    await fetchAllData();
    showToast(res.message || `Audit record #${id} deleted.`);
  };

  const handleCreateScorecard = async (data: any) => {
    const res = await api.createScorecard(data);
    await fetchAllData();
    showToast(res.message || 'New audit record added.');
  };

  const handleRunAllAudits = async () => {
    const res = await api.runAllAudits();
    await fetchAllData();
    showToast(res.message || `Audits executed for ${res.audited} call(s).`);
  };

  const handleBulkSend = async (options: {
    advisor: string;
    from_date?: string;
    to_date?: string;
    subject?: string;
    to?: string;
    cc?: string;
    marker_filter?: string;
  }) => {
    const res = await api.bulkSendScorecards(options);
    await fetchAllData();
    showToast(res.message || `Bulk scorecards successfully sent to ${options.advisor}.`);
  };

  const handleSaveIntegrations = async (data: Record<string, string>) => {
    await api.saveIntegrations(data);
    await fetchAllData();
    showToast('Integrations and Groq AI parameters saved.');
  };

  const handleTestGroq = async (key?: string): Promise<boolean> => {
    try {
      const data = await api.testGroq(key);
      return Boolean(data.ok);
    } catch {
      return false;
    }
  };

  const handleArchiveClear = async (label: string) => {
    await api.archivePeriod(label);
    await fetchAllData();
    showToast('Workspace archived and live data cleared.');
  };

  const handlePermanentClear = async () => {
    await api.permanentClear();
    await fetchAllData();
    showToast('Live operational data permanently cleared.');
  };

  const handleTriggerBee = () => {
    setIsBeeFlying(true);
    showToast('AdamBee initiated: Harvesting active CRM & screen ticket elements...');
  };

  const handleFinishBeeFlight = (harvested: AdamBeeTicketRecord) => {
    setIsBeeFlying(false);
    setAdamBeeTickets((prev) => {
      const next = [harvested, ...prev];
      localStorage.setItem('adambee_tickets', JSON.stringify(next));
      return next;
    });
    showToast(`AdamBee captured ticket #${harvested.ticketId} for UCC ${harvested.clientId || 'Client'}!`);
  };

  // Header Titles Map
  const tabTitles: Record<ActiveTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Operations Dashboard',
      subtitle: 'Real-time overview of call ingestion, Groq Whisper transcription, trade matching, and compliance scoring.',
    },
    adambee: {
      title: 'AdamBee Screen & CRM Ticket Auditor',
      subtitle: 'Autonomous crawler and ticket analyzer: Harvest page elements, UCC codes, and customer support tickets across browser screens.',
    },
    tata: {
      title: 'Tata Teleservices Enterprise Telephony',
      subtitle: 'Direct manual integration with Tata Smartflo cloud telephony gateway and manual call sync on demand.',
    },
    calls: {
      title: 'Call Recordings & Audio Ingestion',
      subtitle: 'Upload multi-file audio recordings or ZIP files with Smartflo CSV/JSON metadata matching.',
    },
    trades: {
      title: 'Executed Trading Records',
      subtitle: 'Import executed daily trades from CSV, XLSX, or TXT formats with automatic column normalization.',
    },
    matching: {
      title: 'Deterministic Matching Engine',
      subtitle: 'Correlate trades to call recordings using 4 primary anchors (Client Code, Symbol, Price, Quantity).',
    },
    audit: {
      title: 'Groq AI Compliance Auditing (Q1–Q5)',
      subtitle: 'Review structured AI compliance determinations with fatal rules and verbatim transcript evidence.',
    },
    pipeline: {
      title: 'Production Pipeline Automation',
      subtitle: 'Step-by-step parallel pipeline state from audio upload to finalized audit scorecards.',
    },
    master_table: {
      title: 'Audited Master Grid',
      subtitle: 'Complete pre-order audit master sheet with live inline editing, sorting, and manual record adjustments.',
    },
    manual_trade_audit: {
      title: 'Missing Call Reconciliation & Mail Audit',
      subtitle: 'Audit trades that lack phone recordings via client email/mail confirmation, update 5 parameters, and publish directly to scorecards.',
    },
    scorecards: {
      title: 'Official Quality Audit Scorecards',
      subtitle: 'Real call-level scorecards with 5-mark calculation, fatal zero rules, formatted copy, and export.',
    },
    mail: {
      title: 'Advisor Scorecard Mail Dispatch',
      subtitle: 'Deliver quality audit scorecards to mapped advisors individually or in filtered batches.',
    },
    reports: {
      title: 'Historical Reports & Archives',
      subtitle: 'Verified period archives and full historical scorecard exports in CSV format.',
    },
    integrations: {
      title: 'Groq AI Integrations & Settings',
      subtitle: 'Configure Groq Whisper, GPT-OSS 120b, advisor email mapping, and 5-parameter rubric.',
    },
    diagnostics: {
      title: 'System Diagnostics & Health',
      subtitle: 'REST route verification, database tables status, Groq API connectivity, and worker state.',
    },
    logs: {
      title: 'System & Worker Event Logs',
      subtitle: 'Real-time chronological events stream for transcription, matching, and scoring operations.',
    },
    admin: {
      title: 'Enterprise Admin & Backend Controls',
      subtitle: 'Manage team user credentials, cloud database hosting connections, parallel worker concurrency, and 1-click database purges.',
    },
    maintenance: {
      title: 'Archive & Clear Workspace',
      subtitle: 'Safely create immutable archive bundles and clear operational live data for clean batch processing.',
    },
  };

  // 1. Session verification check loading screen
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-sm font-semibold tracking-wide text-neutral-300">
          Initializing ADAM-AR Compliance Security...
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Gate: Show dedicated Login Screen exclusively (No signup, signin only)
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          fetchAllData();
          showToast(`Welcome back, ${user.full_name || user.username}!`);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 font-sans antialiased">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={tabTitles[activeTab]?.title || 'Operations'}
          subtitle={tabTitles[activeTab]?.subtitle || 'Compliance Audit Engine'}
          onRefresh={handleRefresh}
          onStartPipeline={handleStartPipeline}
          isLoading={isLoading}
          pipelineRunning={pipelineRunning}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          groqConfigured={Boolean(integrations?.groq_configured)}
          onTriggerBee={handleTriggerBee}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* User Authentication & API Key Setup Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            fetchAllData();
            showToast(`Signed in as ${user.full_name || user.username}`);
          }}
          onSaveApiKey={handleSaveApiKey}
          groqConfigured={Boolean(integrations?.groq_configured)}
        />

        {/* Global Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 animate-bounce">
            <div
              className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
                toastMessage.type === 'error'
                  ? 'bg-rose-900 text-white border-rose-700'
                  : 'bg-slate-900 text-white border-slate-700'
              }`}
            >
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <ErrorBoundary fallbackTitle="View Recovery">
            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                onNavigate={setActiveTab}
                onStartPipeline={handleStartPipeline}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'adambee' && (
              <AdamBeeView
                tickets={adamBeeTickets}
                onTriggerBee={handleTriggerBee}
                onClearTickets={() => {
                  setAdamBeeTickets([]);
                  localStorage.removeItem('adambee_tickets');
                  showToast('All harvested AdamBee tickets cleared.');
                }}
                onAddTicket={(ticket) => {
                  setAdamBeeTickets((prev) => {
                    const next = [ticket, ...prev];
                    localStorage.setItem('adambee_tickets', JSON.stringify(next));
                    return next;
                  });
                  showToast(`Ticket #${ticket.ticketId} saved.`);
                }}
              />
            )}

            {activeTab === 'tata' && (
              <TataView
                integrations={integrations}
                calls={calls}
                onSaveIntegrations={handleSaveIntegrations}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'calls' && (
              <CallsView
                calls={calls}
                onUploadCalls={handleUploadCalls}
                onForceAudit={handleForceAudit}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'trades' && (
              <TradesView
                trades={trades}
                onUploadTrades={handleUploadTrades}
                onRefreshTrades={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'matching' && (
              <MatchingView
                matches={matches}
                onRunMatching={handleRunMatching}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'audit' && (
              <AuditView
                audits={audits}
                calls={calls}
                onForceAudit={handleForceAudit}
                onReviewAudit={handleReviewAudit}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'pipeline' && (
              <PipelineView
                stats={stats}
                onStartPipeline={handleStartPipeline}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'master_table' && (
              <AuditedMasterView
                scorecards={scorecards || []}
                onUpdateScorecard={handleUpdateScorecard}
                onBulkUpdateScorecards={handleBulkUpdateScorecards}
                onDeleteScorecard={handleDeleteScorecard}
                onCreateScorecard={handleCreateScorecard}
                onRunAllAudits={handleRunAllAudits}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'manual_trade_audit' && (
              <ManualTradeAuditView
                onScorecardCreated={fetchAllData}
                onNavigateToScorecards={() => setActiveTab('scorecards')}
              />
            )}

            {activeTab === 'scorecards' && (
              <ScorecardsView
                scorecards={scorecards}
                onSendScorecard={handleSendScorecard}
                isLoading={isLoading}
                onNavigateToMail={() => setActiveTab('mail')}
                onRunAllAudits={handleRunAllAudits}
              />
            )}

            {activeTab === 'mail' && (
              <MailView
                scorecards={scorecards}
                advisors={advisors}
                mailHistory={mailHistory}
                onBulkSend={handleBulkSend}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView archives={archives} isLoading={isLoading} />
            )}

            {activeTab === 'integrations' && (
              <IntegrationsView
                integrations={integrations}
                onSaveIntegrations={handleSaveIntegrations}
                onTestGroq={handleTestGroq}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'diagnostics' && (
              <DiagnosticsView diagnostics={diagnostics} isLoading={isLoading} />
            )}

            {activeTab === 'logs' && (
              <LogsView logs={logs} isLoading={isLoading} />
            )}

            {activeTab === 'admin' && (
              <AdminView onRefreshStats={fetchAllData} />
            )}

            {activeTab === 'maintenance' && (
              <MaintenanceView
                onArchiveClear={handleArchiveClear}
                onPermanentClear={handlePermanentClear}
                isLoading={isLoading}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Global Application Footer */}
        <footer className="mt-auto border-t border-slate-200 bg-white/90 backdrop-blur-xs py-3.5 px-6 text-xs text-slate-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-wider">ADAM-AR</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">Pre-Order Voice Quality &amp; Multi-Pass Audit Engine</span>
            </div>
            <div className="text-neutral-700 font-medium">
              Developed and designed by <span className="text-amber-500 font-bold">TAJ</span>
            </div>
          </div>
        </footer>

        {/* Floating Compliance AI Assistant */}
        <ComplianceChatbot />

        {/* AdamBee Screen Crawler Mascot */}
        <AdamBeeMascot isFlying={isBeeFlying} onFinishFlight={handleFinishBeeFlight} />
      </div>
    </div>
  );
}
export default App;
