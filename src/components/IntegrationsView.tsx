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
  Clock,
  Send,
  Mic,
  Cpu,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { api } from '../lib/api';
import type { SystemIntegrations } from '../types';

interface IntegrationsViewProps {
  integrations: SystemIntegrations | null;
  onSaveIntegrations: (data: Record<string, string>) => Promise<void>;
  onTestGroq?: (key?: string) => Promise<boolean>;
  onTestSarvam?: (key?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  onTestAudit?: (key?: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  isLoading: boolean;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onSaveIntegrations,
  onTestGroq,
  onTestSarvam,
  onTestAudit,
  isLoading,
}) => {
  // Sarvam AI Speech-to-Text State (https://www.sarvam.ai/)
  const [sarvamKey, setSarvamKey] = useState('');
  const [showSarvamKey, setShowSarvamKey] = useState(false);
  const [sarvamModel, setSarvamModel] = useState('saaras:v3');
  const [sarvamMode, setSarvamMode] = useState('codemix');
  const [sarvamLanguage, setSarvamLanguage] = useState('hi-IN');
  const [sarvamTestResult, setSarvamTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingSarvam, setIsTestingSarvam] = useState(false);

  // GPT-OSS Compliance Audit Engine State
  const [auditKey, setAuditKey] = useState('');
  const [showAuditKey, setShowAuditKey] = useState(false);
  const [auditModel, setAuditModel] = useState('openai/gpt-oss-120b');
  const [auditTestResult, setAuditTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingAudit, setIsTestingAudit] = useState(false);

  // Legacy Groq State (optional fallback)
  const [groqKey, setGroqKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [transcriptionModel, setTranscriptionModel] = useState('whisper-large-v3');
  const [groqTestResult, setGroqTestResult] = useState<string | null>(null);
  const [isTestingGroq, setIsTestingGroq] = useState(false);

  // Tata Teleservices Enterprise State
  const [tataKey, setTataKey] = useState('');
  const [showTataKey, setShowTataKey] = useState(false);
  const [tataAccountId, setTataAccountId] = useState('');
  const [tataApiUrl, setTataApiUrl] = useState('https://api-smartflo.tatateleservices.com/v1');
  const [tataAutoSyncEnabled, setTataAutoSyncEnabled] = useState(false);
  const [tataSyncIntervalMins, setTataSyncIntervalMins] = useState('30');
  const [tataTestResult, setTataTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingTata, setIsTestingTata] = useState(false);

  // Manual Tata Sync Controls
  const [syncFromDate, setSyncFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncToDate, setSyncToDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncLimit, setSyncLimit] = useState(50);
  const [isSyncingTata, setIsSyncingTata] = useState(false);
  const [tataSyncResult, setTataSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  // SMTP Email Server State
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Other Settings
  const [advisorMap, setAdvisorMap] = useState('');
  const [rubricText, setRubricText] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (integrations) {
      if (integrations.sarvam_transcription_model) {
        setSarvamModel(integrations.sarvam_transcription_model);
      }
      if (integrations.sarvam_transcription_mode) {
        setSarvamMode(integrations.sarvam_transcription_mode);
      }
      if (integrations.sarvam_language_code) {
        setSarvamLanguage(integrations.sarvam_language_code);
      }
      setAuditModel(integrations.audit_model || integrations.groq_audit_model || 'openai/gpt-oss-120b');
      setTranscriptionModel(integrations.groq_transcription_model || 'whisper-large-v3');
      setAdvisorMap(integrations.advisor_email_map || '{}');
      setRubricText(integrations.audit_rubric_json || '');
      if (integrations.tata_account_id) {
        setTataAccountId(integrations.tata_account_id);
      }
      if (integrations.tata_api_url) {
        setTataApiUrl(integrations.tata_api_url);
      }
      setTataAutoSyncEnabled(Boolean(integrations.tata_auto_sync_enabled));
      if (integrations.tata_sync_interval_mins) {
        setTataSyncIntervalMins(integrations.tata_sync_interval_mins);
      }
      if (integrations.smtp_host) setSmtpHost(integrations.smtp_host);
      if (integrations.smtp_port) setSmtpPort(integrations.smtp_port);
      if (integrations.smtp_user) setSmtpUser(integrations.smtp_user);
      if (integrations.smtp_from_email) setSmtpFrom(integrations.smtp_from_email);
      if (integrations.smtp_from_name) setSmtpFromName(integrations.smtp_from_name);
      setSmtpSecure(integrations.smtp_encryption === 'SSL/TLS');
    }
  }, [integrations]);

  const handleTestSarvam = async () => {
    setIsTestingSarvam(true);
    setSarvamTestResult(null);
    try {
      if (onTestSarvam) {
        const res = await onTestSarvam(sarvamKey.trim() || undefined);
        if (res.ok) {
          setSarvamTestResult({
            ok: true,
            message: res.message || 'Sarvam AI Speech-to-Text verified. Saaras v3 multilingual diarization active.',
          });
        } else {
          setSarvamTestResult({
            ok: false,
            message: res.error || 'Sarvam AI verification failed. Please verify your api-subscription-key.',
          });
        }
      } else {
        const res = await api.testSarvam(sarvamKey.trim() || undefined);
        if (res.ok) {
          setSarvamTestResult({
            ok: true,
            message: res.message || 'Sarvam AI Speech-to-Text verified. Saaras v3 multilingual diarization active.',
          });
        } else {
          setSarvamTestResult({
            ok: false,
            message: res.error || 'Sarvam AI verification failed.',
          });
        }
      }
    } catch (err: unknown) {
      setSarvamTestResult({
        ok: false,
        message: `Connection error: ${(err as Error).message}`,
      });
    } finally {
      setIsTestingSarvam(false);
    }
  };

  const handleTestAuditEngine = async () => {
    setIsTestingAudit(true);
    setAuditTestResult(null);
    try {
      if (onTestAudit) {
        const res = await onTestAudit(auditKey.trim() || undefined);
        if (res.ok) {
          setAuditTestResult({
            ok: true,
            message: res.message || 'GPT-OSS Audit Engine API connection verified.',
          });
        } else {
          setAuditTestResult({
            ok: false,
            message: res.error || 'Audit Engine verification failed. Note: The pipeline uses high-precision deterministic scoring if API key is rate-limited.',
          });
        }
      } else {
        const res = await api.testAuditEngine(auditKey.trim() || undefined);
        if (res.ok) {
          setAuditTestResult({
            ok: true,
            message: res.message || 'GPT-OSS Audit Engine API connection verified.',
          });
        } else {
          setAuditTestResult({
            ok: false,
            message: res.error || 'Audit Engine key check failed.',
          });
        }
      }
    } catch (err: unknown) {
      setAuditTestResult({
        ok: false,
        message: `Connection error: ${(err as Error).message}`,
      });
    } finally {
      setIsTestingAudit(false);
    }
  };

  const handleTestGroq = async () => {
    setIsTestingGroq(true);
    setGroqTestResult('Testing connection to Groq API…');
    try {
      if (onTestGroq) {
        const ok = await onTestGroq(groqKey.trim() || undefined);
        if (ok) {
          setGroqTestResult('Groq connection verified successfully! Whisper & GPT-OSS models active.');
        } else {
          setGroqTestResult('Groq test failed: Please check your GROQ_API_KEY.');
        }
      } else {
        const res = await api.testGroq(groqKey.trim() || undefined);
        if (res.ok) {
          setGroqTestResult('Groq connection verified successfully!');
        } else {
          setGroqTestResult(`Groq test failed: ${res.error || 'Unknown error'}`);
        }
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
          message: res.message || 'Connected to Tata Teleservices Smartflo API successfully!',
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

  const handleTestSmtp = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await api.testSmtpConnection({
        host: smtpHost.trim() || undefined,
        port: parseInt(smtpPort, 10) || 587,
        user: smtpUser.trim() || undefined,
        pass: smtpPass.trim() || undefined,
        secure: smtpSecure,
      });
      if (res.ok) {
        setSmtpTestResult({
          ok: true,
          message: res.message || 'SMTP handshake succeeded! Outbound dispatch verified.',
        });
      } else {
        setSmtpTestResult({
          ok: false,
          message: res.error || 'SMTP connection failed. Check host, port, credentials, and TLS.',
        });
      }
    } catch (err: unknown) {
      setSmtpTestResult({
        ok: false,
        message: `SMTP error: ${(err as Error).message}`,
      });
    } finally {
      setIsTestingSmtp(false);
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
        message: res.message || `Successfully synced ${res.synced_count} recording(s) from Tata Smartflo (${res.duplicates_skipped || 0} duplicates skipped).`,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving integration parameters…');
    try {
      const payload: Record<string, string> = {
        transcription_provider: 'sarvam',
        sarvam_transcription_model: sarvamModel,
        sarvam_transcription_mode: sarvamMode,
        sarvam_language_code: sarvamLanguage,
        audit_model: auditModel,
        groq_audit_model: auditModel,
        groq_transcription_model: transcriptionModel,
        advisor_email_map: advisorMap,
        audit_rubric_json: rubricText,
        tata_account_id: tataAccountId.trim(),
        tata_api_url: tataApiUrl.trim(),
        tata_auto_sync_enabled: String(tataAutoSyncEnabled),
        tata_sync_interval_mins: tataSyncIntervalMins,
        smtp_host: smtpHost.trim(),
        smtp_port: smtpPort.trim(),
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
        smtp_from_name: smtpFromName.trim(),
        smtp_secure: String(smtpSecure),
      };

      if (sarvamKey.trim()) {
        payload.sarvam_key = sarvamKey.trim();
      }

      if (auditKey.trim()) {
        payload.audit_api_key = auditKey.trim();
        payload.groq_key = auditKey.trim();
      }

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
      setSaveStatus('All integration settings (Sarvam AI, GPT-OSS, Tata, SMTP & Rubric) saved securely.');
      setSarvamKey('');
      setAuditKey('');
      setGroqKey('');
      setTataKey('');
      setSmtpPass('');
    } catch (err: unknown) {
      setSaveStatus(`Save failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-black text-amber-400">
                <Sliders className="w-4 h-4" />
              </span>
              <span>Enterprise Integration Hub</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Secure gateway management for Tata Teleservices Smartflo telephony, Groq AI ASR/Auditing, and Outbound SMTP Email dispatch.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-amber-400/10 text-amber-900 px-3 py-1 rounded-full border border-amber-400/30 flex items-center gap-1.5 shrink-0 self-start">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Encrypted Server-Side Credentials</span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================== */}
        {/* 1. TATA TELESERVICES ENTERPRISE SECTION                   */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Radio className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Tata Teleservices Smartflo Enterprise Telephony
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Direct REST API connection for voice CDR ingestion and recording audio retrieval.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.tata_configured
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.tata_configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{integrations?.tata_configured ? 'GATEWAY CONNECTED' : 'PENDING CREDENTIALS'}</span>
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-neutral-950 text-neutral-200 rounded-xl border border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Key className="w-3.5 h-3.5" />
                <span>Tata Smartflo Enterprise Credentials</span>
              </div>
              {integrations?.tata_last_test_timestamp && (
                <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Last Verified: {new Date(integrations.tata_last_test_timestamp).toLocaleString()} ({integrations.tata_last_test_status || 'OK'})</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Configure your <strong>TATA_API_KEY</strong>, <strong>TATA_ACCOUNT_ID</strong>, and <strong>TATA_API_URL</strong>. All API secrets are encrypted at rest on the server.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* TATA API KEY */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                TATA_API_KEY *
              </label>
              <div className="relative">
                <input
                  type={showTataKey ? 'text' : 'password'}
                  value={tataKey}
                  onChange={(e) => setTataKey(e.target.value)}
                  placeholder={
                    integrations?.tata_configured
                      ? '•••••••••••••••• (Stored Securely — enter to update)'
                      : 'Enter Tata API Key / Token…'
                  }
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowTataKey(!showTataKey)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showTataKey ? 'Hide key' : 'Show key'}
                >
                  {showTataKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">
                Bearer authorization token for Smartflo REST API.
              </div>
            </div>

            {/* TATA ACCOUNT ID */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                TATA_ACCOUNT_ID
              </label>
              <input
                type="text"
                value={tataAccountId}
                onChange={(e) => setTataAccountId(e.target.value)}
                placeholder="e.g. SMARTFLO_CORP_902"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-neutral-400 mt-1">
                Tenant or Billing Account Identifier.
              </div>
            </div>

            {/* TATA API URL */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                TATA_API_URL
              </label>
              <input
                type="text"
                value={tataApiUrl}
                onChange={(e) => setTataApiUrl(e.target.value)}
                placeholder="https://api-smartflo.tatateleservices.com/v1"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
              <div className="text-[10px] text-neutral-400 mt-1">
                Gateway base URL (defaults to Smartflo v1).
              </div>
            </div>
          </div>

          {/* Auto-Sync Schedule Configuration */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-900">
                <input
                  type="checkbox"
                  checked={tataAutoSyncEnabled}
                  onChange={(e) => setTataAutoSyncEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-neutral-300 cursor-pointer"
                />
                <span>Enable Scheduled Background Auto-Sync</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-neutral-600 font-medium">Sync Frequency:</span>
                <select
                  value={tataSyncIntervalMins}
                  onChange={(e) => setTataSyncIntervalMins(e.target.value)}
                  disabled={!tataAutoSyncEnabled}
                  className="px-2.5 py-1 bg-white border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-800 disabled:opacity-50"
                >
                  <option value="15">Every 15 minutes</option>
                  <option value="30">Every 30 minutes (Standard)</option>
                  <option value="60">Every 1 hour</option>
                  <option value="120">Every 2 hours</option>
                  <option value="360">Every 6 hours</option>
                  <option value="1440">Once daily (24h)</option>
                </select>
              </div>
            </div>

            {integrations?.tata_last_sync_timestamp && (
              <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Last Automated Sync: <strong>{new Date(integrations.tata_last_sync_timestamp).toLocaleString()}</strong></span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full font-bold bg-neutral-200 text-neutral-800">
                    Status: {integrations.tata_last_sync_status || 'IDLE'}
                  </span>
                  {integrations.tata_last_sync_count !== undefined && (
                    <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      {integrations.tata_last_sync_count} calls imported
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Test Tata Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestTata}
                disabled={isTestingTata}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                <Radio className={`w-3.5 h-3.5 text-amber-500 ${isTestingTata ? 'animate-spin' : ''}`} />
                <span>{isTestingTata ? 'Verifying Tata Gateway…' : 'Test Tata Connection'}</span>
              </button>
            </div>

            {tataTestResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  tataTestResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                {tataTestResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
                <span>{tataTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Manual On-Demand Multi-Page Sync Box */}
          <div className="mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                <span>Manual Multi-Page Call Backfill &amp; Sync</span>
              </h4>
              <span className="text-[10px] text-neutral-500 font-medium">
                Paginates Tata records, detects rate limits, and skips existing call IDs.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-neutral-600 font-medium mb-1">From Date</label>
                <input
                  type="date"
                  value={syncFromDate}
                  onChange={(e) => setSyncFromDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-neutral-600 font-medium mb-1">To Date</label>
                <input
                  type="date"
                  value={syncToDate}
                  onChange={(e) => setSyncToDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-neutral-600 font-medium mb-1">Record Limit (Max 500)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={syncLimit}
                  onChange={(e) => setSyncLimit(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSyncTataManual}
                  disabled={isSyncingTata}
                  className="w-full px-4 py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTata ? 'animate-spin text-amber-400' : ''}`} />
                  <span>{isSyncingTata ? 'Syncing Pages…' : 'Sync Calls Now'}</span>
                </button>
              </div>
            </div>

            {tataSyncResult && (
              <div
                className={`text-xs p-2.5 rounded-lg border font-medium flex items-center gap-2 ${
                  tataSyncResult.ok
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                {tataSyncResult.ok ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
                <span>{tataSyncResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================== */}
        {/* 2. SARVAM AI SPEECH-TO-TEXT & DIARIZATION (https://sarvam.ai) */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Mic className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-neutral-900">
                    Sarvam AI Speech-to-Text &amp; Diarization Engine
                  </h3>
                  <a
                    href="https://www.sarvam.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-semibold underline"
                    title="Visit Sarvam AI Official Website"
                  >
                    <span>sarvam.ai</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Purpose-built Indian languages (Hindi, Hinglish, Indian English) speech recognition with native speaker diarization.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {integrations?.sarvam_last_test_timestamp && (
                <span className="text-[10px] text-neutral-400 hidden sm:inline-block">
                  Last Test: {new Date(integrations.sarvam_last_test_timestamp).toLocaleTimeString()} ({integrations.sarvam_last_test_status || 'OK'})
                </span>
              )}
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.sarvam_configured
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.sarvam_configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{integrations?.sarvam_configured ? 'ACTIVE: SARVAM AI' : 'PENDING KEY'}</span>
              </span>
            </div>
          </div>

          <div className="p-3 bg-neutral-950 text-neutral-200 rounded-xl border border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Activity className="w-3.5 h-3.5" />
                <span>Multilingual Indian ASR &amp; Diarization Pipeline</span>
              </div>
              <span className="text-[10px] text-neutral-400">Batch STT API (Job v1) + Synchronous Fallback</span>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Integrates official Sarvam AI (<code className="text-amber-400">api-subscription-key</code>) with Saaras v3. Automatically diarizes Advisor (<code className="text-emerald-400">SPEAKER_0</code>) and Client (<code className="text-blue-400">SPEAKER_1</code>) with code-mixed Hinglish recognition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* SARVAM API KEY */}
            <div className="md:col-span-2">
              <label className="block font-bold text-neutral-800 mb-1">
                SARVAM_API_KEY (api-subscription-key) *
              </label>
              <div className="relative">
                <input
                  type={showSarvamKey ? 'text' : 'password'}
                  value={sarvamKey}
                  onChange={(e) => setSarvamKey(e.target.value)}
                  placeholder={
                    integrations?.sarvam_configured
                      ? (integrations.sarvam_key_masked || 'sk_bl18l2w6••••••••••••••••SA5A') + ' (Configured — enter to change)'
                      : 'sk_... (Enter Sarvam AI Subscription Key)'
                  }
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowSarvamKey(!showSarvamKey)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showSarvamKey ? 'Hide key' : 'Show key'}
                >
                  {showSarvamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">
                From <a href="https://dashboard.sarvam.ai/" target="_blank" rel="noreferrer" className="underline text-amber-600">Sarvam AI Dashboard</a>. Pre-configured active default key loaded.
              </div>
            </div>

            {/* Transcription Model */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Transcription Model</label>
              <select
                value={sarvamModel}
                onChange={(e) => setSarvamModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="saaras:v3">saaras:v3 (State-of-the-Art Multilingual &amp; Diarization)</option>
                <option value="saaras:v2.5">saaras:v2.5 (Standard Multilingual STT)</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Saaras v3 provides native 2-speaker diarization.
              </div>
            </div>

            {/* Speech Mode */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Speech Mode</label>
              <select
                value={sarvamMode}
                onChange={(e) => setSarvamMode(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="codemix">codemix (Hinglish / Hindi-English Mixed [Recommended])</option>
                <option value="transcribe">transcribe (Verbatim Native Script)</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Essential for Hindi/English financial stock dialogues.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
            {/* Language Code */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Primary Language Code</label>
              <select
                value={sarvamLanguage}
                onChange={(e) => setSarvamLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="hi-IN">hi-IN (Hindi &amp; Hinglish Code-Switched [Default])</option>
                <option value="en-IN">en-IN (Indian English)</option>
                <option value="auto">auto (Automatic Language Identification)</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Optimized for Indian trading desk audio.
              </div>
            </div>

            {/* Test Sarvam Connection Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTestSarvam}
                disabled={isTestingSarvam}
                className="w-full px-4 py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold rounded-xl border border-neutral-800 text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                <Mic className={`w-3.5 h-3.5 text-amber-400 ${isTestingSarvam ? 'animate-spin' : ''}`} />
                <span>{isTestingSarvam ? 'Testing Sarvam AI API…' : 'Test Sarvam AI Connection'}</span>
              </button>
            </div>
          </div>

          {sarvamTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
                sarvamTestResult.ok
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {sarvamTestResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{sarvamTestResult.message}</span>
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 3. GPT-OSS REGULATORY COMPLIANCE AUDIT ENGINE              */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Cpu className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  GPT-OSS Regulatory Compliance Audit &amp; Scoring Engine
                </h3>
                <p className="text-[11px] text-neutral-500">
                  SEBI offline pre-order compliance evaluation (Q1–Q5), non-negotiable verification, and scorecard generation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.audit_configured || integrations?.groq_configured
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.audit_configured || integrations?.groq_configured ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{integrations?.audit_configured || integrations?.groq_configured ? 'ACTIVE: GPT-OSS 120B' : 'STANDALONE DETERMINISTIC'}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* AUDIT ENGINE API KEY */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                AUDIT_API_KEY (GPT-OSS / Groq Key)
              </label>
              <div className="relative">
                <input
                  type={showAuditKey ? 'text' : 'password'}
                  value={auditKey}
                  onChange={(e) => setAuditKey(e.target.value)}
                  placeholder={
                    integrations?.audit_key_masked
                      ? `${integrations.audit_key_masked} (Configured — enter to change)`
                      : 'gsk_... (Default Key Configured)'
                  }
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowAuditKey(!showAuditKey)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showAuditKey ? 'Hide key' : 'Show key'}
                >
                  {showAuditKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">
                Used for GPT-OSS 120B structured compliance extraction.
              </div>
            </div>

            {/* Primary Compliance Audit Model */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Audit Reasoning Model</label>
              <select
                value={auditModel}
                onChange={(e) => setAuditModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Primary Strict Structured JSON)</option>
                <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (High-speed Fallback)</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Evaluates Q1–Q5 with SEBI regulatory non-negotiables.
              </div>
            </div>

            {/* Test Audit Connection Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTestAuditEngine}
                disabled={isTestingAudit}
                className="w-full px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Cpu className={`w-3.5 h-3.5 text-amber-600 ${isTestingAudit ? 'animate-spin' : ''}`} />
                <span>{isTestingAudit ? 'Verifying Audit Engine…' : 'Test Audit Engine Connection'}</span>
              </button>
            </div>
          </div>

          {auditTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
                auditTestResult.ok
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}
            >
              {auditTestResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{auditTestResult.message}</span>
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 3. OUTBOUND SMTP EMAIL GATEWAY                            */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Mail className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Outbound SMTP Email Gateway
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Encrypted SMTP credentials for automated dispatch of SEBI compliance scorecards.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {integrations?.smtp_last_test_timestamp && (
                <span className="text-[10px] text-neutral-400 hidden sm:inline-block">
                  Last Test: {new Date(integrations.smtp_last_test_timestamp).toLocaleTimeString()} ({integrations.smtp_last_test_status || 'OK'})
                </span>
              )}
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                  integrations?.smtp_host
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    integrations?.smtp_host ? 'bg-emerald-500' : 'bg-neutral-400'
                  }`}
                />
                <span>{integrations?.smtp_host ? 'SMTP CONFIGURED' : 'OPTIONAL SMTP'}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* SMTP HOST */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                SMTP Host
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com or mail.fundsindia.com"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            {/* SMTP PORT */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                SMTP Port
              </label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587 (STARTTLS) or 465 (SSL)"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            {/* ENCRYPTION TOGGLE */}
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-neutral-300 cursor-pointer"
                />
                <span>Enforce Direct SSL/TLS (Port 465)</span>
              </label>
            </div>

            {/* SMTP USER */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                SMTP Username / User Email
              </label>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="compliance@fundsindia.com"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            {/* SMTP PASSWORD */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                SMTP Password / App Password
              </label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={
                    integrations?.smtp_host
                      ? '•••••••••••••••• (Stored Securely — enter to change)'
                      : 'Enter app password or SMTP token…'
                  }
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showSmtpPass ? 'Hide password' : 'Show password'}
                >
                  {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* FROM EMAIL */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                From Address
              </label>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="compliance@auditeq.internal"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestSmtp}
              disabled={isTestingSmtp}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <Mail className={`w-3.5 h-3.5 text-amber-500 ${isTestingSmtp ? 'animate-spin' : ''}`} />
              <span>{isTestingSmtp ? 'Testing SMTP Handshake…' : 'Test SMTP Connection'}</span>
            </button>

            {smtpTestResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  smtpTestResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                {smtpTestResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
                <span>{smtpTestResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================== */}
        {/* 4. ADVISOR EMAIL MAP & REGULATORY RUBRIC                  */}
        {/* ========================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Advisor Email Map Section */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-500" />
              <span>Advisor &rarr; Email Mapping (JSON)</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Maps verified advisor names to approved email addresses for isolated scorecard delivery.
            </p>
            <textarea
              rows={5}
              value={advisorMap}
              onChange={(e) => setAdvisorMap(e.target.value)}
              className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-xs text-neutral-900 focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          {/* Audit Rubric JSON */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>5-Question Compliance Rubric (JSON)</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Q1, Q2, and Q5 are designated as <b>FATAL</b> compliance parameters.
            </p>
            <textarea
              rows={5}
              value={rubricText}
              onChange={(e) => setRubricText(e.target.value)}
              className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-xs text-neutral-900 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* ========================================================== */}
        {/* SAVE ALL SETTINGS BUTTON                                  */}
        {/* ========================================================== */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-neutral-200 shadow-xs">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 bg-neutral-950 hover:bg-black disabled:opacity-50 text-amber-400 font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-2 border border-amber-400/30"
          >
            <Save className="w-4 h-4 text-amber-400" />
            <span>Save All Integration Settings</span>
          </button>

          {saveStatus && (
            <span className="text-xs font-semibold text-neutral-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-300">
              {saveStatus}
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
