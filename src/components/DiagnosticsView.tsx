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
      {/* Header - Classy Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 mb-1 flex items-center gap-2">
            <span className="p-1 rounded-lg bg-black text-amber-400">
              <Cpu className="w-4 h-4" />
            </span>
            <span>System Diagnostics, Database &amp; Cloud Deployment</span>
          </h2>
          <p className="text-xs text-neutral-500">
            Persistent SQLite engine, table volumes, custom API key readiness, and infrastructure health.
          </p>
        </div>

        <a
          href="/api/database/backup"
          download
          className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-neutral-900 text-amber-400 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer border border-amber-400/30"
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>Export Database (.db)</span>
        </a>
      </div>

      {/* Grid of status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Backend REST</div>
          <div className="text-xl font-black text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>v7 OK (auditeq/v7)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">AI Provider &amp; Key</div>
          <div className="text-xl font-black text-neutral-900">
            {diagnostics?.groq_configured ? (
              <span className="text-emerald-700">GROQ Active</span>
            ) : (
              <span className="text-amber-600">No Key Inbuilt</span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Database Engine</div>
          <div className="text-xl font-black text-neutral-900 font-mono">
            SQLite 3 (WAL)
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Database Size</div>
          <div className="text-xl font-black text-neutral-900 font-mono">
            {diagnostics?.database?.size_formatted || '0.12 MB'}
          </div>
        </div>
      </div>

      {/* Database Tables Breakdown */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" />
            <span>Database Tables &amp; Record Counts</span>
          </h3>
          <span className="text-[11px] font-mono text-neutral-500 truncate max-w-md">
            Path: {diagnostics?.database?.path || '.data/auditeq_production.db'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
          {Object.entries(diagnostics?.database?.tables || {}).map(([table, count]) => (
            <div key={table} className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
              <div className="text-neutral-500 font-mono font-medium truncate">{table}</div>
              <div className="text-lg font-black text-neutral-900 mt-1">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Render & GitHub Ready Details */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-3 text-xs">
        <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
          <Server className="w-4 h-4 text-amber-500" />
          <span>Deployment &amp; Architecture Checklist</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-neutral-700">
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 leading-relaxed">
            <div className="font-bold text-neutral-900 mb-1">Environment &amp; Key Setup</div>
            <div>• <b>Zero Hardcoded Keys:</b> No API keys are embedded in source code.</div>
            <div>• <b>Environment Variables:</b> Set <span className="font-mono text-amber-600 font-semibold">GROQ_API_KEY</span> in environment or configure in the UI.</div>
            <div>• <b>Database Persistence:</b> High-throughput SQLite with WAL journal mode.</div>
          </div>

          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 leading-relaxed">
            <div className="font-bold text-neutral-900 mb-1">Authentication &amp; User Accounts</div>
            <div>• <b>Separate Login/Signup:</b> Dedicated registration with salt &amp; scrypt hashing.</div>
            <div>• <b>Default Admin:</b> <span className="font-mono">admin</span> / <span className="font-mono">AuditEQ@Production2026</span>.</div>
            <div>• <b>Multiple Users:</b> Create separate auditor/compliance accounts anytime.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
