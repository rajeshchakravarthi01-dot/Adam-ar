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

  // Tata Teleservices Enterprise State (Manual Setup)
  const [tataKey, setTataKey] = useState('');
  const [showTataKey, setShowTataKey] = useState(false);
  const [tataAccountId, setTataAccountId] = useState('');
  const [tataApiUrl, setTataApiUrl] = useState('https://api-smartflo.tatateleservices.com/v1');
  const [tataTestResult, setTataTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingTata, setIsTestingTata] = useState(false);

  // Manual Tata Sync Controls
  const [syncFromDate, setSyncFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncToDate, setSyncToDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncLimit, setSyncLimit] = useState(50);
  const [isSyncingTata, setIsSyncingTata] = useState(false);
  const [tataSyncResult, setTataSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

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
      if (integrations.tata_account_id) {
        setTataAccountId(integrations.tata_account_id);
      }
      if (integrations.tata_api_url) {
        setTataApiUrl(integrations.tata_api_url);
      }
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

  const handleSaveTataOnly = async () => {
    setSaveStatus('Saving Tata Teleservices credentials…');
    try {
      const payload: Record<string, string> = {
        tata_account_id: tataAccountId.trim(),
        tata_api_url: tataApiUrl.trim(),
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
      };

      if (groqKey.trim()) {
        payload.groq_key = groqKey.trim();
      }

      if (tataKey.trim()) {
        payload.tata_api_key = tataKey.trim();
      }

      await onSaveIntegrations(payload);
      setSaveStatus('All integration settings (Processing Engine & Tata Teleservices) saved successfully.');
      setGroqKey('');
      setTataKey('');
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
              <span>Integrations &amp; Telephony Gateway Setup</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manually manage your Tata Teleservices Enterprise telephony keys and Speech/Audit models. No automatic background imports are forced.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-amber-400/10 text-amber-900 px-3 py-1 rounded-full border border-amber-400/30 flex items-center gap-1.5 shrink-0 self-start">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Encrypted Server-Side Storage</span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================== */}
        {/* 1. TATA TELESERVICES ENTERPRISE SECTION (MANUAL SETUP)     */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Radio className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Tata Teleservices Enterprise (Manual API Setup)
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Direct connection to Tata Smartflo / Enterprise voice recording gateway.
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
                <span>{integrations?.tata_configured ? 'KEY CONFIGURED' : 'PENDING CREDENTIALS'}</span>
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-neutral-950 text-neutral-200 rounded-xl border border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Key className="w-3.5 h-3.5" />
              <span>Manual Web Telephony Credentials</span>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Enter your <strong>TATA_API_KEY</strong>, <strong>TATA_ACCOUNT_ID</strong>, and <strong>TATA_API_URL</strong> directly below.
              They are stored locally in the secure database. You do not need to set platform environment variables or AI Studio secrets.
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
                      ? '•••••••••••••••• (Configured — enter to update)'
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

          {/* Test & Save Tata Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveTataOnly}
                disabled={isLoading}
                className="px-4 py-2 bg-neutral-950 hover:bg-black text-amber-400 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Tata Credentials</span>
              </button>

              <button
                type="button"
                onClick={handleTestTata}
                disabled={isTestingTata}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                <Radio className={`w-3.5 h-3.5 text-amber-500 ${isTestingTata ? 'animate-spin' : ''}`} />
                <span>{isTestingTata ? 'Testing Tata Gateway…' : 'Test Tata Connection'}</span>
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
                {tataTestResult.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                <span>{tataTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Manual On-Demand Sync Box */}
          <div className="mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                <span>Manual Call Sync on Demand</span>
              </h4>
              <span className="text-[10px] text-neutral-500 font-medium">
                Sync is completely manual — never runs unprompted.
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
                <label className="block text-neutral-600 font-medium mb-1">Record Limit</label>
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
                  <span>{isSyncingTata ? 'Syncing Now…' : 'Sync Calls Now'}</span>
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
        {/* 2. PROCESSING ENGINE CONFIGURATION (MANUAL SETUP)          */}
        {/* ========================================================== */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Processing Engine Configuration (Manual API Setup)
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Powers speech-to-text and SEBI regulatory compliance auditing.
                </p>
              </div>
            </div>

            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                integrations?.groq_configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  integrations?.groq_configured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{integrations?.groq_configured ? 'ACTIVE: CONFIGURED' : 'PENDING KEY'}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* ENGINE API KEY */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
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
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showGroqKey ? 'Hide key' : 'Show key'}
                >
                  {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">
                Private transcription &amp; compliance evaluation key.
              </div>
            </div>

            {/* Primary Transcription Model */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Primary Transcription Model</label>
              <select
                value={transcriptionModel}
                onChange={(e) => setTranscriptionModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="whisper-large-v3">Accuracy-First Model (Recommended)</option>
                <option value="whisper-large-v3-turbo">Speed-Optimized Model</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Acoustic speech recognition model.
              </div>
            </div>

            {/* Primary Compliance Audit Model */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">Primary Compliance Audit Model</label>
              <select
                value={auditModel}
                onChange={(e) => setAuditModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:border-amber-400 focus:outline-hidden cursor-pointer"
              >
                <option value="openai/gpt-oss-120b">Compliance Model 120B (Primary Strict Structured JSON)</option>
                <option value="openai/gpt-oss-20b">Compliance Model 20B (Structured Fast Fallback)</option>
              </select>
              <div className="text-[10px] text-neutral-400 mt-1">
                Evaluation engine for Q1–Q4 compliance fact extraction.
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTestGroq}
                disabled={isTestingGroq}
                className="w-full px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${isTestingGroq ? 'animate-spin' : ''}`} />
                <span>{isTestingGroq ? 'Testing Connection…' : 'Test Engine Connection'}</span>
              </button>
            </div>
          </div>

          {groqTestResult && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-700 font-mono">
              {groqTestResult}
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 3. ADVISOR EMAIL MAP & REGULATORY RUBRIC                  */}
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
