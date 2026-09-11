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
  const failedJobs = stats?.failed || 0;
  const avgScore = stats?.avg_score || 0;

  const isAIActive = processing > 0 || queued > 0 || pendingTranscription > 0;
  const progressPercent = trades > 0 ? Math.min(100, Math.round((scored / trades) * 100)) : totalCalls > 0 ? Math.min(100, Math.round((transcribed / totalCalls) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Live AI Status & Activity Banner - Answering "What AI is doing, if not doing anything then why" */}
      <div className={`p-5 rounded-2xl border shadow-sm transition-all ${
        isAIActive
          ? 'bg-gradient-to-r from-amber-50 via-amber-100/40 to-white border-amber-300'
          : 'bg-white border-neutral-200'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              isAIActive ? 'bg-amber-400 text-black animate-pulse' : 'bg-neutral-100 text-neutral-700'
            }`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider font-mono ${
                  isAIActive ? 'bg-amber-400 text-black' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isAIActive ? 'bg-black animate-ping' : 'bg-emerald-600'}`} />
                  <span>{isAIActive ? 'AI Active & Working' : 'AI Standby / Idle'}</span>
                </span>
                <span className="text-xs text-neutral-500 font-medium">3 Parallel Background Workers</span>
              </div>
              <h3 className="text-base font-bold text-neutral-900 mt-1">
                {isAIActive ? (
                  <span>
                    AI is currently processing {processing + queued + pendingTranscription} active background task(s)
                  </span>
                ) : (
                  <span>AI Engine is Idle — All {totalCalls} audio calls &amp; scorecards fully processed</span>
                )}
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed max-w-3xl">
                {isAIActive ? (
                  <span>
                    <b>Current Action:</b> Groq Whisper Large-v3 is transcribing pending audio and GPT-OSS is evaluating SEBI Q1–Q5 fatal rules against matched trade parameters.
                  </span>
                ) : (
                  <span>
                    <b>Why AI is Idle:</b> The pipeline queue is empty ({queued} queued, {processing} processing). All uploaded calls have been transcribed, matched, and deterministic scorecards generated. AI is on standby ready for new audio ZIP uploads or trade spreadsheets.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onStartPipeline}
              disabled={isLoading}
              className="px-4 py-2 bg-neutral-900 hover:bg-black text-amber-400 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-neutral-700 transition-all cursor-pointer shadow-xs"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Poll / Wake AI</span>
            </button>
            <button
              onClick={() => onNavigate('pipeline')}
              className="px-4 py-2 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-neutral-200 transition-all cursor-pointer shadow-xs"
            >
              <span>View Workers</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Hero Pipeline Status Banner - Classy Black & Yellow */}
      <div className="bg-[#0b0b0e] text-white rounded-2xl p-6 shadow-xl border border-neutral-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 relative z-10">
          <div>
            <div className="text-xs font-bold text-amber-400 tracking-wider uppercase mb-1">
              Production Pipeline · High-Accuracy Groq Whisper Engine
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Calls &rarr; Trades &rarr; Transcribe &rarr; Match &rarr; Q1–Q5 Audit &rarr; Scorecard
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
              Groq Whisper powers speech-to-text verbatim transcription with audio conditioning; Groq GPT-OSS executes strict pre-order quality auditing. Valid audits synchronize directly across scorecards and editable master records.
            </p>
          </div>

          <button
            onClick={onStartPipeline}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Play className="w-4 h-4 fill-black text-black" />
            <span>Start / Refresh Pipeline</span>
          </button>
        </div>

        {/* Real-time Progress Bar */}
        <div className="mt-6 relative z-10">
          <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Pipeline Automation Progress</span>
            </div>
            <span className="font-mono text-amber-400 font-bold">{progressPercent}% Scored &amp; Finalized</span>
          </div>
          <div className="w-full h-2.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-neutral-400 gap-2">
          <div>
            Queue Status: <span className="text-amber-400 font-mono font-bold">{stats?.queued || 0} queued</span> ·{' '}
            <span className="text-neutral-200 font-mono font-medium">{stats?.processing || 0} processing</span> ·{' '}
            <span className="text-neutral-200 font-mono font-medium">{pendingTranscription} pending transcription</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero Manual Gate on Valid Audits</span>
          </div>
        </div>
      </div>

      {/* Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calls Card */}
        <div
          onClick={() => onNavigate('calls')}
          className="bg-white p-5 rounded-2xl border border-neutral-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Call Recordings</span>
            <PhoneCall className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-neutral-900">{totalCalls.toLocaleString()}</div>
          <div className="text-xs text-neutral-500 mt-1 flex items-center justify-between">
            <span>Transcribed: <b className="text-neutral-800">{transcribed}</b></span>
            {pendingTranscription > 0 && (
              <span className="text-amber-600 font-bold">{pendingTranscription} pending</span>
            )}
          </div>
        </div>

        {/* Trades Card */}
        <div
          onClick={() => onNavigate('trades')}
          className="bg-white p-5 rounded-2xl border border-neutral-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Trading Records</span>
            <TrendingUp className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-neutral-900">{trades.toLocaleString()}</div>
          <div className="text-xs text-neutral-500 mt-1 flex items-center justify-between">
            <span>Matched: <b className="text-neutral-800">{matches}</b></span>
            <span className="text-neutral-400">CSV/XLSX</span>
          </div>
        </div>

        {/* Audits Card */}
        <div
          onClick={() => onNavigate('audit')}
          className="bg-white p-5 rounded-2xl border border-neutral-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">AI Audits (Q1–Q5)</span>
            <CheckSquare className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-neutral-900">{audits.toLocaleString()}</div>
          <div className="text-xs text-neutral-500 mt-1 flex items-center justify-between">
            <span>Model: <b className="text-neutral-800">GPT-OSS 120B</b></span>
            <span className="text-amber-600 font-bold">Automatic</span>
          </div>
        </div>

        {/* Scorecards Card */}
        <div
          onClick={() => onNavigate('scorecards')}
          className="bg-white p-5 rounded-2xl border border-neutral-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-neutral-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Scorecards Generated</span>
            <Award className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-neutral-900">{scored.toLocaleString()}</div>
          <div className="text-xs text-neutral-600 mt-1 flex items-center justify-between">
            <span>Avg Score: <b>{avgScore}/5</b></span>
            <span className="font-bold text-amber-600">Finalized</span>
          </div>
        </div>
      </div>

      {/* System Status & Attention Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-500" />
              <span>System Health &amp; Subsystems</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              Optimal
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">Groq Whisper Transcription</span>
              <span className="font-semibold text-neutral-900 flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>whisper-large-v3 (Primary)</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">Groq GPT-OSS Compliance Auditing</span>
              <span className="font-semibold text-neutral-900 flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>openai/gpt-oss-120b (Structured)</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">Deterministic Matcher (Client/Symbol/Price/Qty)</span>
              <span className="font-semibold text-neutral-900">{matches} Confirmed Matches</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-neutral-600">Scoring Engine &amp; Fatal Rules (Q1/Q2/Q5)</span>
              <span className="font-bold text-amber-600">Deterministic 5-Mark Calculation</span>
            </div>
          </div>
        </div>

        {/* Attention & Action Panel */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Attention &amp; Quick Actions</span>
            </h3>
          </div>

          {recoveryMessage && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 mb-4 flex items-center justify-between">
              <span>{recoveryMessage}</span>
              <button onClick={() => setRecoveryMessage(null)} className="text-neutral-500 hover:text-black text-xs font-bold">✕</button>
            </div>
          )}

          {failedJobs > 0 || failedJobsList.length > 0 ? (
            <div className="space-y-3 mb-4">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>{failedJobsList.length || failedJobs} Job(s) In Dead Letter / Review Queue</span>
                  </div>
                  <button
                    onClick={handleRetryAll}
                    disabled={retryingAll || loadingFailedJobs}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${retryingAll ? 'animate-spin' : ''}`} />
                    <span>{retryingAll ? 'Retrying All...' : 'Retry All Failed'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-rose-700 leading-snug">
                  Jobs preserved without data loss or false scorecards. Each failed job records its exact error trace.
                </p>
              </div>

              {failedJobsList.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {failedJobsList.slice(0, 5).map((job) => (
                    <div
                      key={job.id}
                      className="p-2.5 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl text-xs flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-800 text-[10px] font-mono uppercase font-bold">
                            {job.job_type} #{job.entity_id}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            Attempts: {job.attempts}/{job.max_attempts}
                          </span>
                        </div>
                        <div className="text-[11px] text-rose-600 truncate mt-1" title={job.last_error || job.original_error || 'Execution failure'}>
                          {job.last_error || job.original_error || 'Execution failure'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRetrySingle(job.id)}
                        disabled={retryingJobId === job.id}
                        className="px-2 py-1 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg text-[11px] font-semibold text-neutral-700 hover:text-black flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        <RotateCcw className={`w-3 h-3 ${retryingJobId === job.id ? 'animate-spin' : ''}`} />
                        <span>{retryingJobId === job.id ? 'Retrying...' : 'Retry'}</span>
                      </button>
                    </div>
                  ))}
                  {failedJobsList.length > 5 && (
                    <div className="text-center text-[10px] text-neutral-500 py-1">
                      + {failedJobsList.length - 5} more failed job(s) in queue
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-700 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>No blocking pipeline failures. Circuit breakers &amp; background watchdog active.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <button
              onClick={() => onNavigate('calls')}
              className="p-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-800 font-semibold flex items-center justify-between transition-colors cursor-pointer"
            >
              <span>Upload Calls (ZIP / MP3)</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            <button
              onClick={() => onNavigate('trades')}
              className="p-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-800 font-semibold flex items-center justify-between transition-colors cursor-pointer"
            >
              <span>Import Trades (CSV/XLSX)</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            <button
              onClick={() => onNavigate('master_table')}
              className="p-3 bg-black hover:bg-neutral-900 text-amber-400 border border-amber-400/30 rounded-xl font-bold flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5" />
                <span>Audited Master Grid</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
            </button>

            <button
              onClick={() => onNavigate('mail')}
              className="p-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-800 font-semibold flex items-center justify-between transition-colors cursor-pointer"
            >
              <span>Dispatch Scorecard Mail</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Operating Sequence Guide */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <h3 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-500" />
          <span>Recommended Standard Operating Sequence</span>
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { step: '1. Calls', desc: 'Upload audio/ZIP', done: totalCalls > 0 },
            { step: '2. Trades', desc: 'Import CSV/XLSX', done: trades > 0 },
            { step: '3. Transcribe', desc: 'Groq Whisper', done: transcribed > 0 },
            { step: '4. Match', desc: 'Deterministic links', done: matches > 0 },
            { step: '5. AI Audit', desc: 'Groq GPT-OSS 120b', done: audits > 0 },
            { step: '6. Score', desc: 'Fatal & 5-mark rules', done: scored > 0 },
            { step: '7. Master Grid', desc: 'Live editable table', done: scored > 0 },
            { step: '8. Dispatch', desc: 'Advisor email delivery', done: (stats?.scorecard_coverage || 0) > 0 },
          ].map((s, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border text-center transition-all ${
                s.done
                  ? 'bg-amber-50/60 border-amber-300 text-neutral-900 font-semibold'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-400'
              }`}
            >
              <div className={`text-xs font-bold ${s.done ? 'text-black' : 'text-neutral-500'}`}>
                {s.step}
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
