import React, { useState } from 'react';
import { GitCompare, Play, Search, CheckCircle2, AlertCircle, HelpCircle, Layers, ShieldCheck } from 'lucide-react';
import type { MatchRecord } from '../types';

interface MatchingViewProps {
  matches: MatchRecord[];
  onRunMatching: () => Promise<void>;
  isLoading: boolean;
}

export const MatchingView: React.FC<MatchingViewProps> = ({
  matches,
  onRunMatching,
  isLoading,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [matchingStatusText, setMatchingStatusText] = useState<string | null>(null);

  const handleRunClick = async () => {
    setMatchingStatusText('Running deterministic matching (Client, Symbol, Price, Quantity anchors)…');
    try {
      await onRunMatching();
      setMatchingStatusText('Matching batch completed successfully.');
    } catch (err: unknown) {
      setMatchingStatusText(`Matching error: ${(err as Error).message}`);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return (
      (m.trade_client || '').toLowerCase().includes(q) ||
      (m.symbol || '').toLowerCase().includes(q) ||
      (m.recording_name || '').toLowerCase().includes(q) ||
      (m.reason || '').toLowerCase().includes(q)
    );
  });

  const matchedCount = matches.filter((m) => m.status === 'matched').length;
  const reviewCount = matches.filter((m) => m.status === 'review').length;
  const unmatchedCount = matches.filter((m) => m.status === 'unmatched').length;

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
              <GitCompare className="w-4 h-4" />
            </span>
            <span>Deterministic Call &harr; Trade Correlation Engine</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Correlates trades to call recordings using 4 primary audit anchors: <b>Client Code</b>, <b>Stock Symbol</b>, <b>Executed Price</b>, and <b>Quantity</b>.
          </p>
        </div>

        <button
          onClick={handleRunClick}
          disabled={isLoading}
          className="px-6 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
          <span>{isLoading ? 'Running Matching…' : 'Run Matching Now'}</span>
        </button>
      </div>

      {matchingStatusText && (
        <div className="text-xs font-medium text-teal-200 bg-teal-500/10 p-3 rounded-xl border border-teal-500/25 shadow-inner">
          {matchingStatusText}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => setFilterStatus('matched')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'matched'
              ? 'bg-emerald-500/15 border-emerald-400/40 ring-2 ring-emerald-500/30'
              : 'glass-panel border-white/10 hover:border-emerald-400/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">Confirmed Matched</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-white mt-1">{matchedCount}</div>
          <div className="text-[11px] text-emerald-400/80 mt-0.5">Anchors verified &amp; ready for audit</div>
        </div>

        <div
          onClick={() => setFilterStatus('review')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'review'
              ? 'bg-cyan-500/15 border-cyan-400/40 ring-2 ring-cyan-500/30'
              : 'glass-panel border-white/10 hover:border-cyan-400/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300">Review Candidate</span>
            <HelpCircle className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-black text-white mt-1">{reviewCount}</div>
          <div className="text-[11px] text-cyan-400/80 mt-0.5">Partial anchor hit (awaiting review)</div>
        </div>

        <div
          onClick={() => setFilterStatus('all')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'all'
              ? 'glass-inner border-teal-400/40 ring-2 ring-teal-400/20'
              : 'glass-panel border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">All Proposals</span>
            <Layers className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-xl font-black text-white mt-1">{matches.length}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">Total matching correlations recorded</div>
        </div>
      </div>

      {/* Matches Table */}
      <div className="glass-panel rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 glass-input rounded-xl text-xs font-semibold"
            >
              <option value="all" className="bg-[#10131c] text-white">All Statuses ({matches.length})</option>
              <option value="matched" className="bg-[#10131c] text-white">Matched ({matchedCount})</option>
              <option value="review" className="bg-[#10131c] text-white">Review ({reviewCount})</option>
              <option value="unmatched" className="bg-[#10131c] text-white">Unmatched ({unmatchedCount})</option>
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, symbol, or filename…"
              className="w-full pl-8 pr-3 py-1.5 glass-input rounded-xl text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="glass-inner text-neutral-300 font-semibold border-b border-white/10 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 text-teal-400">Match ID</th>
                <th className="py-2.5 px-3">Call Recording</th>
                <th className="py-2.5 px-3">Client Code</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Trade Qty &amp; Price</th>
                <th className="py-2.5 px-3">Date &amp; Time</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Matching Anchors / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-400">
                    No matching records found. Click "Run Matching Now" to correlate trades with transcribed calls.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m) => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-teal-400">#{m.id}</td>
                    <td className="py-2.5 px-3 font-medium text-neutral-100 max-w-[180px] truncate" title={m.recording_name}>
                      {m.recording_name || `Call #${m.call_id}`}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold px-2 py-0.5 rounded glass-inner text-teal-300 border border-white/10">
                        {m.trade_client || m.call_client || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-neutral-100">{m.symbol || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-neutral-200">
                      {m.quantity !== undefined && m.quantity !== null ? m.quantity : '—'} @ {m.price !== undefined && m.price !== null ? `₹${m.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {m.trade_date || m.call_date || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <span className={m.confidence >= 0.75 ? 'text-emerald-400' : 'text-cyan-400'}>
                        {Math.round((m.confidence || 0) * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {m.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Matched</span>
                        </span>
                      ) : m.status === 'review' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          <AlertCircle className="w-3 h-3" />
                          <span>Review</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium glass-inner text-neutral-300 border border-white/10">
                          <span>Unmatched</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400 max-w-[280px] truncate" title={m.reason}>
                      {m.reason || 'Deterministic anchors corroborated.'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
