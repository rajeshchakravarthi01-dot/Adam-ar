import React, { useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  TrendingUp,
  GitCompare,
  CheckSquare,
  Award,
  AlertCircle,
  Play,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  Table,
  Sparkles,
  Clock,
  Activity,
  AlertTriangle,
  Info,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import type { PipelineStats, FailedJobItem } from '../types';
import type { ActiveTab } from './Sidebar';
import { api } from '../lib/api';

interface DashboardViewProps {
  stats: PipelineStats | null;
  onNavigate: (tab: ActiveTab) => void;
  onStartPipeline: () => void;
  isLoading: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  onNavigate,
  onStartPipeline,
  isLoading,
}) => {
  const [failedJobsList, setFailedJobsList] = useState<FailedJobItem[]>([]);
  const [loadingFailedJobs, setLoadingFailedJobs] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const fetchFailedJobs = useCallback(async () => {
    try {
      setLoadingFailedJobs(true);
      const jobs = await api.getFailedJobs();
      setFailedJobsList(jobs);
    } catch {
      // ignore
    } finally {
      setLoadingFailedJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchFailedJobs();
  }, [fetchFailedJobs, stats?.failed]);

  const handleRetrySingle = async (jobId: number) => {
    try {
      setRetryingJobId(jobId);
      const res = await api.retryJob(jobId);
      setRecoveryMessage(res.message);
      await fetchFailedJobs();
      setTimeout(() => setRecoveryMessage(null), 4000);
    } catch (err: any) {
      setRecoveryMessage(`Retry failed: ${err.message}`);
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleRetryAll = async () => {
    try {
      setRetryingAll(true);
      const res = await api.retryAllFailedJobs();
      setRecoveryMessage(res.message);
      await fetchFailedJobs();
      setTimeout(() => setRecoveryMessage(null), 4000);
    } catch (err: any) {
      setRecoveryMessage(`Batch retry failed: ${err.message}`);
    } finally {
      setRetryingAll(false);
    }
  };
  const totalCalls = stats?.calls || 0;
  const transcribed = stats?.transcribed || 0;
  const trades = stats?.trades || 0;
  const matches = stats?.matches || 0;
  const audits = stats?.audits || 0;
  const scored = stats?.scored || 0;
  const queued = stats?.queued || 0;
  const processing = stats?.processing || 0;
  const pendingTranscription = stats?.transcription_pending || 0;
  const blockedTranscription = stats?.transcription_blocked || 0;
  const failedJobs = stats?.failed || 0;
  const avgScore = stats?.avg_score || 0;

  const isBlockedAwaitingKey = blockedTranscription > 0 && processing === 0;
  const isAIActive = processing > 0 || (queued > 0 && !isBlockedAwaitingKey) || (pendingTranscription > 0 && !isBlockedAwaitingKey);
  const progressPercent = trades > 0 ? Math.min(100, Math.round((scored / trades) * 100)) : totalCalls > 0 ? Math.min(100, Math.round((transcribed / totalCalls) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Live Engine Status Banner - Liquid Glass Interactive Strip */}
      <div className={`p-4 sm:p-5 rounded-2xl glass-panel transition-all ${
        isBlockedAwaitingKey
          ? 'border-amber-500/40 bg-amber-950/20'
          : isAIActive
          ? 'border-teal-500/40 bg-teal-950/20'
          : 'border-teal-500/20'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 shadow-lg ${
              isBlockedAwaitingKey
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                : isAIActive
                ? 'bg-gradient-to-br from-teal-400 to-emerald-500 text-slate-950 shadow-teal-500/30 animate-pulse'
                : 'bg-slate-900 text-teal-300 border border-teal-500/30'
            }`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide font-mono ${
                  isBlockedAwaitingKey
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : isAIActive
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isBlockedAwaitingKey ? 'bg-amber-400' : isAIActive ? 'bg-teal-300 animate-ping' : 'bg-emerald-400'}`} />
                  <span>{isBlockedAwaitingKey ? 'Awaiting Processing Key' : isAIActive ? 'Engine Active & Processing' : 'Supervisory Engine Online'}</span>
                </span>
                <span className="text-xs text-slate-400 font-medium">Auto Pipeline v1.1</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">
                {isBlockedAwaitingKey ? (
                  <span>Engine Paused · {blockedTranscription} audio file(s) waiting for API credentials</span>
                ) : isAIActive ? (
                  <span>Processing {processing + queued + pendingTranscription} concurrent verification task(s)</span>
                ) : (
                  <span>All {totalCalls} calls &amp; {trades} trades synchronized and audited</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isBlockedAwaitingKey ? (
              <button
                onClick={() => onNavigate('integrations')}
                className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <span>Configure Key</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onStartPipeline}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-900/90 hover:bg-slate-800 text-teal-300 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-teal-500/30 hover:border-teal-400/60 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Activity className="w-3.5 h-3.5 text-teal-400" />
                <span>Wake Pipeline</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('pipeline')}
              className="px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-teal-500/20 transition-all cursor-pointer"
            >
              <span>Workers</span>
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 1: 4 Liquid Glass Radial KPI Gauges (Matching BlurAdmin UI Archetype) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Calls & Voice Ingestion */}
        <div
          onClick={() => onNavigate('calls')}
          className="glass-card-interactive p-4 sm:p-5 rounded-2xl relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Voice Ingestion</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20 group-hover:scale-110 transition-transform">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-black text-white tracking-tight">{totalCalls.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Transcribed: <b className="text-teal-300">{transcribed}</b>
              </div>
            </div>

            {/* Radial SVG Gauge */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" className="stroke-slate-800" strokeWidth="4" fill="none" />
                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  className="stroke-teal-400 transition-all duration-1000"
                  strokeWidth="4"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * (totalCalls > 0 ? Math.min(100, Math.round((transcribed / totalCalls) * 100)) : 0)) / 100}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="absolute text-[11px] font-bold font-mono text-teal-200">
                {totalCalls > 0 ? Math.min(100, Math.round((transcribed / totalCalls) * 100)) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Trading Records & Correlation */}
        <div
          onClick={() => onNavigate('trades')}
          className="glass-card-interactive p-4 sm:p-5 rounded-2xl relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trade Records</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-black text-white tracking-tight">{trades.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Matched: <b className="text-emerald-300">{matches}</b>
              </div>
            </div>

            {/* Radial SVG Gauge */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" className="stroke-slate-800" strokeWidth="4" fill="none" />
                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  className="stroke-emerald-400 transition-all duration-1000"
                  strokeWidth="4"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * (trades > 0 ? Math.min(100, Math.round((matches / trades) * 100)) : 0)) / 100}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="absolute text-[11px] font-bold font-mono text-emerald-200">
                {trades > 0 ? Math.min(100, Math.round((matches / trades) * 100)) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Pre-Order Compliance Audits */}
        <div
          onClick={() => onNavigate('audit')}
          className="glass-card-interactive p-4 sm:p-5 rounded-2xl relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SEBI Audits (Q1–Q5)</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 group-hover:scale-110 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-black text-white tracking-tight">{audits.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Engine: <b className="text-cyan-300">Deterministic</b>
              </div>
            </div>

            {/* Radial SVG Gauge */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" className="stroke-slate-800" strokeWidth="4" fill="none" />
                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  className="stroke-cyan-400 transition-all duration-1000"
                  strokeWidth="4"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * (totalCalls > 0 ? Math.min(100, Math.round((audits / totalCalls) * 100)) : 0)) / 100}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="absolute text-[11px] font-bold font-mono text-cyan-200">
                {totalCalls > 0 ? Math.min(100, Math.round((audits / totalCalls) * 100)) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Metric 4: Scorecards Finalized */}
        <div
          onClick={() => onNavigate('scorecards')}
          className="glass-card-interactive p-4 sm:p-5 rounded-2xl relative overflow-hidden group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scorecards</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-black text-white tracking-tight">{scored.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Avg Score: <b className="text-amber-300">{avgScore}/4</b>
              </div>
            </div>

            {/* Radial SVG Gauge */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" className="stroke-slate-800" strokeWidth="4" fill="none" />
                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  className="stroke-amber-400 transition-all duration-1000"
                  strokeWidth="4"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (113 * (trades > 0 ? Math.min(100, Math.round((scored / trades) * 100)) : 0)) / 100}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="absolute text-[11px] font-bold font-mono text-amber-200">
                {trades > 0 ? Math.min(100, Math.round((scored / trades) * 100)) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Dual Glass Analytics (Matching Donut & Activity Spectrum) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pre-Order Compliance Spectrum Donut */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              <span>Compliance Spectrum</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              SEBI Rubric
            </span>
          </div>

          {/* Donut Chart Visualizer */}
          <div className="flex items-center justify-center py-4 relative">
            <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
              {/* Compliant Segment (Emerald) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#10b981"
                strokeWidth="12"
                strokeDasharray="238.7"
                strokeDashoffset="60"
                fill="none"
                className="opacity-90"
              />
              {/* Minor Variance (Teal) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#14b8a6"
                strokeWidth="12"
                strokeDasharray="238.7"
                strokeDashoffset="180"
                fill="none"
                className="opacity-90"
              />
              {/* Fatal Violation (Rose) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#f43f5e"
                strokeWidth="12"
                strokeDasharray="238.7"
                strokeDashoffset="220"
                fill="none"
                className="opacity-90"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black text-white font-mono">{progressPercent}%</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Audited</span>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-2 text-xs pt-3 border-t border-teal-500/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Compliant Pre-Order</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">88.4%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                <span className="text-slate-300">Minor Parameter Gap</span>
              </div>
              <span className="font-mono text-teal-300 font-bold">9.2%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-300">Fatal / Discrepancy</span>
              </div>
              <span className="font-mono text-rose-400 font-bold">2.4%</span>
            </div>
          </div>
        </div>

        {/* Right: Pipeline Visualizer & Quick Action Hub (2 Columns) */}
        <div className="glass-panel p-5 rounded-2xl lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>Deterministic Execution Matrix</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-teal-300 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-500/30">
                  {stats?.queued || 0} queued · {stats?.processing || 0} running
                </span>
              </div>
            </div>

            {/* Interactive Stage Pipeline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
              {[
                { label: 'Ingestion', sub: `${totalCalls} Audio`, active: totalCalls > 0 },
                { label: 'Transcription', sub: `${transcribed} Verbatim`, active: transcribed > 0 },
                { label: '4-Way Match', sub: `${matches} Pairs`, active: matches > 0 },
                { label: 'Final Score', sub: `${scored} Scorecards`, active: scored > 0 },
              ].map((st, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    st.active
                      ? 'bg-teal-500/10 border-teal-400/40 text-teal-200 shadow-[0_0_15px_rgba(20,184,166,0.15)]'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="text-xs font-bold">{st.label}</div>
                  <div className="text-[10px] font-mono mt-0.5 opacity-80">{st.sub}</div>
                </div>
              ))}
            </div>

            {/* Circuit Breaker & Recovery Notification */}
            {recoveryMessage && (
              <div className="p-3 bg-teal-950/70 border border-teal-400/50 rounded-xl text-xs text-teal-200 mb-4 flex items-center justify-between">
                <span>{recoveryMessage}</span>
                <button onClick={() => setRecoveryMessage(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>
            )}

            {failedJobs > 0 || failedJobsList.length > 0 ? (
              <div className="p-3.5 bg-rose-950/40 border border-rose-500/30 rounded-xl mb-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>{failedJobsList.length || failedJobs} Task(s) in Dead Letter Queue</span>
                  </div>
                  <button
                    onClick={handleRetryAll}
                    disabled={retryingAll || loadingFailedJobs}
                    className="px-2.5 py-1 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-slate-950 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${retryingAll ? 'animate-spin' : ''}`} />
                    <span>{retryingAll ? 'Retrying...' : 'Retry All'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-900/60 border border-teal-500/20 rounded-xl text-xs text-slate-300 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>Deterministic integrity checks passing · Zero deadlocks reported</span>
              </div>
            )}
          </div>

          {/* Quick Action Navigation Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-3 border-t border-teal-500/15">
            <button
              onClick={() => onNavigate('calls')}
              className="p-2.5 bg-slate-900/60 hover:bg-teal-500/10 border border-teal-500/20 hover:border-teal-400/40 rounded-xl text-slate-300 font-semibold flex items-center justify-between transition-all cursor-pointer"
            >
              <span>Upload Calls</span>
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
            </button>

            <button
              onClick={() => onNavigate('trades')}
              className="p-2.5 bg-slate-900/60 hover:bg-teal-500/10 border border-teal-500/20 hover:border-teal-400/40 rounded-xl text-slate-300 font-semibold flex items-center justify-between transition-all cursor-pointer"
            >
              <span>Import Trades</span>
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
            </button>

            <button
              onClick={() => onNavigate('master_table')}
              className="p-2.5 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 text-teal-200 border border-teal-400/40 rounded-xl font-bold flex items-center justify-between transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-teal-300" />
                <span>Master Grid</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-teal-300" />
            </button>

            <button
              onClick={() => onNavigate('mail')}
              className="p-2.5 bg-slate-900/60 hover:bg-teal-500/10 border border-teal-500/20 hover:border-teal-400/40 rounded-xl text-slate-300 font-semibold flex items-center justify-between transition-all cursor-pointer"
            >
              <span>Dispatch Mail</span>
              <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
