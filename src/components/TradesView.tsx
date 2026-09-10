import React, { useState } from 'react';
import { Upload, TrendingUp, Search, FileSpreadsheet, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { TradeRecord } from '../types';
import { api } from '../lib/api';

interface TradesViewProps {
  trades: TradeRecord[];
  onUploadTrades: (file: File) => Promise<void>;
  onRefreshTrades?: () => Promise<void>;
  isLoading: boolean;
}

export const TradesView: React.FC<TradesViewProps> = ({
  trades,
  onUploadTrades,
  onRefreshTrades,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [tradeFile, setTradeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

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
