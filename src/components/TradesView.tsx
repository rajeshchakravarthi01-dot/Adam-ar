import React, { useState } from 'react';
import {
  Upload,
  TrendingUp,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  ShieldCheck,
  Layers,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  Sparkles,
  MailCheck,
} from 'lucide-react';
import type { TradeRecord, TradePreOrdersSummary } from '../types';
import { api } from '../lib/api';

interface TradesViewProps {
  trades: TradeRecord[];
  preOrdersSummary?: TradePreOrdersSummary | null;
  onUploadTrades: (file: File) => Promise<void>;
  onRefreshTrades?: () => Promise<void>;
  onSelectCall?: (callId: number) => void;
  onNavigateToManualAudit?: () => void;
  isLoading: boolean;
}

export const TradesView: React.FC<TradesViewProps> = ({
  trades,
  preOrdersSummary,
  onUploadTrades,
  onRefreshTrades,
  onSelectCall,
  onNavigateToManualAudit,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [tradeFile, setTradeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [showClustersBreakdown, setShowClustersBreakdown] = useState(false);
  const [clusterFilterClient, setClusterFilterClient] = useState('');
  const [clusterStatusFilter, setClusterStatusFilter] = useState<'ALL' | 'MATCHED' | 'MISSING'>('ALL');
  const [isMatchingOrders, setIsMatchingOrders] = useState(false);
  const [matchingNotification, setMatchingNotification] = useState<string | null>(null);

  const handleMatchOrdersAndCalls = async () => {
    setIsMatchingOrders(true);
    setMatchingNotification('Console Engine calculating accurate orders and matching with pre-order calls...');
    try {
      const res = await api.matchPreOrdersWithCalls();
      if (res.ok) {
        setMatchingNotification(res.message);
        if (onRefreshTrades) {
          await onRefreshTrades();
        }
      } else {
        setMatchingNotification(`Matching failed: ${res.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMatchingNotification(`Error matching pre-orders: ${err?.message}`);
    } finally {
      setIsMatchingOrders(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeFile) return;

    setIsUploading(true);
    setUploadStatus('Importing trades and mapping columns (Dealer, Advisor, Client, Symbol, Q, P)…');
    try {
      await onUploadTrades(tradeFile);
      setUploadStatus(`Trades imported successfully!`);
      setTradeFile(null);
    } catch (err: unknown) {
      setUploadStatus(`Trade import error: ${(err as Error).message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const filteredTrades = trades.filter((t) => {
    const q = search.toLowerCase();
    return (
      (t.symbol || '').toLowerCase().includes(q) ||
      (t.client || '').toLowerCase().includes(q) ||
      (t.advisor_name || '').toLowerCase().includes(q) ||
      (t.dealer || '').toLowerCase().includes(q) ||
      (t.client_number || '').includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Upload Trade File Card */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-400 text-black">
                <Upload className="w-4 h-4" />
              </span>
              <span>Import Daily Executed Trades (CSV / XLSX / TXT)</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Standard Audit Schema: <b>Dealer ID, Advisor Name, Team, Client Code, Phone Number, Date, Time, Trading Symbol, Side, Qty, Price</b>.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-amber-400/10 text-amber-900 px-3 py-1 rounded-full border border-amber-400/30 flex items-center gap-1.5 shrink-0 self-start">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Audit Baseline</span>
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleUploadSubmit} className="flex flex-col sm:flex-row items-center gap-3 flex-1 w-full">
            <div className="relative flex-1 w-full">
              <input
                type="file"
                accept=".csv,.xlsx,.txt"
                onChange={(e) => setTradeFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-neutral-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-black file:text-amber-400 hover:file:bg-neutral-800 cursor-pointer border border-neutral-300 rounded-xl p-1 bg-neutral-50"
              />
            </div>

            <button
              type="submit"
              disabled={isUploading || !tradeFile}
              className="w-full sm:w-auto px-6 py-2.5 bg-black hover:bg-neutral-900 disabled:opacity-50 text-amber-400 font-bold rounded-xl text-xs shadow-md transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-amber-400/30 shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>{isUploading ? 'Importing Trades…' : 'Import Trades'}</span>
            </button>
          </form>

          <button
            type="button"
            onClick={async () => {
              try {
                setUploadStatus('Consolidating split market executions at CMP…');
                const data = await api.combineSplitTrades();
                if (data.ok) {
                  setUploadStatus(data.message);
                  if (onRefreshTrades) {
                    await onRefreshTrades();
                  }
                } else {
                  setUploadStatus(`Consolidation status: ${data.message || 'Complete'}`);
                }
              } catch (err: any) {
                setUploadStatus(`Consolidation error: ${err.message}`);
              }
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 border border-neutral-300 shrink-0"
            title="Consolidates multiple partial market fills for the same client into a single order at CMP"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
            <span>Consolidate CMP Splits</span>
          </button>
        </div>

        {uploadStatus && (
          <div className="mt-3 text-xs font-medium text-neutral-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
            {uploadStatus}
          </div>
        )}
      </div>

      {/* Trade Pre-Orders Console (4-Minute Gap Clustering Engine) */}
      <div className="bg-[#111115] text-white rounded-2xl p-5 border border-neutral-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-400 text-black font-bold">
                <Layers className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white tracking-wide">
                Trade Pre-Orders Console &amp; Call Audit Target Engine
              </h2>
              <span className="text-[10px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold">
                4-MIN GAP ALGORITHM
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 max-w-3xl">
              Trades for the same client code &amp; script executed within &lt; 4 minutes are clustered into <b>1 Pre-Order</b> (consolidating partial fills).
              Trades separated by &ge; 4 minutes are recognized as <b>Multiple Pre-Orders</b>.
              The console derives the exact target orders, then correlates each order with its corresponding pre-order call.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleMatchOrdersAndCalls}
              disabled={isMatchingOrders || trades.length === 0}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Derive accurate order count and match each order to its pre-order call"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isMatchingOrders ? 'animate-spin' : ''}`} />
              <span>{isMatchingOrders ? 'Matching Orders & Calls…' : 'Match Orders & Pre-Order Calls'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClustersBreakdown(!showClustersBreakdown)}
              className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-400 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-neutral-700 cursor-pointer"
            >
              <span>{showClustersBreakdown ? 'Hide Clusters' : 'Inspect Pre-Orders & Clusters'}</span>
              {showClustersBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {onNavigateToManualAudit && (
              <button
                type="button"
                onClick={onNavigateToManualAudit}
                className="px-3 py-2 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-amber-400/40 cursor-pointer"
                title="Audit missing trades via mail confirmations"
              >
                <MailCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Audit via Mail ({preOrdersSummary?.missing_calls_count ?? 0} Pending)</span>
              </button>
            )}
          </div>
        </div>

        {/* Matching Notification Banner */}
        {matchingNotification && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{matchingNotification}</span>
            </div>
            <button
              type="button"
              onClick={() => setMatchingNotification(null)}
              className="text-neutral-400 hover:text-white text-xs cursor-pointer font-bold px-2 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4 Core Quantitative Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-neutral-900/80 border border-neutral-800 p-3.5 rounded-xl">
            <div className="flex items-center gap-1.5 text-neutral-400 text-xs mb-1">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Unique Clients</span>
            </div>
            <div className="text-xl font-bold font-mono text-white">
              {preOrdersSummary?.total_unique_clients ?? '—'}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">UCCs executed across dates</div>
          </div>

          <div className="bg-neutral-900/80 border border-neutral-800 p-3.5 rounded-xl">
            <div className="flex items-center gap-1.5 text-neutral-400 text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Raw Trades</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {preOrdersSummary?.total_trades ?? trades.length}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Individual fill executions</div>
          </div>

          <div className="bg-neutral-900/80 border border-amber-500/30 p-3.5 rounded-xl bg-gradient-to-b from-amber-500/10 to-transparent">
            <div className="flex items-center gap-1.5 text-amber-300 text-xs mb-1 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Target Pre-Orders</span>
            </div>
            <div className="text-xl font-bold font-mono text-white">
              {preOrdersSummary?.total_pre_orders ?? '—'}
            </div>
            <div className="text-[11px] text-amber-400/80 mt-0.5">Exact orders from trade console</div>
          </div>

          <div className="bg-neutral-900/80 border border-neutral-800 p-3.5 rounded-xl">
            <div className="flex items-center gap-1.5 text-neutral-400 text-xs mb-1">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pre-Order Calls Matched</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {preOrdersSummary?.total_matched_calls ?? 0} / {preOrdersSummary?.total_pre_orders ?? 0}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {preOrdersSummary && preOrdersSummary.total_pre_orders > 0
                ? `${Math.round(((preOrdersSummary.total_matched_calls || 0) / preOrdersSummary.total_pre_orders) * 100)}% coverage (${preOrdersSummary.missing_calls_count ?? Math.max(0, preOrdersSummary.total_pre_orders - (preOrdersSummary.total_matched_calls || 0))} pending)`
                : 'Pending matching'}
            </div>
          </div>
        </div>

        {/* Expandable Breakdown Drawer */}
        {showClustersBreakdown && (
          <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4">
            {/* Daily summary table */}
            {preOrdersSummary?.daily_breakdown && preOrdersSummary.daily_breakdown.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Daily Pre-Order Targets Breakdown</span>
                </h4>
                <div className="overflow-x-auto rounded-xl border border-neutral-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 text-neutral-400 text-[11px] uppercase">
                      <tr>
                        <th className="py-2 px-3">Trade Date</th>
                        <th className="py-2 px-3 text-right">Unique Clients</th>
                        <th className="py-2 px-3 text-right">Raw Trades</th>
                        <th className="py-2 px-3 text-right text-amber-400">Target Pre-Orders</th>
                        <th className="py-2 px-3">Sample Client Codes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                      {preOrdersSummary.daily_breakdown.map((d) => (
                        <tr key={d.date} className="hover:bg-neutral-800/50">
                          <td className="py-2 px-3 font-bold text-white">{d.date}</td>
                          <td className="py-2 px-3 text-right text-blue-400">{d.unique_client_count}</td>
                          <td className="py-2 px-3 text-right text-neutral-400">{d.total_trades}</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-400">{d.total_pre_orders}</td>
                          <td className="py-2 px-3 text-neutral-400 font-sans text-[11px]">
                            {d.unique_clients.slice(0, 5).join(', ')}
                            {d.unique_clients.length > 5 ? ` +${d.unique_clients.length - 5} more` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Clusters List Filter & View */}
            {preOrdersSummary?.clusters && preOrdersSummary.clusters.length > 0 && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Pre-Order Clusters ({preOrdersSummary.clusters.length})</span>
                    </h4>

                    {/* Filter pills */}
                    <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setClusterStatusFilter('ALL')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${clusterStatusFilter === 'ALL' ? 'bg-amber-400 text-black font-bold' : 'text-neutral-400 hover:text-white'}`}
                      >
                        All ({preOrdersSummary.clusters.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setClusterStatusFilter('MATCHED')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${clusterStatusFilter === 'MATCHED' ? 'bg-emerald-500 text-black font-bold' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Matched ({preOrdersSummary.clusters.filter((c) => c.matched_call_id).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setClusterStatusFilter('MISSING')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${clusterStatusFilter === 'MISSING' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Pending ({preOrdersSummary.clusters.filter((c) => !c.matched_call_id).length})
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={clusterFilterClient}
                    onChange={(e) => setClusterFilterClient(e.target.value)}
                    placeholder="Filter by Client Code or Script…"
                    className="px-2.5 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-hidden focus:border-amber-400"
                  />
                </div>

                <div className="overflow-x-auto max-h-80 rounded-xl border border-neutral-800 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 text-neutral-400 text-[11px] uppercase sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Cluster / Client</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Time Window</th>
                        <th className="py-2 px-3">Script</th>
                        <th className="py-2 px-3 text-right">Fills Combined</th>
                        <th className="py-2 px-3 text-right">Total Qty</th>
                        <th className="py-2 px-3 text-right">Avg Price</th>
                        <th className="py-2 px-3">Pre-Order Call Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                      {preOrdersSummary.clusters
                        .filter((c) => {
                          if (clusterStatusFilter === 'MATCHED' && !c.matched_call_id) return false;
                          if (clusterStatusFilter === 'MISSING' && c.matched_call_id) return false;
                          if (!clusterFilterClient) return true;
                          const q = clusterFilterClient.toLowerCase();
                          return (
                            c.client_code.toLowerCase().includes(q) ||
                            c.symbol.toLowerCase().includes(q)
                          );
                        })
                        .slice(0, 150)
                        .map((c) => (
                          <tr key={c.cluster_id} className="hover:bg-neutral-800/50">
                            <td className="py-2 px-3 font-bold text-white">
                              <div>{c.client_code}</div>
                              <div className="text-[10px] text-neutral-500 font-normal">{c.cluster_id}</div>
                            </td>
                            <td className="py-2 px-3 text-neutral-400">{c.trade_date}</td>
                            <td className="py-2 px-3 text-neutral-300">
                              {c.start_time}
                              {c.start_time !== c.end_time ? ` → ${c.end_time}` : ''}
                            </td>
                            <td className="py-2 px-3 font-bold text-amber-300 font-sans">{c.symbol}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.trade_count > 1 ? 'bg-amber-400/20 text-amber-300' : 'bg-neutral-800 text-neutral-400'}`}>
                                {c.trade_count} {c.trade_count > 1 ? 'fills (<4m)' : 'fill'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white">{c.total_quantity.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-amber-400">₹{c.average_price.toFixed(2)}</td>
                            <td className="py-2 px-3">
                              {c.matched_call_id ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectCall && onSelectCall(c.matched_call_id!)}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-sans font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                  title={`Inspect Call #${c.matched_call_id}: ${c.matched_call_recording || ''}`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Call #{c.matched_call_id}</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-sans text-amber-400/80 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg">
                                  <PhoneCall className="w-2.5 h-2.5" />
                                  <span>Pending Call Audio</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trades Table Card */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <span>Imported Trades ({trades.length})</span>
            </h3>
            <p className="text-xs text-neutral-500">Real trade execution data used as factual baseline for matching &amp; Q3 auditing</p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, symbol, advisor, or phone…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 text-amber-400">Trade ID</th>
                <th className="py-2.5 px-3">Dealer</th>
                <th className="py-2.5 px-3">Advisor Name</th>
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3">Client Code</th>
                <th className="py-2.5 px-3">Phone Number</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Trading Symbol</th>
                <th className="py-2.5 px-3">Side</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-neutral-400">
                    No trading records found. Import a CSV or XLSX trade file above.
                  </td>
                </tr>
              ) : (
                filteredTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-600">#{t.id}</td>
                    <td className="py-2.5 px-3 font-mono text-neutral-500">{t.dealer || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">{t.advisor_name || '—'}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{t.team || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-900 border border-neutral-200">
                        {t.client || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-600">{t.client_number || t.phone_number || '—'}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{t.trade_date || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-neutral-500">{t.trade_time || '—'}</td>
                    <td className="py-2.5 px-3 font-bold text-neutral-900">{t.symbol || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                          t.side === 'BUY' || t.side === 'B'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {t.side || 'BUY'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <div className="flex flex-col items-end">
                        <span>{t.quantity !== undefined && t.quantity !== null ? t.quantity.toLocaleString() : '—'}</span>
                        {Boolean(t.is_combined) && (
                          <span className="text-[10px] font-sans font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded mt-0.5" title={t.notes || ''}>
                            Combined ({t.split_count || 2} fills)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <div className="flex flex-col items-end">
                        <span className={t.price_display === 'CMP' ? 'text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-xs' : 'text-amber-600'}>
                          {t.price_display === 'CMP' ? 'CMP' : (t.price !== undefined && t.price !== null ? `₹${t.price.toFixed(2)}` : '—')}
                        </span>
                        {t.price_display === 'CMP' && t.price ? (
                          <span className="text-[10px] text-neutral-400 font-normal mt-0.5">
                            Avg: ₹{t.price.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
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
