import React, { useState, useEffect } from 'react';
import {
  Radio,
  Key,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  PhoneCall,
  Save,
  ShieldCheck,
  Download,
  Check,
  X,
  ArrowRight,
  Copy,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import type { SystemIntegrations, CallRecord } from '../types';

interface TataViewProps {
  integrations: SystemIntegrations | null;
  calls: CallRecord[];
  onSaveIntegrations: (data: Record<string, string>) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
}

export const TataView: React.FC<TataViewProps> = ({
  integrations,
  calls,
  onSaveIntegrations,
  onRefresh,
  isLoading,
}) => {
  const [tataKey, setTataKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [accountId, setAccountId] = useState(integrations?.tata_account_id || '');
  const [apiUrl, setApiUrl] = useState(integrations?.tata_api_url || 'https://api-smartflo.tatateleservices.com/v1');
  const [webhookSecret, setWebhookSecret] = useState(integrations?.tata_webhook_secret || '');
  const [showSecret, setShowSecret] = useState(false);

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [syncFromDate, setSyncFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncToDate, setSyncToDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncLimit, setSyncLimit] = useState(50);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState(false);
  const [webhookSimResult, setWebhookSimResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (integrations) {
      if (integrations.tata_account_id) setAccountId(integrations.tata_account_id);
      if (integrations.tata_api_url) setApiUrl(integrations.tata_api_url);
      if (integrations.tata_webhook_secret) setWebhookSecret(integrations.tata_webhook_secret);
    }
  }, [integrations]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving credentials…');
    try {
      const payload: Record<string, string> = {
        tata_account_id: accountId.trim(),
        tata_api_url: apiUrl.trim(),
        tata_webhook_secret: webhookSecret.trim(),
      };
      if (tataKey.trim()) {
        payload.tata_api_key = tataKey.trim();
      }
      await onSaveIntegrations(payload);
      setSaveStatus('Tata Teleservices credentials saved successfully.');
      setTataKey('');
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      setSaveStatus(`Save error: ${(err as Error).message}`);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testTata({
        api_key: tataKey.trim() || undefined,
        account_id: accountId.trim() || undefined,
        api_url: apiUrl.trim() || undefined,
      });
      if (res.ok) {
        setTestResult({
          ok: true,
          message: res.message || 'Connected to Tata Teleservices Smartflo API successfully.',
        });
        if (onRefresh) await onRefresh();
      } else {
        setTestResult({
          ok: false,
          message: res.error || 'Connection failed: Check Tata credentials.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: `Connection error: ${(err as Error).message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSimulateWebhook = async () => {
    setIsSimulatingWebhook(true);
    setWebhookSimResult(null);
    try {
      const res = await api.simulateTataWebhook({
        client_number: '+919876543210',
        agent_name: 'Smartflo QA Agent',
        duration: 52,
      });
      if (res.ok) {
        setWebhookSimResult({
          ok: true,
          message: `Webhook event ingested as Call #${res.call_id}. Audio pipeline enqueued.`,
        });
        if (onRefresh) await onRefresh();
      } else {
        setWebhookSimResult({
          ok: false,
          message: res.message || 'Webhook simulation failed.',
        });
      }
    } catch (err: unknown) {
      setWebhookSimResult({
        ok: false,
        message: `Simulation error: ${(err as Error).message}`,
      });
    } finally {
      setIsSimulatingWebhook(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncTata({
        from_date: syncFromDate,
        to_date: syncToDate,
        limit: Number(syncLimit) || 50,
        api_key: tataKey.trim() || undefined,
        account_id: accountId.trim() || undefined,
        api_url: apiUrl.trim() || undefined,
      });
      setSyncResult({
        ok: true,
        message: res.message || `Successfully synced ${res.synced_count} call recording(s).`,
      });
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      setSyncResult({
        ok: false,
        message: `Sync failed: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/tata/webhook` : '/api/tata/webhook';

  // Filter calls ingested from Tata
  const tataCalls = calls.filter((c) => (c.source || '').toLowerCase().includes('tata'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
                <Radio className="w-4 h-4" />
              </span>
              <span>Tata Teleservices Enterprise Telephony</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Production connection to Tata Smartflo cloud telephony. Real-time webhooks, encrypted credential storage, automated multi-page pagination, and on-demand sync.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                integrations?.tata_configured
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                  : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  integrations?.tata_configured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>{integrations?.tata_configured ? 'GATEWAY CONFIGURED' : 'PENDING CREDENTIALS'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Manual Credentials Form */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-4">
        <div className="border-b border-teal-500/15 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-teal-400" />
            <span>Smartflo Telephony API Credentials</span>
          </h3>
          <span className="text-xs text-slate-400">Secure in-app database persistence</span>
        </div>

        <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-start gap-2.5 text-xs text-slate-200">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-teal-300">Direct Enterprise Handshake:</span> Enter your <strong>TATA_API_KEY</strong>, <strong>TATA_ACCOUNT_ID</strong>, and <strong>TATA_API_URL</strong> below. S3 pre-signed URLs, chunked binary streams, and webhook signature verifications are fully supported.
          </div>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* TATA API KEY */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">TATA_API_KEY *</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={tataKey}
                  onChange={(e) => setTataKey(e.target.value)}
                  placeholder={
                    integrations?.tata_configured
                      ? '•••••••••••••••• (Configured — enter new key to update)'
                      : 'Enter your Tata Smartflo API key…'
                  }
                  className="w-full pl-3 pr-9 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Bearer API token for Smartflo voice platform.</p>
            </div>

            {/* TATA ACCOUNT ID */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">TATA_ACCOUNT_ID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g. SMARTFLO_ACCOUNT_123"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">Smartflo enterprise tenant or billing account ID.</p>
            </div>

            {/* TATA API URL */}
            <div>
              <label className="block font-bold text-slate-200 mb-1">TATA_API_URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api-smartflo.tatateleservices.com/v1"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">Smartflo voice gateway endpoint URL.</p>
            </div>
          </div>

          {/* Webhook Endpoint & Secret Box */}
          <div className="p-3.5 glass-inner rounded-xl border border-teal-500/20 text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-teal-300 font-bold">
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span>Smartflo Real-Time Call Event Webhook</span>
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
                  Public Webhook Endpoint (Configure in Smartflo Portal)
                </label>
                <div className="px-3 py-2 glass-input rounded-lg font-mono text-xs text-teal-300 select-all truncate">
                  {webhookUrl}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1">
                  Webhook Secret / Bearer Token
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Enter secret token to verify incoming webhooks…"
                    className="w-full pl-3 pr-9 py-2 glass-input rounded-lg text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-teal-500/20 active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Credentials</span>
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 glass-inner hover:bg-teal-500/15 text-slate-200 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Radio className={`w-3.5 h-3.5 text-teal-400 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Testing Gateway…' : 'Test API Gateway'}</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateWebhook}
                disabled={isSimulatingWebhook}
                className="px-4 py-2 glass-inner hover:bg-teal-500/15 text-teal-300 font-bold rounded-xl border border-teal-500/25 text-xs transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Zap className={`w-3.5 h-3.5 text-teal-400 ${isSimulatingWebhook ? 'animate-spin' : ''}`} />
                <span>{isSimulatingWebhook ? 'Simulating…' : 'Simulate Incoming Webhook'}</span>
              </button>
            </div>

            {saveStatus && (
              <span className="text-xs font-semibold text-teal-200 glass-inner px-3 py-1.5 rounded-lg border border-teal-500/30">
                {saveStatus}
              </span>
            )}

            {testResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  testResult.ok
                    ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                    : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
                }`}
              >
                {testResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-rose-400" />}
                <span>{testResult.message}</span>
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
        </form>
      </div>

      {/* Manual On-Demand Sync Control */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-4">
        <div className="border-b border-teal-500/15 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-teal-400" />
            <span>Manual On-Demand Call Sync</span>
          </h3>
          <span className="text-xs text-slate-400">User-initiated batch sync</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-300 font-bold mb-1">From Date</label>
            <input
              type="date"
              value={syncFromDate}
              onChange={(e) => setSyncFromDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">To Date</label>
            <input
              type="date"
              value={syncToDate}
              onChange={(e) => setSyncToDate(e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-xl text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">Maximum Calls to Fetch</label>
            <input
              type="number"
              min={1}
              max={500}
              value={syncLimit}
              onChange={(e) => setSyncLimit(Number(e.target.value))}
              className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-teal-500/20 disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-slate-950' : ''}`} />
              <span>{isSyncing ? 'Fetching Recordings…' : 'Sync Recordings Now'}</span>
            </button>
          </div>
        </div>

        {syncResult && (
          <div
            className={`text-xs p-3 rounded-xl border font-medium flex items-center gap-2 ${
              syncResult.ok
                ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/30'
                : 'bg-rose-950/60 text-rose-200 border-rose-500/30'
            }`}
          >
            {syncResult.ok ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
            <span>{syncResult.message}</span>
          </div>
        )}
      </div>

      {/* Synced Calls Table */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-teal-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-teal-400" />
            <span>Tata Smartflo Call Recordings ({tataCalls.length})</span>
          </h3>
          <span className="text-xs text-slate-400">Ingested telephony audio stream</span>
        </div>

        {tataCalls.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 glass-inner rounded-xl border border-dashed border-teal-500/20">
            No Tata recordings synced yet. Enter your credentials above and click &ldquo;Sync Recordings Now&rdquo; or &ldquo;Simulate Incoming Webhook&rdquo; to populate recordings.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2 px-3">Call ID</th>
                  <th className="py-2 px-3">Caller ID / Number</th>
                  <th className="py-2 px-3">Client Code</th>
                  <th className="py-2 px-3">Call Date</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3">Classification</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tataCalls.slice(0, 20).map((c) => (
                  <tr key={c.id} className="hover:bg-teal-500/5 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-teal-400">#{c.id}</td>
                    <td className="py-2 px-3 font-mono text-slate-200">{c.calling_number || c.caller_name || '—'}</td>
                    <td className="py-2 px-3 font-mono font-bold text-teal-300">{c.client || '—'}</td>
                    <td className="py-2 px-3 text-slate-400">{c.call_date || '—'}</td>
                    <td className="py-2 px-3 font-mono text-slate-200">{c.duration_seconds ? `${c.duration_seconds}s` : '—'}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold glass-inner text-slate-200 border border-teal-500/20">
                        {c.call_type || 'pre_order'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
