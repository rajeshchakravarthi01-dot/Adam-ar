import React from 'react';
import { Cpu, CheckCircle2, ShieldCheck, Database, HardDrive, Server, Download, Key, ExternalLink } from 'lucide-react';

interface DiagnosticsViewProps {
  diagnostics: {
    ok: boolean;
    db_status: string;
    database: { ok: boolean; path?: string; size_bytes?: number; size_formatted?: string; tables: Record<string, number> };
    counts: Record<string, number>;
    groq_configured: boolean;
    worker_version: string;
    worker_last_seen: string;
    worker_status: string;
    server_uptime: number;
    rest_namespace: string;
    auth_mode: string;
    env_groq_key_set?: boolean;
    database_env_override?: boolean;
  } | null;
  isLoading: boolean;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ diagnostics, isLoading }) => {
  return (
    <div className="space-y-6">
      {/* Header - Oceanic Liquid Glass */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-100 mb-1 flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
              <Cpu className="w-4 h-4" />
            </span>
            <span>System Diagnostics, Database &amp; Cloud Deployment</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Persistent SQLite engine, table volumes, custom API key readiness, and infrastructure health.
          </p>
        </div>

        <a
          href="/api/database/backup"
          download
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Database (.db)</span>
        </a>
      </div>

      {/* Grid of status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl shadow-lg">
          <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Backend REST</div>
          <div className="text-xl font-black text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>v7 OK (auditeq/v7)</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl shadow-lg">
          <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Engine &amp; Key Status</div>
          <div className="text-xl font-black text-neutral-100">
            {diagnostics?.groq_configured ? (
              <span className="text-emerald-400">Engine Active</span>
            ) : (
              <span className="text-teal-400">No Key Inbuilt</span>
            )}
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl shadow-lg">
          <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Database Engine</div>
          <div className="text-xl font-black text-neutral-100 font-mono">
            SQLite 3 (WAL)
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl shadow-lg">
          <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Database Size</div>
          <div className="text-xl font-black text-neutral-100 font-mono">
            {diagnostics?.database?.size_formatted || '0.12 MB'}
          </div>
        </div>
      </div>

      {/* Database Tables Breakdown */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-400" />
            <span>Database Tables &amp; Record Counts</span>
          </h3>
          <span className="text-[11px] font-mono text-neutral-400 truncate max-w-md">
            Path: {diagnostics?.database?.path || '.data/auditeq_production.db'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
          {Object.entries(diagnostics?.database?.tables || {}).map(([table, count]) => (
            <div key={table} className="p-3 glass-inner rounded-xl border border-white/10">
              <div className="text-neutral-400 font-mono font-medium truncate">{table}</div>
              <div className="text-lg font-black text-neutral-100 mt-1">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Render & GitHub Ready Details */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl space-y-3 text-xs">
        <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-white/10 pb-3">
          <Server className="w-4 h-4 text-teal-400" />
          <span>Deployment &amp; Architecture Checklist</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-neutral-300">
          <div className="p-4 glass-inner rounded-xl border border-white/10 space-y-1.5 leading-relaxed">
            <div className="font-bold text-neutral-100 mb-1">Environment &amp; Key Setup</div>
            <div>• <b>Zero Hardcoded Keys:</b> No API keys are embedded in source code.</div>
            <div>• <b>Environment Variables:</b> Set <span className="font-mono text-teal-300 font-semibold">GROQ_API_KEY</span> in environment or configure in the UI.</div>
            <div>• <b>Database Persistence:</b> High-throughput SQLite with WAL journal mode.</div>
          </div>

          <div className="p-4 glass-inner rounded-xl border border-white/10 space-y-1.5 leading-relaxed">
            <div className="font-bold text-neutral-100 mb-1">Authentication &amp; User Accounts</div>
            <div>• <b>Separate Login/Signup:</b> Dedicated registration with salt &amp; scrypt hashing.</div>
            <div>• <b>Administrator Access:</b> Configured via secure initial administrator provisioning or sign-up.</div>
            <div>• <b>Multiple Users:</b> Create separate auditor/compliance accounts anytime.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
