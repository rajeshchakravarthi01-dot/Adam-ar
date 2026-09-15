import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MailCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Send,
  Download,
  ShieldCheck,
  Check,
  Sparkles,
  RefreshCw,
  Mail,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Layers,
  FileText,
  Clock,
  ArrowRight,
  UploadCloud,
  FileCheck2,
  HelpCircle,
  X,
  FileUp,
} from 'lucide-react';
import type { MissingCallTrade } from '../types';
import { api } from '../lib/api';
import { cleanCallerName } from '../lib/clientCode';

interface ManualTradeAuditViewProps {
  onScorecardCreated?: () => void;
  onNavigateToScorecards?: () => void;
}

interface RowState {
  mail_reference: string;
  mail_date: string;
  q1_status: string;
  q2_status: string;
  q3_status: string;
  q4_status: string;
  q5_status: string;
  score: number;
  audit_comment: string;
  phone: string;
  client: string;
  caller_name: string;
}

type SortField = 'id' | 'client' | 'advisor_name' | 'trade_date' | 'symbol' | 'score';
type SortOrder = 'asc' | 'desc';

export const ManualTradeAuditView: React.FC<ManualTradeAuditViewProps> = ({
  onScorecardCreated,
  onNavigateToScorecards,
}) => {
  const [trades, setTrades] = useState<MissingCallTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'AUDITED'>('ALL');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Edit state per trade id
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [successIds, setSuccessIds] = useState<Set<number>>(new Set());
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // User Mandate: Mail Confirmation / PDF Upload & Auto-Resolve States
  const [isUploadingPdfs, setIsUploadingPdfs] = useState(false);
  const [isResolvingReviews, setIsResolvingReviews] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<any | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploadingPdfs(true);
    setErrorMessage(null);
    setUploadSummary(null);

    try {
      const formData = new FormData();
      fileArray.forEach((f) => formData.append('files', f));

      const res = await api.uploadMailConfirmations(formData);
      if (res.ok && res.summary) {
        setUploadSummary(res.summary);
        setActionMessage(
          `Mail Confirmation Audit: ${res.summary.matchedCount} trade(s) successfully verified and scorecards published!`
        );
        await fetchMissingTrades();
        if (onScorecardCreated) onScorecardCreated();
      } else {
        setErrorMessage(res.message || 'Failed to process mail confirmation PDFs.');
      }
    } catch (err: any) {
      console.error('Mail confirmation upload failed:', err);
      setErrorMessage(err.message || 'Error uploading and matching mail confirmation files.');
    } finally {
      setIsUploadingPdfs(false);
    }
  };

  const handleAutoResolveReviews = async () => {
    setIsResolvingReviews(true);
    setErrorMessage(null);
    try {
      const res = await api.autoResolveReviews();
      if (res.ok) {
        setActionMessage(`Automated review resolved ${res.resolvedCount} call(s). Audits and scorecards updated.`);
        await fetchMissingTrades();
        if (onScorecardCreated) onScorecardCreated();
      } else {
        setErrorMessage('Failed to auto-resolve reviews.');
      }
    } catch (err: any) {
      console.error('Auto resolve reviews failed:', err);
      setErrorMessage(err.message || 'Error auto-resolving reviews.');
    } finally {
      setIsResolvingReviews(false);
    }
  };

  const fetchMissingTrades = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getMissingCallTrades();
      if (res.ok && Array.isArray(res.missing_trades)) {
        setTrades(res.missing_trades);
      }
    } catch (err: any) {
      console.error('Failed to fetch missing call trades:', err);
      setErrorMessage(err.message || 'Failed to load trades without call recordings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMissingTrades();
  }, []);

  const getRow = (t: MissingCallTrade): RowState => {
    if (rowStates[t.id]) return rowStates[t.id];
    const today = new Date().toISOString().slice(0, 10);
    const dateStr = t.trade_date ? String(t.trade_date).slice(0, 10) : today;
    return {
      mail_reference: t.mail_reference || `Client mail confirmation verified on ${dateStr}`,
      mail_date: dateStr,
      q1_status: 'PASS',
      q2_status: 'PASS',
      q3_status: 'PASS',
      q4_status: 'PASS',
      q5_status: 'PASS',
      score: 5,
      audit_comment: 'Pre-order instruction confirmed and verified via authorized client email confirmation.',
      phone: t.phone_number || t.client_number || '',
      client: t.client || '',
      caller_name: cleanCallerName(t.advisor_name || t.dealer || 'Advisor'),
    };
  };

  const handleCellChange = (t: MissingCallTrade, field: keyof RowState, value: any) => {
    const current = getRow(t);
    const updated: RowState = { ...current, [field]: value };

    if (
      field === 'q1_status' ||
      field === 'q2_status' ||
      field === 'q3_status' ||
      field === 'q5_status'
    ) {
      const q1 = field === 'q1_status' ? value : updated.q1_status;
      const q2 = field === 'q2_status' ? value : updated.q2_status;
      const q3 = field === 'q3_status' ? value : updated.q3_status;
      const q5 = field === 'q5_status' ? value : updated.q5_status;

      const isFatal = q1 === 'FAIL' || q2 === 'FAIL' || q5 === 'FAIL';
      if (isFatal) {
        updated.score = 0;
        updated.audit_comment = 'NON-COMPLIANT: Mail confirmation failed regulatory verification standards.';
      } else {
        let sc = 5;
        if (q3 !== 'PASS') sc -= 1;
        updated.score = sc;
        updated.audit_comment =
          sc === 5
            ? 'Pre-order instruction confirmed and verified via authorized client email confirmation.'
            : 'Pre-order verified from mail confirmation with minor trade remarks.';
      }
    }

    setRowStates((prev) => ({ ...prev, [t.id]: updated }));
  };

  const handleAuditSingle = async (trade: MissingCallTrade) => {
    setSubmittingId(trade.id);
    setErrorMessage(null);
    try {
      const state = getRow(trade);
      const res = await api.manualAuditTrade(trade.id, {
        mail_reference: state.mail_reference,
        mail_date: state.mail_date,
        q1_status: state.q1_status,
        q2_status: state.q2_status,
        q3_status: state.q3_status,
        q4_status: 'PASS',
        q5_status: state.q5_status,
        score: state.score,
        audit_comment: state.audit_comment,
        phone: state.phone,
        client_code: state.client,
        advisor_name: state.caller_name,
      });

      if (res.ok) {
        setSuccessIds((prev) => new Set(prev).add(trade.id));
        setActionMessage(`Trade #${trade.id} successfully audited from mail confirmation and sent to Scorecards!`);
        // Update local state
        setTrades((prev) =>
          prev.map((item) =>
            item.id === trade.id
              ? { ...item, has_scorecard: true, scorecard_id: res.scorecard_id, audit_status: 'AUDITED_MAIL' }
              : item
          )
        );
        if (onScorecardCreated) onScorecardCreated();
      }
    } catch (err: any) {
      console.error('Audit failed:', err);
      setErrorMessage(err.message || 'Failed to submit trade audit.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleBulkApprovePending = async () => {
    const pending = filteredTrades.filter((t) => !t.has_scorecard);
    if (pending.length === 0) return;

    setIsBulkSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = pending.map((trade) => {
        const state = getRow(trade);
        return {
          trade_id: trade.id,
          mail_reference: state.mail_reference,
          mail_date: state.mail_date,
          q1_status: state.q1_status,
          q2_status: state.q2_status,
          q3_status: state.q3_status,
          q4_status: 'PASS',
          q5_status: state.q5_status,
          score: state.score,
          audit_comment: state.audit_comment,
          phone: state.phone,
          client_code: state.client,
          advisor_name: state.caller_name,
        };
      });

      const res = await api.bulkManualAuditTrades(payload);
      if (res.ok) {
        setActionMessage(`Successfully audited ${res.count} trades via mail confirmation! Scorecards generated.`);
        fetchMissingTrades();
        if (onScorecardCreated) onScorecardCreated();
      }
    } catch (err: any) {
      console.error('Bulk audit failed:', err);
      setErrorMessage(err.message || 'Failed to bulk audit trades.');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (trades.length === 0) return;
    const headers = [
      'Trade ID',
      'Client UCC',
      'Advisor',
      'Trade Date',
      'Phone',
      'Symbol',
      'Quantity',
      'Price',
      'Audit Status',
      'Score',
      'Mail Reference',
    ];
    const rows = trades.map((t) => {
      const s = getRow(t);
      return [
        t.id,
        t.client || '',
        t.advisor_name || '',
        t.trade_date || '',
        t.phone_number || t.client_number || '',
        t.symbol || '',
        t.quantity || '',
        t.price || '',
        t.has_scorecard ? 'AUDITED' : 'PENDING',
        s.score,
        s.mail_reference,
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`);
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `missing_calls_trade_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered and sorted
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        if (statusFilter === 'PENDING' && t.has_scorecard) return false;
        if (statusFilter === 'AUDITED' && !t.has_scorecard) return false;

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          String(t.id).includes(term) ||
          (t.client && t.client.toLowerCase().includes(term)) ||
          (t.advisor_name && t.advisor_name.toLowerCase().includes(term)) ||
          (t.symbol && t.symbol.toLowerCase().includes(term)) ||
          (t.phone_number && t.phone_number.includes(term)) ||
          (t.client_number && t.client_number.includes(term))
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField as keyof MissingCallTrade];
        let valB: any = b[sortField as keyof MissingCallTrade];
        if (sortField === 'score') {
          valA = getRow(a).score;
          valB = getRow(b).score;
        }
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (sortOrder === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
  }, [trades, searchTerm, statusFilter, sortField, sortOrder, rowStates]);

  const pendingCount = trades.filter((t) => !t.has_scorecard).length;
  const auditedCount = trades.filter((t) => t.has_scorecard).length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-5">
      {/* Notifications */}
      {actionMessage && (
        <div className="glass-panel border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between shadow-lg shadow-emerald-500/10">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="hover:opacity-75 cursor-pointer text-emerald-400">
            &times;
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="glass-panel border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg shadow-rose-500/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="hover:opacity-75 cursor-pointer text-rose-400">
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
              <MailCheck className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-neutral-100">
              Manual Trade Audit (Missing Call / Mail Confirmation)
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md glass-inner text-teal-300 border border-white/10">
              {trades.length} Executed Trades
            </span>
            {pendingCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                {pendingCount} Pending Mail Audit
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Reconcile executed trades that have missing telephony call recordings. Enter authorized client email
            confirmation references, adjust rubric criteria (Q1–Q5), and publish directly to Scorecards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.eml,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handlePdfFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPdfs}
            className="px-3.5 py-2 glass-panel hover:bg-teal-500/20 text-teal-300 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-teal-400/30 transition-all cursor-pointer shadow-md shadow-teal-500/10"
          >
            <UploadCloud className={`w-3.5 h-3.5 text-teal-400 ${isUploadingPdfs ? 'animate-bounce' : ''}`} />
            <span>{isUploadingPdfs ? 'Processing PDFs...' : 'Upload Mail / PDF Confirmations'}</span>
          </button>

          <button
            onClick={handleAutoResolveReviews}
            disabled={isResolvingReviews}
            className="px-3 py-2 glass-inner hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 border border-emerald-500/30 transition-colors cursor-pointer"
            title="Auto-resolve calls in Review Required state"
          >
            <Sparkles className={`w-3.5 h-3.5 text-emerald-400 ${isResolvingReviews ? 'animate-spin' : ''}`} />
            <span>{isResolvingReviews ? 'Resolving...' : 'Auto-Resolve Reviews'}</span>
          </button>

          {pendingCount > 0 && (
            <button
              onClick={handleBulkApprovePending}
              disabled={isBulkSubmitting}
              className="px-3.5 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isBulkSubmitting ? 'Auditing...' : `Approve & Publish All (${pendingCount})`}</span>
            </button>
          )}

          <button
            onClick={exportCSV}
            className="px-3 py-2 glass-inner hover:bg-white/10 text-neutral-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-neutral-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={fetchMissingTrades}
            disabled={isLoading}
            className="p-2 glass-inner hover:bg-white/10 text-neutral-300 rounded-xl border border-white/10 cursor-pointer transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Upload Drop Zone for Mail / PDF Confirmations */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files) handlePdfFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${
          isDragOver
            ? 'border-teal-400 bg-teal-400/10 shadow-lg shadow-teal-400/10'
            : 'border-white/15 hover:border-teal-400/40 glass-panel shadow-xl'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-400/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-400/30">
            <FileUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-100 flex items-center gap-1.5">
              <span>Automatic Mail / PDF Trade Audit Upload</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-400/20 text-teal-300 border border-teal-400/30">
                SEBI Matching Rules
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Drag and drop client confirmation PDFs or email exports (.pdf, .eml, .txt). Matches stock name,
              quantity, and price. If CMP (Current Market Price) is mentioned, price is automatically accepted.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPdfs}
            className="px-3.5 py-1.5 glass-inner hover:bg-white/10 text-neutral-200 font-bold text-xs rounded-xl border border-white/10 shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-teal-400" />
            <span>Select PDF Files</span>
          </button>
        </div>
      </div>

      {/* Upload Results Summary Modal / Card */}
      {uploadSummary && (
        <div className="glass-panel border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-emerald-300">
                Mail Confirmation Matching Results ({uploadSummary.matchedCount} Matched / {uploadSummary.filesProcessed} Files Processed)
              </h3>
            </div>
            <button
              onClick={() => setUploadSummary(null)}
              className="text-emerald-400 hover:text-emerald-300 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {uploadSummary.matches && uploadSummary.matches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {uploadSummary.matches.map((m: any, idx: number) => (
                <div key={idx} className="glass-inner p-2.5 rounded-xl border border-emerald-500/30 text-[11px] space-y-1">
                  <div className="flex items-center justify-between font-bold text-neutral-200">
                    <span>Trade #{m.tradeId} &bull; {m.symbol}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30">
                      Score: 5 / 5
                    </span>
                  </div>
                  <div className="text-neutral-400">
                    Qty: <span className="font-semibold text-neutral-200">{m.quantity}</span> | Price:{' '}
                    <span className="font-semibold text-neutral-200">
                      {m.isCmp ? 'CMP (Market Price Passed)' : `₹${m.price}`}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate" title={m.fileName}>
                    File: {m.fileName}
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadSummary.unmatchedFiles && uploadSummary.unmatchedFiles.length > 0 && (
            <div className="text-[11px] text-amber-300 glass-inner p-2 rounded-lg border border-amber-400/30">
              <span className="font-semibold">Unmatched files ({uploadSummary.unmatchedFiles.length}):</span>{' '}
              {uploadSummary.unmatchedFiles.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-panel p-4 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
              Total Trades Missing Calls
            </div>
            <div className="text-xl font-bold text-neutral-100 mt-0.5">{trades.length}</div>
          </div>
          <div className="p-2.5 rounded-xl glass-inner text-teal-400 border border-white/10">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
              Pending Mail Audit
            </div>
            <div className="text-xl font-bold text-teal-400 mt-0.5">{pendingCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-400/20">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
              Audited &amp; Sent to Scorecards
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{auditedCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel p-3.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Trade ID, Client UCC, Symbol, Advisor..."
            className="w-full pl-8 pr-3 py-1.5 glass-input rounded-lg text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-neutral-400 whitespace-nowrap">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 glass-input rounded-lg text-xs font-medium"
          >
            <option value="ALL">All ({trades.length})</option>
            <option value="PENDING">Pending Audit ({pendingCount})</option>
            <option value="AUDITED">Audited ({auditedCount})</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="glass-panel rounded-xl overflow-hidden border border-white/10 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="glass-inner text-neutral-300 text-[11px] uppercase tracking-wider font-semibold border-b border-white/10">
              <tr>
                <th
                  onClick={() => toggleSort('id')}
                  className="py-3 px-3 cursor-pointer hover:text-white text-teal-400 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Trade #</span>
                    {sortField === 'id' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('client')}
                  className="py-3 px-3 cursor-pointer hover:text-white select-none whitespace-nowrap min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Client UCC</span>
                    {sortField === 'client' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('advisor_name')}
                  className="py-3 px-3 cursor-pointer hover:text-white select-none whitespace-nowrap min-w-[130px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Advisor</span>
                    {sortField === 'advisor_name' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('trade_date')}
                  className="py-3 px-3 cursor-pointer hover:text-white select-none whitespace-nowrap min-w-[100px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Trade Date</span>
                    {sortField === 'trade_date' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">Phone CLI</th>
                <th
                  onClick={() => toggleSort('symbol')}
                  className="py-3 px-3 cursor-pointer hover:text-white select-none whitespace-nowrap min-w-[130px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Trade Details</span>
                    {sortField === 'symbol' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-3 min-w-[240px]">Mail Confirmation Ref / Proof</th>
                <th className="py-3 px-1.5 text-center whitespace-nowrap" title="Q1: Registered Number / Authorised (Fatal)">
                  <div className="text-teal-400 font-bold">Q1</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th className="py-3 px-1.5 text-center whitespace-nowrap" title="Q2: Client UCC explicitly stated (Fatal)">
                  <div className="text-teal-400 font-bold">Q2</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th className="py-3 px-1.5 text-center whitespace-nowrap" title="Q3: Stock, Quantity & Price confirmed (1 Pt)">
                  <div className="text-teal-400 font-bold">Q3</div>
                  <div className="text-[9px] text-neutral-400 normal-case">1 Pt</div>
                </th>
                <th className="py-3 px-1.5 text-center whitespace-nowrap" title="Q4: Customer Acknowledgement (Compliant per regulatory rubric)">
                  <div className="text-teal-400 font-bold">Q4</div>
                  <div className="text-[9px] text-emerald-400 font-bold normal-case">PASS</div>
                </th>
                <th className="py-3 px-1.5 text-center whitespace-nowrap" title="Q5: Return / Profit Guarantee Prohibition (Fatal)">
                  <div className="text-teal-400 font-bold">Q5</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th
                  onClick={() => toggleSort('score')}
                  className="py-3 px-2 text-center cursor-pointer hover:text-white select-none whitespace-nowrap"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Score</span>
                    {sortField === 'score' ? (
                      sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 text-neutral-500" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap min-w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-neutral-400">
                    <Mail className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                    <div className="text-sm font-semibold text-neutral-300">No Missing Call Trades Found</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      All uploaded trades currently have linked audio call recordings or no trades match filters.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTrades.map((t) => {
                  const state = getRow(t);
                  const isSubmitting = submittingId === t.id;
                  const isSuccess = successIds.has(t.id) || t.has_scorecard;
                  const isFatal = state.score === 0;

                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors hover:bg-white/5 ${
                        isSuccess
                          ? 'bg-emerald-500/10'
                          : isFatal
                          ? 'border-l-4 border-l-rose-500'
                          : 'border-l-4 border-l-teal-500'
                      }`}
                    >
                      {/* Trade ID */}
                      <td className="py-2.5 px-3 font-mono font-bold text-teal-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>#{t.id}</span>
                          {t.side && (
                            <span
                              className={`text-[9px] font-bold px-1 py-0.2 rounded-xs uppercase ${
                                t.side.toUpperCase() === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {t.side}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Client UCC */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.client}
                          onChange={(e) => handleCellChange(t, 'client', e.target.value)}
                          className="w-full px-1.5 py-1 bg-transparent hover:bg-white/5 focus:bg-black/50 border border-transparent hover:border-white/10 focus:border-teal-400 rounded-md text-xs font-mono font-bold text-teal-300 focus:outline-hidden"
                        />
                      </td>

                      {/* Advisor */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.caller_name}
                          onChange={(e) => handleCellChange(t, 'caller_name', e.target.value)}
                          className="w-full px-1.5 py-1 bg-transparent hover:bg-white/5 focus:bg-black/50 border border-transparent hover:border-white/10 focus:border-teal-400 rounded-md text-xs text-neutral-200 focus:outline-hidden"
                        />
                      </td>

                      {/* Trade Date */}
                      <td className="py-2 px-3 text-neutral-400 whitespace-nowrap font-mono text-[11px]">
                        {t.trade_date ? String(t.trade_date).slice(0, 10) : '—'}
                      </td>

                      {/* Phone CLI */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.phone}
                          onChange={(e) => handleCellChange(t, 'phone', e.target.value)}
                          className="w-full px-1.5 py-1 bg-transparent hover:bg-white/5 focus:bg-black/50 border border-transparent hover:border-white/10 focus:border-teal-400 rounded-md text-xs font-mono text-neutral-300 focus:outline-hidden"
                        />
                      </td>

                      {/* Trade Details */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-semibold text-neutral-100">{t.symbol || '—'}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          {t.quantity || 0} qty @ ₹{t.price || 0}
                        </div>
                      </td>

                      {/* Mail Reference / Proof */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={state.mail_reference}
                            onChange={(e) => handleCellChange(t, 'mail_reference', e.target.value)}
                            placeholder="e.g. Email from client@auditeq.com on 2026-09-07..."
                            className="w-full px-2 py-1 glass-input rounded-md text-xs"
                          />
                        </div>
                      </td>

                      {/* Q1 Select */}
                      <td className="py-2 px-1 text-center">
                        <select
                          value={state.q1_status}
                          onChange={(e) => handleCellChange(t, 'q1_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1 py-0.5 rounded-md border cursor-pointer ${
                            state.q1_status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <option value="PASS" className="bg-neutral-900 text-emerald-300">PASS</option>
                          <option value="FAIL" className="bg-neutral-900 text-rose-300">FAIL</option>
                        </select>
                      </td>

                      {/* Q2 Select */}
                      <td className="py-2 px-1 text-center">
                        <select
                          value={state.q2_status}
                          onChange={(e) => handleCellChange(t, 'q2_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1 py-0.5 rounded-md border cursor-pointer ${
                            state.q2_status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <option value="PASS" className="bg-neutral-900 text-emerald-300">PASS</option>
                          <option value="FAIL" className="bg-neutral-900 text-rose-300">FAIL</option>
                        </select>
                      </td>

                      {/* Q3 Select */}
                      <td className="py-2 px-1 text-center">
                        <select
                          value={state.q3_status}
                          onChange={(e) => handleCellChange(t, 'q3_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1 py-0.5 rounded-md border cursor-pointer ${
                            state.q3_status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <option value="PASS" className="bg-neutral-900 text-emerald-300">PASS</option>
                          <option value="FAIL" className="bg-neutral-900 text-rose-300">FAIL</option>
                        </select>
                      </td>

                      {/* Q4 (Customer Ack) */}
                      <td className="py-2 px-1 text-center whitespace-nowrap" title="Not audited: Always PASS per regulatory rubric">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          <span>PASS</span>
                        </span>
                      </td>

                      {/* Q5 Select */}
                      <td className="py-2 px-1 text-center">
                        <select
                          value={state.q5_status}
                          onChange={(e) => handleCellChange(t, 'q5_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1 py-0.5 rounded-md border cursor-pointer ${
                            state.q5_status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <option value="PASS" className="bg-neutral-900 text-emerald-300">PASS</option>
                          <option value="FAIL" className="bg-neutral-900 text-rose-300">FAIL</option>
                        </select>
                      </td>

                      {/* Score Badge */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded-full ${
                            state.score === 5
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : state.score === 4
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-black'
                          }`}
                        >
                          {state.score}/5
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {isSuccess ? (
                          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-bold bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Audited &amp; Published</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAuditSingle(t)}
                            disabled={isSubmitting}
                            className="px-3 py-1.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-teal-500/20 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3 text-slate-950" />
                            <span>{isSubmitting ? 'Sending...' : 'Audit & Send'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
