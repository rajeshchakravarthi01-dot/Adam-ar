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
      {/* Control Banner - Classy Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-black">
              <GitCompare className="w-4 h-4" />
            </span>
            <span>Deterministic Call &harr; Trade Correlation Engine</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Correlates trades to call recordings using 4 primary audit anchors: <b>Client Code</b>, <b>Stock Symbol</b>, <b>Executed Price</b>, and <b>Quantity</b>.
          </p>
        </div>

        <button
          onClick={handleRunClick}
          disabled={isLoading}
          className="px-6 py-2.5 bg-black hover:bg-neutral-900 disabled:opacity-50 text-amber-400 font-bold rounded-xl text-xs shadow-md transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-amber-400/30 shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span>{isLoading ? 'Running Matching…' : 'Run Matching Now'}</span>
        </button>
      </div>

      {matchingStatusText && (
        <div className="text-xs font-medium text-neutral-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
          {matchingStatusText}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => setFilterStatus('matched')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'matched'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">Confirmed Matched</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-950 mt-1">{matchedCount}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Anchors verified &amp; ready for audit</div>
        </div>

        <div
          onClick={() => setFilterStatus('review')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'review'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Review Candidate</span>
            <HelpCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-950 mt-1">{reviewCount}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Partial anchor hit (awaiting review)</div>
        </div>

        <div
          onClick={() => setFilterStatus('all')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'all'
              ? 'bg-neutral-100 border-neutral-300 ring-2 ring-neutral-500/20'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700">All Proposals</span>
            <Layers className="w-4 h-4 text-neutral-500" />
          </div>
          <div className="text-xl font-black text-neutral-900 mt-1">{matches.length}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Total matching correlations recorded</div>
        </div>
      </div>

      {/* Matches Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 focus:outline-hidden focus:border-amber-400"
            >
              <option value="all">All Statuses ({matches.length})</option>
              <option value="matched">Matched ({matchedCount})</option>
              <option value="review">Review ({reviewCount})</option>
              <option value="unmatched">Unmatched ({unmatchedCount})</option>
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, symbol, or filename…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 text-amber-400">Match ID</th>
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
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-400">
                    No matching records found. Click "Run Matching Now" to correlate trades with transcribed calls.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m) => (
                  <tr key={m.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-600">#{m.id}</td>
                    <td className="py-2.5 px-3 font-medium text-neutral-900 max-w-[180px] truncate" title={m.recording_name}>
                      {m.recording_name || `Call #${m.call_id}`}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-900 border border-neutral-200">
                        {m.trade_client || m.call_client || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-neutral-900">{m.symbol || '—'}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {m.quantity !== undefined && m.quantity !== null ? m.quantity : '—'} @ {m.price !== undefined && m.price !== null ? `₹${m.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {m.trade_date || m.call_date || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <span className={m.confidence >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}>
                        {Math.round((m.confidence || 0) * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {m.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Matched</span>
                        </span>
                      ) : m.status === 'review' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-300">
                          <AlertCircle className="w-3 h-3" />
                          <span>Review</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                          <span>Unmatched</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 max-w-[280px] truncate" title={m.reason}>
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
