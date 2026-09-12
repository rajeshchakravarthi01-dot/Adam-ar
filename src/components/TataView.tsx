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

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [syncFromDate, setSyncFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncToDate, setSyncToDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncLimit, setSyncLimit] = useState(50);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (integrations) {
      if (integrations.tata_account_id) setAccountId(integrations.tata_account_id);
      if (integrations.tata_api_url) setApiUrl(integrations.tata_api_url);
    }
  }, [integrations]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving credentials…');
    try {
      const payload: Record<string, string> = {
        tata_account_id: accountId.trim(),
        tata_api_url: apiUrl.trim(),
      };
      if (tataKey.trim()) {
        payload.tata_api_key = tataKey.trim();
      }
      await onSaveIntegrations(payload);
      setSaveStatus('Tata Teleservices credentials saved successfully to database.');
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

  // Filter calls ingested from Tata
  const tataCalls = calls.filter((c) => (c.source || '').toLowerCase().includes('tata'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-neutral-900 text-amber-400">
                <Radio className="w-4 h-4" />
              </span>
              <span>Tata Teleservices Enterprise Telephony</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Direct manual integration with Tata Smartflo cloud telephony. Manually configure API keys, test gateway connectivity, and sync calls on demand.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                integrations?.tata_configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  integrations?.tata_configured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{integrations?.tata_configured ? 'GATEWAY CONFIGURED' : 'PENDING CREDENTIALS'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Manual Credentials Form */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
        <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-500" />
            <span>Manual Gateway Credentials</span>
          </h3>
          <span className="text-xs text-neutral-500">Manual in-app credential storage</span>
        </div>

        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Manual In-App Configuration Active:</span> Enter your <strong>TATA_API_KEY</strong>, <strong>TATA_ACCOUNT_ID</strong>, and <strong>TATA_API_URL</strong> directly below and click <strong>Save Tata Credentials</strong>. Credentials are saved locally into your secure internal database and do not require platform environment variables or secrets.
          </div>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* TATA API KEY */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">TATA_API_KEY *</label>
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
                  className="w-full pl-3 pr-9 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">API bearer token for your enterprise account.</p>
            </div>

            {/* TATA ACCOUNT ID */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">TATA_ACCOUNT_ID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g. SMARTFLO_ACCOUNT_123"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
              <p className="text-[10px] text-neutral-400 mt-1">Smartflo tenant account reference.</p>
            </div>

            {/* TATA API URL */}
            <div>
              <label className="block font-bold text-neutral-800 mb-1">TATA_API_URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api-smartflo.tatateleservices.com/v1"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:border-amber-400 focus:outline-hidden"
              />
              <p className="text-[10px] text-neutral-400 mt-1">Gateway endpoint URL.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 bg-neutral-950 hover:bg-black text-amber-400 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Tata Credentials</span>
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl border border-neutral-300 text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Radio className={`w-3.5 h-3.5 text-amber-500 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Testing Gateway…' : 'Test Connection'}</span>
              </button>
            </div>

            {saveStatus && (
              <span className="text-xs font-semibold text-neutral-800 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-300">
                {saveStatus}
              </span>
            )}

            {testResult && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                {testResult.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Manual On-Demand Sync Control */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
        <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-500" />
            <span>Manual On-Demand Call Sync</span>
          </h3>
          <span className="text-xs text-neutral-500">Completely user-initiated · No automated polling</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-neutral-700 font-bold mb-1">From Date</label>
            <input
              type="date"
              value={syncFromDate}
              onChange={(e) => setSyncFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900"
            />
          </div>

          <div>
            <label className="block text-neutral-700 font-bold mb-1">To Date</label>
            <input
              type="date"
              value={syncToDate}
              onChange={(e) => setSyncToDate(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900"
            />
          </div>

          <div>
            <label className="block text-neutral-700 font-bold mb-1">Maximum Calls to Fetch</label>
            <input
              type="number"
              min={1}
              max={500}
              value={syncLimit}
              onChange={(e) => setSyncLimit(Number(e.target.value))}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="w-full px-4 py-2.5 bg-neutral-950 hover:bg-black text-amber-400 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isSyncing ? 'Fetching Recordings…' : 'Sync Recordings Now'}</span>
            </button>
          </div>
        </div>

        {syncResult && (
          <div
            className={`text-xs p-3 rounded-xl border font-medium flex items-center gap-2 ${
              syncResult.ok
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            {syncResult.ok ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
            <span>{syncResult.message}</span>
          </div>
        )}
      </div>

      {/* Synced Calls Table */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-amber-500" />
            <span>Tata Smartflo Call Recordings ({tataCalls.length})</span>
          </h3>
          <span className="text-xs text-neutral-500">Ingested telephony audio stream</span>
        </div>

        {tataCalls.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
            No Tata recordings synced yet. Enter your credentials above and click &ldquo;Sync Recordings Now&rdquo; to fetch calls.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 font-semibold text-[11px]">
                  <th className="py-2 px-3">Call ID</th>
                  <th className="py-2 px-3">Caller ID / Number</th>
                  <th className="py-2 px-3">Client Code</th>
                  <th className="py-2 px-3">Call Date</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3">Classification</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tataCalls.slice(0, 20).map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 font-mono font-bold text-neutral-900">#{c.id}</td>
                    <td className="py-2 px-3 font-mono">{c.calling_number || c.caller_name || '—'}</td>
                    <td className="py-2 px-3 font-mono font-bold text-amber-700">{c.client || '—'}</td>
                    <td className="py-2 px-3">{c.call_date || '—'}</td>
                    <td className="py-2 px-3 font-mono">{c.duration_seconds ? `${c.duration_seconds}s` : '—'}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-800">
                        {c.call_type || 'pre_order'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
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
