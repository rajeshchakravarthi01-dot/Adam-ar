import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  User,
  Calendar,
  Clock,
  Volume2,
  Edit3,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { AuditRecord, CallRecord } from '../types';
import { TranscriptHighlighter } from './TranscriptHighlighter';

interface AuditViewProps {
  audits: AuditRecord[];
  calls: CallRecord[];
  onForceAudit: (callId: number) => Promise<void>;
  onReviewAudit: (auditId: number, data: Partial<AuditRecord>) => Promise<void>;
  isLoading: boolean;
}

type FilterStatus = 'all' | 'pass' | 'fail' | 'not_audited' | 'scrap' | 'regular';

export const AuditView: React.FC<AuditViewProps> = ({
  audits,
  calls,
  onForceAudit,
  onReviewAudit,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [auditingCallId, setAuditingCallId] = useState<number | null>(null);

  // Review / Edit Modal State
  const [editingAudit, setEditingAudit] = useState<AuditRecord | null>(null);
  const [editQ1, setEditQ1] = useState<'PASS' | 'FAIL'>('PASS');
  const [editQ2, setEditQ2] = useState<'PASS' | 'FAIL'>('PASS');
  const [editQ3, setEditQ3] = useState<'PASS' | 'FAIL'>('PASS');
  const [editQ4, setEditQ4] = useState<'PASS' | 'FAIL'>('PASS');
  const [editQ5, setEditQ5] = useState<'PASS' | 'FAIL'>('PASS');
  const [editQ1Ev, setEditQ1Ev] = useState('');
  const [editQ2Ev, setEditQ2Ev] = useState('');
  const [editQ3Ev, setEditQ3Ev] = useState('');
  const [editQ4Ev, setEditQ4Ev] = useState('');
  const [editQ5Ev, setEditQ5Ev] = useState('');
  const [editComment, setEditComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Map audits by call_id for instant O(1) lookup
  const auditByCallId = useMemo(() => {
    const map = new Map<number, AuditRecord>();
    audits.forEach((a) => {
      map.set(a.call_id, a);
    });
    return map;
  }, [audits]);

  // Unified items representing all calls with their corresponding audit state
  const unifiedItems = useMemo(() => {
    return calls.map((call) => {
      const audit = auditByCallId.get(call.id);
      const dur = call.duration_seconds || 0;
      const isScrap = call.classification === 'SCRAP' || call.status === 'scrap' || (dur > 0 && dur < 6);
      const isRegular = call.classification === 'REGULAR' || call.status === 'regular' || call.call_type === 'regular' || call.call_type === 'non_pre_order';

      let computedStatus: 'pass' | 'fail' | 'not_audited' | 'scrap' | 'regular' = 'not_audited';

      if (isScrap) {
        computedStatus = 'scrap';
      } else if (isRegular) {
        computedStatus = 'regular';
      } else if (audit && (audit.status === 'audited' || audit.status === 'scored')) {
        const isFatal = audit.is_fatal === 1 || audit.is_fatal === true || audit.score === 0 ||
          audit.q1 === 'FAIL' || audit.q2 === 'FAIL' || audit.q5 === 'FAIL' ||
          audit.compliance_disposition === 'FAIL' || audit.compliance_disposition === 'NON_COMPLIANT';
        computedStatus = isFatal ? 'fail' : (audit.score != null && audit.score > 0 ? 'pass' : 'not_audited');
      } else {
        computedStatus = 'not_audited';
      }

      return {
        call,
        audit,
        computedStatus,
      };
    });
  }, [calls, auditByCallId]);

  // Filter items
  const filteredItems = useMemo(() => {
    return unifiedItems.filter(({ call, audit, computedStatus }) => {
      // Status filter
      if (statusFilter !== 'all' && computedStatus !== statusFilter) {
        return false;
      }

      // Date filter
      const itemDate = call.call_date || (call.created_at ? call.created_at.slice(0, 10) : '');
      if (fromDate && itemDate && itemDate < fromDate) return false;
      if (toDate && itemDate && itemDate > toDate) return false;

      // Search keyword filter (client id, call number, date, caller name, recording name)
      if (search.trim()) {
        const q = search.toLowerCase();
        const clientMatch = (call.client || call.client_number || '').toLowerCase().includes(q);
        const callerMatch = (call.caller_name || call.dealer || '').toLowerCase().includes(q);
        const phoneMatch = (call.phone_number || call.calling_number || call.registered_number || '').includes(q);
        const recMatch = (call.recording_name || '').toLowerCase().includes(q);
        const idMatch = String(call.id).includes(q) || (audit ? String(audit.id).includes(q) : false);
        const commentMatch = audit?.audit_comment ? audit.audit_comment.toLowerCase().includes(q) : false;
        const dateMatch = itemDate.includes(q);

        if (!clientMatch && !callerMatch && !phoneMatch && !recMatch && !idMatch && !commentMatch && !dateMatch) {
          return false;
        }
      }

      return true;
    });
  }, [unifiedItems, statusFilter, fromDate, toDate, search]);

  // Statistics counts
  const stats = useMemo(() => {
    let passCount = 0;
    let failCount = 0;
    let notAuditedCount = 0;
    let scrapCount = 0;
    let regularCount = 0;

    unifiedItems.forEach(({ computedStatus }) => {
      if (computedStatus === 'pass') passCount++;
      else if (computedStatus === 'fail') failCount++;
      else if (computedStatus === 'not_audited') notAuditedCount++;
      else if (computedStatus === 'scrap') scrapCount++;
      else if (computedStatus === 'regular') regularCount++;
    });

    return {
      total: unifiedItems.length,
      pass: passCount,
      fail: failCount,
      notAudited: notAuditedCount,
      scrap: scrapCount,
      regular: regularCount,
    };
  }, [unifiedItems]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  // Selection handlers
  const handleSelectAllOnPage = (checked: boolean) => {
    const next = new Set(selectedCallIds);
    paginatedItems.forEach(({ call }) => {
      if (checked) next.add(call.id);
      else next.delete(call.id);
    });
    setSelectedCallIds(next);
  };

  const toggleSelectCall = (callId: number) => {
    const next = new Set(selectedCallIds);
    if (next.has(callId)) next.delete(callId);
    else next.add(callId);
    setSelectedCallIds(next);
  };

  // Run audit for single call
  const handleRunAudit = async (callId: number) => {
    setAuditingCallId(callId);
    try {
      await onForceAudit(callId);
    } catch (err: unknown) {
      alert(`Audit failed: ${(err as Error).message}`);
    } finally {
      setAuditingCallId(null);
    }
  };

  // Bulk audit selected calls concurrently via backend
  const handleBulkReAudit = async () => {
    const ids = Array.from(selectedCallIds);
    if (ids.length === 0) {
      alert('Please select calls to re-audit.');
      return;
    }
    if (!confirm(`Re-audit ${ids.length} selected calls with compliance audit engine?`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/calls/bulk-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ call_ids: ids }),
      });

      const json = await res.json();
      if (json.ok) {
        alert(`Bulk audit complete: ${json.audited} audited successfully, ${json.blocked} blocked by compliance gates, ${json.failed} errors.`);
        window.location.reload();
      } else {
        alert(`Bulk audit failed: ${json.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Bulk audit request error:', err);
      alert(`Bulk audit error: ${err.message}`);
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = (onlySelected = false) => {
    const targetItems = onlySelected
      ? filteredItems.filter(({ call }) => selectedCallIds.has(call.id))
      : filteredItems;

    if (targetItems.length === 0) {
      alert('No audit records to export.');
      return;
    }

    const data = targetItems.map(({ call, audit, computedStatus }) => {
      return {
        'Call ID': call.id,
        'Recording Name': call.recording_name || '—',
        'Date': call.call_date || (call.created_at ? call.created_at.slice(0, 10) : '—'),
        'Time': call.call_time || '—',
        'Duration (sec)': call.duration_seconds || '—',
        'Call Classification': call.call_type || (call.duration_seconds && call.duration_seconds < 8 ? 'scrap' : 'pre_order'),
        'Advisor / Caller': call.caller_name || call.dealer || audit?.caller_name || '—',
        'Client ID / Code': call.client || call.client_number || audit?.client || '—',
        'Calling Number': call.calling_number || call.phone_number || '—',
        'Registered Number': call.registered_number || '—',
        'Audit Status': computedStatus.toUpperCase(),
        'Q1 Reg Phone Status': audit?.q1 || '—',
        'Q1 Evidence': audit?.q1_evidence || '',
        'Q2 Client UCC Verbal': audit?.q2 || '—',
        'Q2 Evidence': audit?.q2_evidence || '',
        'Q3 Stock Price Qty': audit?.q3 || '—',
        'Q3 Evidence': audit?.q3_evidence || '',
        'Q4 Cust Ack': audit?.q4 || '—',
        'Q4 Evidence': audit?.q4_evidence || '',
        'Q5 No Return Comm': audit?.q5 || '—',
        'Q5 Evidence': audit?.q5_evidence || '',
        'Fatal Flag': computedStatus === 'fail' ? 'YES' : 'NO',
        'Audit Remarks': audit?.audit_comment || '',
        'Audit Timestamp': audit?.created_at || '—',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit_Report');
    XLSX.writeFile(wb, `AuditEQ_Audit_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export to CSV (.csv)
  const handleExportCsv = (onlySelected = false) => {
    const targetItems = onlySelected
      ? filteredItems.filter(({ call }) => selectedCallIds.has(call.id))
      : filteredItems;

    if (targetItems.length === 0) {
      alert('No audit records to export.');
      return;
    }

    const headers = [
      'Call ID',
      'Recording Name',
      'Date',
      'Advisor',
      'Client ID',
      'Calling Number',
      'Call Type',
      'Audit Status',
      'Q1 Phone',
      'Q2 UCC',
      'Q3 Stock Qty Price',
      'Q4 Ack',
      'Q5 Return Comm',
      'Fatal Flag',
      'Audit Remarks',
    ];

    const rows = targetItems.map(({ call, audit, computedStatus }) => [
      call.id,
      `"${(call.recording_name || '').replace(/"/g, '""')}"`,
      call.call_date || (call.created_at ? call.created_at.slice(0, 10) : ''),
      `"${(call.caller_name || call.dealer || audit?.caller_name || '').replace(/"/g, '""')}"`,
      `"${(call.client || call.client_number || audit?.client || '').replace(/"/g, '""')}"`,
      `"${(call.calling_number || call.phone_number || '').replace(/"/g, '""')}"`,
      call.call_type || '',
      computedStatus.toUpperCase(),
      audit?.q1 || '',
      audit?.q2 || '',
      audit?.q3 || '',
      audit?.q4 || '',
      audit?.q5 || '',
      computedStatus === 'fail' ? 'YES' : 'NO',
      `"${(audit?.audit_comment || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AuditEQ_Audits_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Review Edit
  const startEdit = (a: AuditRecord) => {
    setEditingAudit(a);
    setEditQ1(a.q1 === 'FAIL' ? 'FAIL' : 'PASS');
    setEditQ2(a.q2 === 'FAIL' ? 'FAIL' : 'PASS');
    setEditQ3(a.q3 === 'FAIL' ? 'FAIL' : 'PASS');
    setEditQ4(a.q4 === 'FAIL' ? 'FAIL' : 'PASS');
    setEditQ5(a.q5 === 'FAIL' ? 'FAIL' : 'PASS');
    setEditQ1Ev(a.q1_evidence || '');
    setEditQ2Ev(a.q2_evidence || '');
    setEditQ3Ev(a.q3_evidence || '');
    setEditQ4Ev(a.q4_evidence || '');
    setEditQ5Ev(a.q5_evidence || '');
    setEditComment(a.audit_comment || '');
  };

  const handleSaveReview = async () => {
    if (!editingAudit) return;
    setIsSaving(true);
    try {
      await onReviewAudit(editingAudit.id, {
        q1: editQ1,
        q2: editQ2,
        q3: editQ3,
        q4: editQ4,
        q5: editQ5,
        q1_evidence: editQ1Ev,
        q2_evidence: editQ2Ev,
        q3_evidence: editQ3Ev,
        q4_evidence: editQ4Ev,
        q5_evidence: editQ5Ev,
        audit_comment: editComment,
      });
      setEditingAudit(null);
    } catch (err) {
      alert(`Save review failed: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner - Liquid Glass styling */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <CheckSquare className="w-4 h-4" />
            </span>
            <span>Compliance Audit Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Unified regulatory verification for pre-order compliance, trade validation &amp; fatal flag detection.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleExportExcel(false)}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            title="Download full audit list in Excel (.xlsx) format"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Export</span>
          </button>
          <button
            onClick={() => handleExportCsv(false)}
            className="px-3.5 py-2 bg-slate-900/80 hover:bg-slate-800 text-teal-300 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 border border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.15)]"
            title="Download full audit list in CSV format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Export</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'all'
              ? 'glass-panel bg-teal-500/20 border-teal-400 text-white font-bold ring-1 ring-teal-400/50 shadow-[0_0_20px_rgba(20,184,166,0.25)]'
              : 'glass-panel-subtle hover:border-teal-500/30 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-400">Total Audits</div>
          <div className="text-xl font-extrabold text-white font-mono mt-0.5">{stats.total}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('pass'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'pass'
              ? 'glass-panel bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold ring-1 ring-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
              : 'glass-panel-subtle hover:border-emerald-500/30 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Compliant</span>
          </div>
          <div className="text-xl font-extrabold text-emerald-300 font-mono mt-0.5">{stats.pass}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('fail'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'fail'
              ? 'glass-panel bg-rose-500/20 border-rose-400 text-rose-200 font-bold ring-1 ring-rose-400/50 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
              : 'glass-panel-subtle hover:border-rose-500/30 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>Fatal Flaws</span>
          </div>
          <div className="text-xl font-extrabold text-rose-300 font-mono mt-0.5">{stats.fail}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('not_audited'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'not_audited'
              ? 'glass-panel bg-amber-500/20 border-amber-400 text-amber-200 font-bold ring-1 ring-amber-400/50 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
              : 'glass-panel-subtle hover:border-amber-500/30 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Pending</span>
          </div>
          <div className="text-xl font-extrabold text-amber-300 font-mono mt-0.5">{stats.notAudited}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('scrap'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'scrap'
              ? 'glass-panel bg-slate-700/50 border-slate-400 text-slate-200 font-bold ring-1 ring-slate-400/50'
              : 'glass-panel-subtle hover:border-slate-600 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Scrap (&lt;6s)</span>
          </div>
          <div className="text-xl font-extrabold text-slate-300 font-mono mt-0.5">{stats.scrap}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('regular'); setCurrentPage(1); }}
          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
            statusFilter === 'regular'
              ? 'glass-panel bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold ring-1 ring-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
              : 'glass-panel-subtle hover:border-cyan-500/30 text-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-cyan-400 flex items-center gap-1">
            <Phone className="w-3 h-3" />
            <span>Regular Calls</span>
          </div>
          <div className="text-xl font-extrabold text-cyan-300 font-mono mt-0.5">{stats.regular}</div>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by client ID, advisor, phone, recording name, or date…"
              className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-teal-500/20 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40"
            />
          </div>

          {/* Date range filters */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-teal-500/20">
              <span className="text-[11px] font-bold text-slate-400">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-xs font-mono text-slate-200 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-teal-500/20">
              <span className="text-[11px] font-bold text-slate-400">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-xs font-mono text-slate-200 outline-none"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-bold px-1.5 py-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-400">Page Size:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-slate-950/60 border border-teal-500/20 text-xs font-bold text-slate-200 py-1.5 px-2.5 rounded-xl cursor-pointer focus:border-teal-400"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
            </select>
          </div>
        </div>

        {/* Selected Batch Actions Bar */}
        {selectedCallIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 p-2.5 bg-teal-500/15 border border-teal-500/30 rounded-xl text-xs">
            <div className="font-bold text-teal-200 flex items-center gap-2">
              <span>{selectedCallIds.size} calls selected</span>
              <button
                onClick={() => setSelectedCallIds(new Set())}
                className="text-[11px] text-slate-400 underline font-normal hover:text-white cursor-pointer"
              >
                Deselect all
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportExcel(true)}
                className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Export Selected</span>
              </button>
              <button
                onClick={handleBulkReAudit}
                className="px-3 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 border border-teal-500/30"
              >
                <Sparkles className="w-3 h-3" />
                <span>Re-Audit Selected</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls Top */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="font-medium">
          Showing <b className="text-slate-200">{filteredItems.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, filteredItems.length)}</b> of <b className="text-slate-200">{filteredItems.length}</b> records (Page {safeCurrentPage} of {totalPages})
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
            className="px-2.5 py-1 bg-slate-900/80 border border-teal-500/20 rounded-lg disabled:opacity-40 hover:bg-slate-800 text-slate-200 font-bold cursor-pointer flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-teal-400" />
            <span>Prev</span>
          </button>
          <span className="font-mono px-2 font-bold text-teal-300">
            {safeCurrentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="px-2.5 py-1 bg-slate-900/80 border border-teal-500/20 rounded-lg disabled:opacity-40 hover:bg-slate-800 text-slate-200 font-bold cursor-pointer flex items-center gap-1"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5 text-teal-400" />
          </button>
        </div>
      </div>

      {/* Select All on Page Bar */}
      <div className="flex items-center justify-between glass-panel-subtle px-4 py-2 rounded-xl text-xs text-slate-300 border border-teal-500/15">
        <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-slate-200">
          <input
            type="checkbox"
            checked={paginatedItems.length > 0 && paginatedItems.every(({ call }) => selectedCallIds.has(call.id))}
            onChange={(e) => handleSelectAllOnPage(e.target.checked)}
            className="w-4 h-4 rounded-sm border-slate-700 bg-slate-900 text-teal-400 focus:ring-teal-400 cursor-pointer"
          />
          <span>Select all {paginatedItems.length} records on page</span>
        </label>

        <div className="text-[11px] text-slate-400">
          {pageSize} audits / page
        </div>
      </div>

      {/* Main Audit List */}
      <div className="space-y-3">
        {paginatedItems.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center text-slate-400 text-xs space-y-2">
            <CheckSquare className="w-8 h-8 text-teal-400/40 mx-auto" />
            <div className="font-semibold text-slate-200">No calls match the current filter or search query.</div>
            <div className="text-slate-400">Try adjusting keywords, dates, or switching status tabs.</div>
          </div>
        ) : (
          paginatedItems.map(({ call, audit, computedStatus }) => {
            const isSelected = selectedCallIds.has(call.id);
            const isExpanded = expandedId === call.id;

            return (
              <div
                key={call.id}
                className={`glass-card-interactive rounded-2xl p-4 sm:p-5 space-y-3 ${
                  isSelected ? 'border-teal-400/60 ring-1 ring-teal-400/30 bg-teal-500/10' : ''
                }`}
              >
                {/* Header row: Checkbox, status badge, call info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectCall(call.id)}
                      className="w-4 h-4 rounded-sm border-slate-700 bg-slate-900 text-teal-400 focus:ring-teal-400 cursor-pointer"
                    />

                    {/* Status Badge */}
                    {computedStatus === 'pass' && (
                      <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>COMPLIANT</span>
                      </span>
                    )}

                    {computedStatus === 'fail' && (
                      <span className="px-2.5 py-1 bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.25)]">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>FATAL FLAW</span>
                      </span>
                    )}

                    {computedStatus === 'not_audited' && (
                      <span className="px-2.5 py-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>PENDING AUDIT</span>
                      </span>
                    )}

                    {computedStatus === 'scrap' && (
                      <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                        <span>SCRAP CALL (&lt;6s)</span>
                      </span>
                    )}

                    {computedStatus === 'regular' && (
                      <span className="px-2.5 py-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-bold flex items-center gap-1 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                        <Phone className="w-3.5 h-3.5 text-cyan-400" />
                        <span>REGULAR CALL</span>
                      </span>
                    )}

                    <span className="text-xs font-mono font-bold text-white">
                      #{call.id}
                    </span>

                    <span className="text-xs text-slate-400 font-mono truncate max-w-xs" title={call.recording_name}>
                      {call.recording_name || 'call_audio.wav'}
                    </span>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-2">
                    {computedStatus === 'not_audited' && (
                      <button
                        onClick={() => handleRunAudit(call.id)}
                        disabled={auditingCallId === call.id || isLoading}
                        className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/40 font-bold rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1 shadow-[0_0_12px_rgba(20,184,166,0.2)]"
                      >
                        <Sparkles className={`w-3.5 h-3.5 text-teal-300 ${auditingCallId === call.id ? 'animate-spin' : ''}`} />
                        <span>{auditingCallId === call.id ? 'Auditing…' : 'Run Audit'}</span>
                      </button>
                    )}

                    {audit && (
                      <>
                        <button
                          onClick={() => startEdit(audit)}
                          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3 h-3 text-teal-400" />
                          <span>Review</span>
                        </button>
                        <button
                          onClick={() => handleRunAudit(call.id)}
                          disabled={auditingCallId === call.id || isLoading}
                          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1 transition-colors"
                          title="Re-run compliance audit on this call"
                        >
                          <RotateCcw className={`w-3 h-3 text-teal-400 ${auditingCallId === call.id ? 'animate-spin' : ''}`} />
                          <span>Re-Audit</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : call.id)}
                      className="px-2.5 py-1 bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-semibold rounded-lg text-xs border border-teal-500/20 cursor-pointer transition-colors"
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Call Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Advisor</span>
                    <span className="font-semibold text-slate-200 truncate block">
                      {call.caller_name || call.dealer || audit?.caller_name || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Client Code (UCC)</span>
                    <span className="font-mono font-bold text-teal-300 truncate block">
                      {call.client || call.client_number || audit?.client || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Calling Number</span>
                    <span className="font-mono text-slate-300 truncate block">
                      {call.calling_number || call.phone_number || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Registered Line</span>
                    <span className="font-mono text-slate-300 truncate block">
                      {call.registered_number || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Timestamp</span>
                    <span className="text-slate-300 truncate block">
                      {call.call_date || (call.created_at ? call.created_at.slice(0, 10) : '—')} {call.call_time || ''}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Duration</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {call.duration_seconds ? `${call.duration_seconds}s` : '—'}
                    </span>
                  </div>
                </div>

                {/* Rubric Q1–Q5 summary chips if audited */}
                {audit && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1">
                    {/* Q1 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q1 === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-rose-500/15 border-rose-500/30'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-slate-200">Q1 Reg Number</div>
                        <div className="text-[10px] text-slate-400">FATAL (SEBI)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q1 === 'PASS' ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/25'
                      }`}>
                        {audit.q1}
                      </span>
                    </div>

                    {/* Q2 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q2 === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-rose-500/15 border-rose-500/30'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-slate-200">Q2 Client Code</div>
                        <div className="text-[10px] text-slate-400">FATAL (1 Mark)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q2 === 'PASS' ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/25'
                      }`}>
                        {audit.q2}
                      </span>
                    </div>

                    {/* Q3 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q3 === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/15 border-amber-500/25'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-slate-200">Q3 Stock/Price/Qty</div>
                        <div className="text-[10px] text-slate-400">Regular (1 Mark)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q3 === 'PASS' ? 'text-emerald-300 bg-emerald-500/20' : 'text-amber-300 bg-amber-500/25'
                      }`}>
                        {audit.q3}
                      </span>
                    </div>

                    {/* Q4 */}
                    <div className="p-2 rounded-xl border bg-emerald-500/10 border-emerald-500/25 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-[11px] text-slate-200">Q4 Customer Ack</div>
                        <div className="text-[10px] text-slate-400">1 Mark</div>
                      </div>
                      <span className="text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded text-emerald-300 bg-emerald-500/20">
                        PASS
                      </span>
                    </div>

                    {/* Q5 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q5 === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-rose-500/15 border-rose-500/30'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-slate-200">Q5 Return Commit</div>
                        <div className="text-[10px] text-slate-400">FATAL</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q5 === 'PASS' ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/25'
                      }`}>
                        {audit.q5}
                      </span>
                    </div>
                  </div>
                )}

                {/* Expandable full evidence & transcript */}
                {isExpanded && (
                  <div className="mt-3 p-4 bg-slate-950/80 text-slate-200 rounded-xl border border-teal-500/20 text-xs space-y-3">
                    <div className="font-bold text-teal-300 flex items-center justify-between border-b border-slate-800 pb-2">
                      <span>Verbatim Evidences &amp; Audit Breakdown</span>
                      {audit && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Audit ID #{audit.id} · Evaluated by Compliance Engine
                        </span>
                      )}
                    </div>

                    {audit ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div>
                            <span className="font-bold text-slate-300">Q1 Evidence (Registered Number):</span>
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300 font-mono text-[11px] mt-0.5">
                              {audit.q1_evidence || 'No quote recorded'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-slate-300">Q2 Evidence (Client Code Verbal):</span>
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-teal-300 font-mono text-[11px] mt-0.5">
                              {audit.q2_evidence || 'No quote recorded'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-slate-300">Q3 Evidence (Stock, Price, Qty):</span>
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300 font-mono text-[11px] mt-0.5">
                              {audit.q3_evidence || 'No quote recorded'}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="font-bold text-slate-300">Q4 Evidence (Customer Ack):</span>
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300 font-mono text-[11px] mt-0.5">
                              {audit.q4_evidence || 'Verbal customer confirmation confirmed.'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-slate-300">Auditor Summary Comment:</span>
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-teal-300 font-mono text-[11px] mt-0.5">
                              {audit.audit_comment || 'Pre-order confirmation evaluated as per regulatory compliance norm.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400 italic">
                        This call has not been audited yet. Click "Run Audit" to analyze with compliance engine.
                      </div>
                    )}

                    {call.transcript && (
                      <div className="pt-2 border-t border-slate-800">
                        <span className="font-bold text-slate-300 block mb-1.5 text-xs">Spoken Speech Transcript &amp; Diarization:</span>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <TranscriptHighlighter
                            transcript={call.transcript}
                            clientCode={call.client || (call as any).client_code}
                            advisorName={call.caller_name || call.dealer}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls Bottom */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 glass-panel p-4 rounded-2xl text-xs">
          <div className="font-medium text-slate-400">
            Showing <b className="text-slate-200">{startIndex + 1}–{Math.min(startIndex + pageSize, filteredItems.length)}</b> of <b className="text-slate-200">{filteredItems.length}</b> records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage <= 1}
              className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-teal-500/20 text-slate-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-teal-500/20 text-slate-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span className="px-3 py-1.5 font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-lg">
              {safeCurrentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-teal-500/20 text-slate-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-teal-500/20 text-slate-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Review / Manual Override Modal */}
      {editingAudit && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl border border-teal-500/30 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">
                  Audit Review &amp; Compliance Override #{editingAudit.id}
                </h3>
                <p className="text-xs text-slate-400">
                  Client: <b className="text-teal-300">{editingAudit.client}</b> · Advisor: <b className="text-slate-200">{editingAudit.caller_name}</b>
                </p>
              </div>
              <button
                onClick={() => setEditingAudit(null)}
                className="text-slate-400 hover:text-white text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Q1 */}
              <div className="p-3 rounded-xl border border-teal-500/20 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Q1. Confirmation in Registered Number (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ1('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ1 === 'PASS' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ1('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ1 === 'FAIL' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      FAIL
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editQ1Ev}
                  onChange={(e) => setEditQ1Ev(e.target.value)}
                  placeholder="Verbatim evidence quote…"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-teal-500/20 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Q2 */}
              <div className="p-3 rounded-xl border border-teal-500/20 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Q2. Client UCC Code Confirmed (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ2('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ2 === 'PASS' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ2('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ2 === 'FAIL' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      FAIL
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editQ2Ev}
                  onChange={(e) => setEditQ2Ev(e.target.value)}
                  placeholder="Verbatim evidence quote…"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-teal-500/20 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Q3 */}
              <div className="p-3 rounded-xl border border-teal-500/20 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Q3. Stock, Price &amp; Qty Confirmed</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ3('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ3 === 'PASS' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ3('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ3 === 'FAIL' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      FAIL
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editQ3Ev}
                  onChange={(e) => setEditQ3Ev(e.target.value)}
                  placeholder="Verbatim evidence quote…"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-teal-500/20 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Q5 */}
              <div className="p-3 rounded-xl border border-teal-500/20 bg-slate-950/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Q5. Return Commitment Prohibited (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ5('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ5 === 'PASS' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ5('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                        editQ5 === 'FAIL' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      FAIL
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editQ5Ev}
                  onChange={(e) => setEditQ5Ev(e.target.value)}
                  placeholder="Verbatim evidence quote…"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-teal-500/20 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">Auditor Remark / Comment</label>
                <textarea
                  rows={2}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-teal-500/20 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setEditingAudit(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={isSaving}
                className="px-5 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 font-bold rounded-xl text-xs cursor-pointer border border-teal-500/40 shadow-[0_0_15px_rgba(20,184,166,0.25)] transition-all"
              >
                {isSaving ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
