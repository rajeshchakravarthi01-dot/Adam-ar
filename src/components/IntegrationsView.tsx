import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Save,
  ShieldCheck,
  Mail,
  Radio,
  RefreshCw,
  Eye,
  EyeOff,
  Server,
  Key,
  Globe,
  Check,
  X,
  Copy,
  Zap,
  Send,
  Lock,
} from 'lucide-react';
import { api } from '../lib/api';
import type { SystemIntegrations } from '../types';

interface IntegrationsViewProps {
  integrations: SystemIntegrations | null;
  onSaveIntegrations: (data: Record<string, string>) => Promise<void>;
  onTestGroq: (key?: string) => Promise<boolean>;
  isLoading: boolean;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onSaveIntegrations,
  onTestGroq,
  isLoading,
}) => {
  // Groq State
  const [groqKey, setGroqKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [transcriptionModel, setTranscriptionModel] = useState('whisper-large-v3');
  const [auditModel, setAuditModel] = useState('openai/gpt-oss-120b');
  const [groqTestResult, setGroqTestResult] = useState<string | null>(null);
  const [isTestingGroq, setIsTestingGroq] = useState(false);

  // Tata Teleservices Enterprise State
  const [tataKey, setTataKey] = useState('');
  const [showTataKey, setShowTataKey] = useState(false);
  const [tataAccountId, setTataAccountId] = useState('');
  const [tataApiUrl, setTataApiUrl] = useState('https://api-smartflo.tatateleservices.com/v1');
  const [tataWebhookSecret, setTataWebhookSecret] = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [tataTestResult, setTataTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingTata, setIsTestingTata] = useState(false);
  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState(false);
  const [webhookSimResult, setWebhookSimResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Manual Tata Sync Controls
  const [syncFromDate, setSyncFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncToDate, setSyncToDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncLimit, setSyncLimit] = useState(50);
  const [isSyncingTata, setIsSyncingTata] = useState(false);
  const [tataSyncResult, setTataSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  // SMTP Gateway Configuration State
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('AuditEQ Compliance Desk');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [isSendingTestMail, setIsSendingTestMail] = useState(false);
  const [testMailResult, setTestMailResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Other Settings
  const [advisorMap, setAdvisorMap] = useState('');
  const [rubricText, setRubricText] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (integrations) {
      setTranscriptionModel(integrations.groq_transcription_model || 'whisper-large-v3');
      setAuditModel(integrations.groq_audit_model || 'openai/gpt-oss-120b');
      setAdvisorMap(integrations.advisor_email_map || '{}');
      setRubricText(integrations.audit_rubric_json || '');
      if (integrations.tata_account_id) setTataAccountId(integrations.tata_account_id);
      if (integrations.tata_api_url) setTataApiUrl(integrations.tata_api_url);
      if (integrations.tata_webhook_secret) setTataWebhookSecret(integrations.tata_webhook_secret);

      if (integrations.smtp_host) setSmtpHost(integrations.smtp_host);
      if (integrations.smtp_port) setSmtpPort(integrations.smtp_port);
      if (integrations.smtp_user) setSmtpUser(integrations.smtp_user);
      if (integrations.smtp_from) setSmtpFrom(integrations.smtp_from);
      else if (integrations.smtp_from_email) setSmtpFrom(integrations.smtp_from_email);
      if (integrations.smtp_from_name) setSmtpFromName(integrations.smtp_from_name);
      if (integrations.smtp_secure !== undefined) setSmtpSecure(integrations.smtp_secure);
    }
  }, [integrations]);

  const handleTestGroq = async () => {
    setIsTestingGroq(true);
    setGroqTestResult('Testing connection to Groq API…');
    try {
      const ok = await onTestGroq(groqKey.trim() || undefined);
      if (ok) {
        setGroqTestResult('Groq connection verified successfully! Whisper & GPT-OSS models active.');
      } else {
        setGroqTestResult('Groq test failed: Please check your GROQ_API_KEY.');
      }
    } catch (err: unknown) {
      setGroqTestResult(`Groq test failed: ${(err as Error).message}`);
    } finally {
      setIsTestingGroq(false);
    }
  };

  const handleTestTata = async () => {
    setIsTestingTata(true);
    setTataTestResult(null);
    try {
      const res = await api.testTata({
        api_key: tataKey.trim() || undefined,
        account_id: tataAccountId.trim() || undefined,
        api_url: tataApiUrl.trim() || undefined,
      });
      if (res.ok) {
        setTataTestResult({
          ok: true,
          message: res.message || 'Connected to Tata Teleservices Smartflo API successfully! Gateway verified.',
        });
      } else {
        setTataTestResult({
          ok: false,
          message: res.error || 'Connection failed: Check Tata credentials.',
        });
      }
    } catch (err: unknown) {
      setTataTestResult({
        ok: false,
        message: `Connection error: ${(err as Error).message}`,
      });
    } finally {
      setIsTestingTata(false);
    }
  };

  const handleSaveTataOnly = async () => {
    setSaveStatus('Saving Tata Teleservices credentials…');
    try {
      const payload: Record<string, string> = {
        tata_account_id: tataAccountId.trim(),
        tata_api_url: tataApiUrl.trim(),
        tata_webhook_secret: tataWebhookSecret.trim(),
      };
      if (tataKey.trim()) {
        payload.tata_api_key = tataKey.trim();
      }
      await onSaveIntegrations(payload);
      setSaveStatus('Tata Teleservices credentials saved to database.');
      setTataKey('');
    } catch (err: unknown) {
      setSaveStatus(`Save failed: ${(err as Error).message}`);
    }
  };

  const handleSimulateWebhook = async () => {
    setIsSimulatingWebhook(true);
    setWebhookSimResult(null);
    try {
      const res = await api.simulateTataWebhook({
        client_number: '+919876543210',
        agent_name: 'AuditEQ Verification Advisor',
        duration: 48,
      });
      if (res.ok) {
        setWebhookSimResult({
          ok: true,
          message: `Webhook received & ingested successfully (Call #${res.call_id}). Pipeline triggered.`,
        });
      } else {
        setWebhookSimResult({
          ok: false,
          message: res.message || 'Failed to simulate webhook event.',
        });
      }
    } catch (err: unknown) {
      setWebhookSimResult({
        ok: false,
        message: `Webhook simulation error: ${(err as Error).message}`,
      });
    } finally {
      setIsSimulatingWebhook(false);
    }
  };

  const handleSyncTataManual = async () => {
    setIsSyncingTata(true);
    setTataSyncResult(null);
    try {
      const res = await api.syncTata({
        from_date: syncFromDate,
        to_date: syncToDate,
        limit: Number(syncLimit) || 50,
        api_key: tataKey.trim() || undefined,
        account_id: tataAccountId.trim() || undefined,
        api_url: tataApiUrl.trim() || undefined,
      });
      setTataSyncResult({
        ok: true,
        message: res.message || `Successfully synced ${res.synced_count} recording(s) from Tata Smartflo.`,
      });
    } catch (err: unknown) {
      setTataSyncResult({
        ok: false,
        message: `Sync failed: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncingTata(false);
    }
  };

  const handleTestSmtp = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await api.testSmtpConnection({
        host: smtpHost.trim() || undefined,
        port: smtpPort ? parseInt(smtpPort, 10) : undefined,
        user: smtpUser.trim() || undefined,
        pass: smtpPass.trim() || undefined,
        secure: smtpSecure,
      });
      setSmtpTestResult(res);
    } catch (err: unknown) {
      setSmtpTestResult({
        ok: false,
        message: `SMTP test error: ${(err as Error).message}`,
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleSendTestMail = async () => {
    if (!testRecipient) return;
    setIsSendingTestMail(true);
    setTestMailResult(null);
    try {
      const res = await api.sendTestEmail({
        to: testRecipient.trim(),
        host: smtpHost.trim() || undefined,
        port: smtpPort ? parseInt(smtpPort, 10) : undefined,
        user: smtpUser.trim() || undefined,
        pass: smtpPass.trim() || undefined,
        from: smtpFrom.trim() || undefined,
        secure: smtpSecure,
      });
      setTestMailResult(res);
    } catch (err: unknown) {
      setTestMailResult({
        ok: false,
        message: `Dispatch failed: ${(err as Error).message}`,
      });
    } finally {
      setIsSendingTestMail(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving integration parameters…');
    try {
      const payload: Record<string, string> = {
        groq_transcription_model: transcriptionModel,
        groq_audit_model: auditModel,
        advisor_email_map: advisorMap,
        audit_rubric_json: rubricText,
        tata_account_id: tataAccountId.trim(),
        tata_api_url: tataApiUrl.trim(),
        tata_webhook_secret: tataWebhookSecret.trim(),
        smtp_host: smtpHost.trim(),
        smtp_port: smtpPort.trim(),
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
        smtp_from_name: smtpFromName.trim(),
        smtp_secure: String(smtpSecure),
      };

      if (groqKey.trim()) {
        payload.groq_key = groqKey.trim();
      }

      if (tataKey.trim()) {
        payload.tata_api_key = tataKey.trim();
      }

      if (smtpPass.trim()) {
        payload.smtp_pass = smtpPass.trim();
      }

      await onSaveIntegrations(payload);
      setSaveStatus('All integration settings (Tata Teleservices, SMTP Mail, and AI Models) saved successfully.');
      setGroqKey('');
      setTataKey('');
      setSmtpPass('');
    } catch (err: unknown) {
      setSaveStatus(`Save failed: ${(err as Error).message}`);
    }
  };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/tata/webhook` : '/api/tata/webhook';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
                <Sliders className="w-4 h-4" />
              </span>
              <span>Integrations &amp; Telephony Gateway Setup</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Production-ready configuration for Tata Teleservices Smartflo, Corporate SMTP Mail Server, and Speech &amp; Compliance Engines.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-teal-500/10 text-teal-300 px-3 py-1 rounded-full border border-teal-500/30 flex items-center gap-1.5 shrink-0 self-start shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Encrypted Server-Side Storage</span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================== */}
        {/* 1. TATA TELESERVICES ENTERPRISE SECTION (SMARTFLO)         */}
        {/* ========================================================== */}
        <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-teal-500/15">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-teal-500/15 text-teal-300 border border-teal-500/30">
                <Radio className="w-4 h-4 text-teal-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Tata Teleservices Smartflo (Telephony Gateway)
                </h3>
                <p className="text-[11px] text-slate-300">
                  Direct connection to Tata Smartflo / Enterprise voice recording gateway and real-time webhook ingestion.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.tata_configured
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.tata_configured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>{integrations?.tata_configured ? 'GATEWAY CONFIGURED' : 'PENDING CREDENTIALS'}</span>
              </span>
            </div>
          </div>

          <div className="p-3.5 glass-inner text-slate-200 rounded-xl border border-teal-500/20 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-teal-300 font-bold">
              <Key className="w-3.5 h-3.5 text-teal-400" />
              <span>Smartflo REST &amp; Webhook Credentials</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Enter your <strong>TATA_API_KEY</strong>, <strong>TATA_ACCOUNT_ID</strong>, and <strong>TATA_API_URL</strong>. All audio fetches automatically support AWS S3 pre-signed URLs, multi-page pagination, and automatic background transcribing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* TATA API KEY */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                TATA_API_KEY *
              </label>
              <div className="relative">
                <input
                  type={showTataKey ? 'text' : 'password'}
                  value={tataKey}
                  onChange={(e) => setTataKey(e.target.value)}
                  placeholder={
                    integrations?.tata_configured
                      ? '•••••••••••••••• (Configured — enter to update)'
                      : 'Enter Tata API Key / Token…'
                  }
                  className="w-full pl-3 pr-9 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowTataKey(!showTataKey)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  title={showTataKey ? 'Hide key' : 'Show key'}
                >
                  {showTataKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Bearer authorization token for Smartflo REST API.
              </div>
            </div>

            {/* TATA ACCOUNT ID */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                TATA_ACCOUNT_ID
              </label>
              <input
                type="text"
                value={tataAccountId}
                onChange={(e) => setTataAccountId(e.target.value)}
                placeholder="e.g. SMARTFLO_CORP_902"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Tenant or Billing Account Identifier.
              </div>
            </div>

            {/* TATA API URL */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                TATA_API_URL
              </label>
              <input
                type="text"
                value={tataApiUrl}
                onChange={(e) => setTataApiUrl(e.target.value)}
                placeholder="https://api-smartflo.tatateleservices.com/v1"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Gateway base URL (defaults to Smartflo v1).
              </div>
            </div>
          </div>

          {/* Webhook Endpoint & Secret */}
          <div className="p-3.5 glass-inner rounded-xl border border-teal-500/20 text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold">
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span>Smartflo Real-Time Webhook Ingestion URL</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setCopiedWebhook(true);
                  setTimeout(() => setCopiedWebhook(false), 2000);
                }}
                className="text-[11px] px-2.5 py-1 glass-inner hover:bg-teal-500/20 text-teal-300 rounded-lg border border-teal-500/30 flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto"
              >
                {copiedWebhook ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWebhook ? 'Copied to Clipboard!' : 'Copy Webhook URL'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1">
                  Public Webhook Endpoint (Enter in Tata Smartflo Portal)
                </label>
                <div className="px-3 py-2 glass-input rounded-lg font-mono text-xs text-teal-300 select-all truncate">
                  {webhookUrl}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1">
                  Webhook Secret / Verification Token (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showWebhookSecret ? 'text' : 'password'}
                    value={tataWebhookSecret}
                    onChange={(e) => setTataWebhookSecret(e.target.value)}
                    placeholder="Enter secret token to verify incoming webhooks…"
                    className="w-full pl-3 pr-9 py-2 glass-input rounded-lg text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showWebhookSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Test & Save Tata Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveTataOnly}
                disabled={isLoading}
                className="px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-teal-500/20 active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Tata Credentials</span>
              </button>

              <button
                type="button"
                onClick={handleTestTata}
                disabled={isTestingTata}
                className="px-4 py-2 glass-inner hover:bg-teal-500/15 text-slate-200 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center gap-2 active:scale-95"
              >
                <Radio className={`w-3.5 h-3.5 text-teal-400 ${isTestingTata ? 'animate-spin' : ''}`} />
                <span>{isTestingTata ? 'Testing Tata Gateway…' : 'Test Gateway Connection'}</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateWebhook}
                disabled={isSimulatingWebhook}
                className="px-4 py-2 glass-inner hover:bg-teal-500/15 text-teal-300 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center gap-2 active:scale-95"
              >
                <Zap className={`w-3.5 h-3.5 text-teal-400 ${isSimulatingWebhook ? 'animate-spin' : ''}`} />
                <span>{isSimulatingWebhook ? 'Simulating…' : 'Simulate Test Webhook'}</span>
              </button>
            </div>

            {tataTestResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  tataTestResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {tataTestResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-rose-400" />}
                <span>{tataTestResult.message}</span>
              </div>
            )}

            {webhookSimResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  webhookSimResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {webhookSimResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-rose-400" />}
                <span>{webhookSimResult.message}</span>
              </div>
            )}
          </div>

          {/* Manual On-Demand Sync Box */}
          <div className="mt-4 p-4 glass-inner rounded-xl border border-teal-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                <span>Manual Call Sync on Demand</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">
                Sync is completely manual — never runs unprompted.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">From Date</label>
                <input
                  type="date"
                  value={syncFromDate}
                  onChange={(e) => setSyncFromDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 glass-input rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">To Date</label>
                <input
                  type="date"
                  value={syncToDate}
                  onChange={(e) => setSyncToDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 glass-input rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Record Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={syncLimit}
                  onChange={(e) => setSyncLimit(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 glass-input rounded-lg text-xs font-mono text-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSyncTataManual}
                  disabled={isSyncingTata}
                  className="w-full px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-teal-500/20 disabled:opacity-50 active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTata ? 'animate-spin text-slate-950' : ''}`} />
                  <span>{isSyncingTata ? 'Syncing Now…' : 'Sync Calls Now'}</span>
                </button>
              </div>
            </div>

            {tataSyncResult && (
              <div
                className={`text-xs p-2.5 rounded-lg border font-medium flex items-center gap-2 ${
                  tataSyncResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {tataSyncResult.ok ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
                <span>{tataSyncResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================== */}
        {/* 2. CORPORATE SMTP EMAIL DISPATCH INTEGRATION               */}
        {/* ========================================================== */}
        <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-teal-500/15">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-teal-500/15 text-teal-300 border border-teal-500/30">
                <Server className="w-4 h-4 text-teal-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Corporate SMTP Email Gateway Configuration
                </h3>
                <p className="text-[11px] text-slate-300">
                  Connect your real corporate SMTP server (Office 365, Gmail App Password, AWS SES, SendGrid, or Exchange).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.smtp_configured
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.smtp_configured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>{integrations?.smtp_configured ? 'SMTP ACTIVE' : 'NO SMTP CONFIGURED'}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            {/* SMTP Host */}
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-200 mb-1">
                SMTP Server Host *
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="e.g. smtp.office365.com, smtp.gmail.com, email-smtp.us-east-1.amazonaws.com"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Mail relay hostname or IP address.
              </div>
            </div>

            {/* SMTP Port */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                SMTP Port *
              </label>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                587 (STARTTLS), 465 (Direct SSL), or 25.
              </div>
            </div>

            {/* SSL/TLS Toggle */}
            <div className="flex flex-col justify-end">
              <label className="block font-bold text-slate-200 mb-2">
                Security Mode
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-200 text-xs py-2 px-3 glass-inner rounded-xl border border-teal-500/20">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                  className="rounded text-teal-400 focus:ring-teal-400"
                />
                <span>Direct SSL (Port 465)</span>
              </label>
            </div>

            {/* SMTP Username */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                SMTP Username / Email
              </label>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="compliance@company.com"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Leave empty for open corporate IP relays.
              </div>
            </div>

            {/* SMTP Password */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                SMTP Password / App Password
              </label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={
                    integrations?.smtp_pass_set
                      ? '•••••••••••••••• (Configured — enter to update)'
                      : 'Enter SMTP password…'
                  }
                  className="w-full pl-3 pr-9 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Use an App Password if using Gmail/O365 MFA.
              </div>
            </div>

            {/* Default From Email */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                Default Sender Address (From)
              </label>
              <input
                type="email"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="compliance@auditeq.internal"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Sender address visible to recipients.
              </div>
            </div>

            {/* Default From Name */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                Sender Display Name
              </label>
              <input
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                placeholder="AuditEQ Compliance Desk"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white focus:border-teal-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Display name in the inbox &ldquo;From&rdquo; header.
              </div>
            </div>
          </div>

          {/* Test SMTP & Live Test Dispatch Controls */}
          <div className="p-3.5 glass-inner rounded-xl border border-teal-500/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={isTestingSmtp}
                  className="px-4 py-2 glass-inner hover:bg-teal-500/15 text-slate-200 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center gap-2 active:scale-95"
                >
                  {isTestingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" /> : <Zap className="w-3.5 h-3.5 text-teal-400" />}
                  <span>{isTestingSmtp ? 'Verifying Handshake…' : 'Test SMTP Handshake'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="Recipient for test email (e.g. your email)…"
                  className="flex-1 px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSendTestMail}
                  disabled={isSendingTestMail || !testRecipient}
                  className="px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-teal-500/20 disabled:opacity-50 active:scale-95 shrink-0"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingTestMail ? 'animate-spin' : ''}`} />
                  <span>{isSendingTestMail ? 'Dispatching…' : 'Send Test'}</span>
                </button>
              </div>
            </div>

            {smtpTestResult && (
              <div
                className={`text-xs p-3 rounded-xl border font-medium flex items-center gap-2 ${
                  smtpTestResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {smtpTestResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{smtpTestResult.message}</span>
              </div>
            )}

            {testMailResult && (
              <div
                className={`text-xs p-3 rounded-xl border font-medium flex items-center gap-2 ${
                  testMailResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {testMailResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{testMailResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================== */}
        {/* 3. PROCESSING ENGINE CONFIGURATION                         */}
        {/* ========================================================== */}
        <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-teal-500/15">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500/15 text-teal-300 border border-teal-500/30">
                <Sparkles className="w-4 h-4 text-teal-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Speech &amp; Compliance Audit Engine Models
                </h3>
                <p className="text-[11px] text-slate-300">
                  Powers speech-to-text transcription and SEBI regulatory compliance auditing.
                </p>
              </div>
            </div>

            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                integrations?.groq_configured
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  integrations?.groq_configured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>{integrations?.groq_configured ? 'ENGINE ACTIVE' : 'PENDING KEY'}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* ENGINE API KEY */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">
                ENGINE_API_KEY *
              </label>
              <div className="relative">
                <input
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder={
                    integrations?.groq_configured
                      ? '•••••••••••••••• (Configured — enter to update)'
                      : 'Enter Engine API Key…'
                  }
                  className="w-full pl-3 pr-9 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  title={showGroqKey ? 'Hide key' : 'Show key'}
                >
                  {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Private transcription &amp; compliance evaluation key.
              </div>
            </div>

            {/* Primary Transcription Model */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">Primary Transcription Model</label>
              <select
                value={transcriptionModel}
                onChange={(e) => setTranscriptionModel(e.target.value)}
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-semibold text-white cursor-pointer focus:border-teal-400 focus:outline-hidden"
              >
                <option value="whisper-large-v3">Accuracy-First Model (Recommended)</option>
                <option value="whisper-large-v3-turbo">Speed-Optimized Model</option>
              </select>
              <div className="text-[10px] text-slate-400 mt-1">
                Acoustic speech recognition model.
              </div>
            </div>

            {/* Primary Compliance Audit Model */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">Primary Compliance Audit Model</label>
              <select
                value={auditModel}
                onChange={(e) => setAuditModel(e.target.value)}
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-semibold text-white cursor-pointer focus:border-teal-400 focus:outline-hidden"
              >
                <option value="openai/gpt-oss-120b">Compliance Model 120B (Primary Strict Structured JSON)</option>
                <option value="openai/gpt-oss-20b">Compliance Model 20B (Structured Fast Fallback)</option>
              </select>
              <div className="text-[10px] text-slate-400 mt-1">
                Evaluation engine for Q1–Q5 compliance fact extraction.
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTestGroq}
                disabled={isTestingGroq}
                className="w-full px-4 py-2 glass-inner hover:bg-teal-500/15 text-slate-200 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Sparkles className={`w-3.5 h-3.5 text-teal-400 ${isTestingGroq ? 'animate-spin' : ''}`} />
                <span>{isTestingGroq ? 'Testing Connection…' : 'Test Engine Connection'}</span>
              </button>
            </div>
          </div>

          {groqTestResult && (
            <div className="p-3 glass-inner border border-teal-500/20 rounded-xl text-xs text-slate-300 font-mono">
              {groqTestResult}
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 4. ADVISOR EMAIL MAP & REGULATORY RUBRIC                  */}
        {/* ========================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Advisor Email Map Section */}
          <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-teal-400" />
              <span>Advisor &rarr; Email Mapping (JSON)</span>
            </h3>
            <p className="text-xs text-slate-300">
              Maps verified advisor names to approved email addresses for isolated scorecard delivery.
            </p>
            <textarea
              rows={5}
              value={advisorMap}
              onChange={(e) => setAdvisorMap(e.target.value)}
              className="w-full p-3 glass-input rounded-xl font-mono text-xs text-white focus:border-teal-400 focus:outline-hidden"
            />
          </div>

          {/* Audit Rubric JSON */}
          <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>5-Question Compliance Rubric (JSON)</span>
            </h3>
            <p className="text-xs text-slate-300">
              Q1, Q2, and Q5 are designated as <b>FATAL</b> compliance parameters.
            </p>
            <textarea
              rows={5}
              value={rubricText}
              onChange={(e) => setRubricText(e.target.value)}
              className="w-full p-3 glass-input rounded-xl font-mono text-xs text-white focus:border-teal-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* ========================================================== */}
        {/* SAVE ALL SETTINGS BUTTON                                  */}
        {/* ========================================================== */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 glass-panel rounded-2xl shadow-xl border border-teal-500/20">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-teal-500/25 transition-all cursor-pointer flex items-center gap-2 border border-teal-300/40 active:scale-95"
          >
            <Save className="w-4 h-4 text-slate-950" />
            <span>Save All Integration Settings</span>
          </button>

          {saveStatus && (
            <span className="text-xs font-semibold text-teal-200 glass-inner px-3 py-1.5 rounded-lg border border-teal-500/30">
              {saveStatus}
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
