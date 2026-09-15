import React, { useState } from 'react';
import { Archive, Trash2, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface MaintenanceViewProps {
  onArchiveClear: (label: string) => Promise<void>;
  onPermanentClear: () => Promise<void>;
  isLoading: boolean;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  onArchiveClear,
  onPermanentClear,
  isLoading,
}) => {
  const [archiveLabel, setArchiveLabel] = useState(`Period Close ${new Date().toISOString().slice(0, 7)}`);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleArchive = async () => {
    if (!window.confirm('Archive all current operational data and clear the live workspace? Historical reports will remain safely archived.')) {
      return;
    }
    setIsProcessing(true);
    setStatusMsg('Creating verified immutable archive bundle and clearing live workspace…');
    try {
      await onArchiveClear(archiveLabel);
      setStatusMsg('Workspace archived and operational records cleared safely.');
    } catch (err: unknown) {
      setStatusMsg(`Archive failed: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanent = async () => {
    if (!window.confirm('WARNING: Permanently clear all operational calls, trades, matches and audits? This cannot be undone.')) {
      return;
    }
    setIsProcessing(true);
    setStatusMsg('Permanently clearing operational live data…');
    try {
      await onPermanentClear();
      setStatusMsg('All live operational records permanently cleared.');
    } catch (err: unknown) {
      setStatusMsg(`Clear failed: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl">
        <h2 className="text-base font-bold text-neutral-100 mb-1 flex items-center gap-2">
          <span className="p-1 rounded-lg bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
            <Archive className="w-4 h-4" />
          </span>
          <span>Archive &amp; Clear Workspace</span>
        </h2>
        <p className="text-xs text-neutral-400">
          Safely archive completed operational calls, trades, matching records, and audits into an immutable report bundle before clearing the live workspace for a new batch or month.
        </p>
      </div>

      {statusMsg && (
        <div className="p-4 glass-inner border border-white/10 rounded-xl text-xs font-medium text-neutral-200 flex items-center gap-2 shadow-inner">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Archive & Clear Card */}
      <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span>Safe Period Archive &amp; Reset</span>
        </h3>
        <p className="text-xs text-neutral-300">
          This operation generates a SHA-256 hashed archive bundle containing all operational tables. Settings, Groq integration configs, and historical report archives are completely preserved.
        </p>

        <div className="max-w-md space-y-2">
          <label className="block text-xs font-bold text-neutral-300">Archive Label / Close Name</label>
          <input
            type="text"
            value={archiveLabel}
            onChange={(e) => setArchiveLabel(e.target.value)}
            className="w-full px-3 py-2 glass-input rounded-xl text-xs"
          />
        </div>

        <button
          onClick={handleArchive}
          disabled={isProcessing || isLoading}
          className="px-5 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-2"
        >
          <Archive className="w-3.5 h-3.5 text-slate-950" />
          <span>{isProcessing ? 'Archiving…' : 'Archive & Clear Workspace'}</span>
        </button>
      </div>

      {/* Danger Zone: Permanent Clear */}
      <div className="glass-panel p-6 rounded-2xl border-rose-500/30 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>Permanent Operational Purge</span>
        </h3>
        <p className="text-xs text-rose-200/80">
          Irreversibly delete all live calls, trades, matches, audits, and jobs without creating an archive. Settings and historical archives remain untouched.
        </p>

        <button
          onClick={handlePermanent}
          disabled={isProcessing || isLoading}
          className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-500/20 transition-all cursor-pointer flex items-center gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isProcessing ? 'Purging…' : 'Permanently Clear Live Data'}</span>
        </button>
      </div>
    </div>
  );
};
