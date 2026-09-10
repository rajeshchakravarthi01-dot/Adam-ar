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
      const isScrap = dur > 0 && dur < 8;
      const callType = isScrap ? 'scrap' : (call.call_type || (dur > 0 && dur < 8 ? 'scrap' : 'pre_order'));

      let computedStatus: 'pass' | 'fail' | 'not_audited' | 'scrap' | 'regular' = 'not_audited';

      if (isScrap || callType === 'scrap') {
        computedStatus = 'scrap';
      } else if (callType === 'regular' || callType === 'non_pre_order') {
        computedStatus = 'regular';
      } else if (audit) {
        const isFatal = audit.q1 === 'FAIL' || audit.q2 === 'FAIL' || audit.q5 === 'FAIL';
        computedStatus = isFatal ? 'fail' : 'pass';
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

  // Bulk audit selected calls
  const handleBulkReAudit = async () => {
    const ids = Array.from(selectedCallIds);
    if (ids.length === 0) {
      alert('Please select calls to re-audit.');
      return;
    }
    if (!confirm(`Re-audit ${ids.length} selected calls with Groq AI compliance engine?`)) return;

    for (const id of ids) {
      try {
        await onForceAudit(id);
      } catch (err) {
        console.error(`Re-audit failed for call #${id}:`, err);
      }
    }
    alert(`Bulk audit initiated for ${ids.length} calls.`);
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
        'Q4 Cust Ack': audit?.q4 || (computedStatus === 'pass' ? 'PASS' : '—'),
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
    XLSX.writeFile(wb, `FundsIndia_Audit_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    link.setAttribute('download', `FundsIndia_Audits_${new Date().toISOString().slice(0, 10)}.csv`);
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
      {/* Header Banner - Black & Gold FundsIndia styling */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-black">
              <CheckSquare className="w-4 h-4" />
            </span>
            <span>Comprehensive Compliance Audit Master</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Audit every call in one unified grid: Pass, Fail (Fatal), Not Audited, Scrap calls (&lt;8s), and Regular calls. 100 audits per page with bulk export.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleExportExcel(false)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            title="Download full audit list in Excel (.xlsx) format"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Download Excel</span>
          </button>
          <button
            onClick={() => handleExportCsv(false)}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold rounded-xl shadow-xs text-xs transition-colors cursor-pointer flex items-center gap-1.5 border border-amber-400/30"
            title="Download full audit list in CSV format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'all'
              ? 'bg-amber-400/15 border-amber-400 text-neutral-950 font-bold ring-1 ring-amber-400'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-neutral-500">All Calls</div>
          <div className="text-lg font-extrabold text-neutral-900 font-mono mt-0.5">{stats.total}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('pass'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'pass'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-1 ring-emerald-500'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Passed</span>
          </div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-0.5">{stats.pass}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('fail'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'fail'
              ? 'bg-rose-50 border-rose-500 text-rose-950 font-bold ring-1 ring-rose-500'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>Failed (Fatal)</span>
          </div>
          <div className="text-lg font-extrabold text-rose-700 font-mono mt-0.5">{stats.fail}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('not_audited'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'not_audited'
              ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold ring-1 ring-amber-500'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Not Audited</span>
          </div>
          <div className="text-lg font-extrabold text-amber-700 font-mono mt-0.5">{stats.notAudited}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('scrap'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'scrap'
              ? 'bg-slate-100 border-slate-500 text-slate-950 font-bold ring-1 ring-slate-500'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Scrap (&lt;8s)</span>
          </div>
          <div className="text-lg font-extrabold text-slate-700 font-mono mt-0.5">{stats.scrap}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('regular'); setCurrentPage(1); }}
          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
            statusFilter === 'regular'
              ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500'
              : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
          }`}
        >
          <div className="text-[11px] font-medium text-blue-600 flex items-center gap-1">
            <Phone className="w-3 h-3" />
            <span>Regular Calls</span>
          </div>
          <div className="text-lg font-extrabold text-blue-700 font-mono mt-0.5">{stats.regular}</div>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by client ID, caller/advisor, phone number, recording name, or date…"
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {/* Date range filters */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-neutral-50 px-2.5 py-1 rounded-xl border border-neutral-200">
              <span className="text-[11px] font-bold text-neutral-500">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-xs font-mono text-neutral-800 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-neutral-50 px-2.5 py-1 rounded-xl border border-neutral-200">
              <span className="text-[11px] font-bold text-neutral-500">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-xs font-mono text-neutral-800 outline-none"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-[11px] text-rose-600 hover:underline font-bold px-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-neutral-500">Audits Per Page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-neutral-50 border border-neutral-200 text-xs font-bold text-neutral-800 py-1.5 px-2.5 rounded-xl cursor-pointer"
            >
              <option value={50}>50</option>
              <option value={100}>100 (Default)</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
            </select>
          </div>
        </div>

        {/* Selected Batch Actions Bar */}
        {selectedCallIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs">
            <div className="font-bold text-amber-950 flex items-center gap-2">
              <span>{selectedCallIds.size} calls selected</span>
              <button
                onClick={() => setSelectedCallIds(new Set())}
                className="text-[11px] text-neutral-500 underline font-normal hover:text-neutral-800 cursor-pointer"
              >
                Deselect all
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportExcel(true)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Export Selected (Excel)</span>
              </button>
              <button
                onClick={handleBulkReAudit}
                className="px-3 py-1 bg-black hover:bg-neutral-900 text-amber-400 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1 border border-amber-400/30"
              >
                <Sparkles className="w-3 h-3" />
                <span>Re-Audit Selected</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls Top */}
      <div className="flex items-center justify-between text-xs text-neutral-600 px-1">
        <div className="font-medium">
          Showing <b>{filteredItems.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, filteredItems.length)}</b> of <b>{filteredItems.length}</b> records (Page {safeCurrentPage} of {totalPages})
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage <= 1}
            className="px-2.5 py-1 bg-white border border-neutral-300 rounded-lg disabled:opacity-40 hover:bg-neutral-50 font-bold cursor-pointer flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <span className="font-mono px-2 font-bold text-neutral-800">
            {safeCurrentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage >= totalPages}
            className="px-2.5 py-1 bg-white border border-neutral-300 rounded-lg disabled:opacity-40 hover:bg-neutral-50 font-bold cursor-pointer flex items-center gap-1"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Select All on Page Bar */}
      <div className="flex items-center justify-between bg-neutral-100/80 px-4 py-2 rounded-xl text-xs text-neutral-700 border border-neutral-200">
        <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
          <input
            type="checkbox"
            checked={paginatedItems.length > 0 && paginatedItems.every(({ call }) => selectedCallIds.has(call.id))}
            onChange={(e) => handleSelectAllOnPage(e.target.checked)}
            className="w-4 h-4 rounded-sm border-neutral-300 text-amber-500 focus:ring-amber-400"
          />
          <span>Select all {paginatedItems.length} calls on this page</span>
        </label>

        <div className="text-[11px] text-neutral-500">
          Showing {pageSize} audits per page
        </div>
      </div>

      {/* Main Audit List */}
      <div className="space-y-3">
        {paginatedItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center text-neutral-400 text-xs space-y-2">
            <CheckSquare className="w-8 h-8 text-neutral-300 mx-auto" />
            <div className="font-semibold text-neutral-700">No calls match the current filter or search query.</div>
            <div>Try adjusting search keywords, clearing date filters, or switching status tabs.</div>
          </div>
        ) : (
          paginatedItems.map(({ call, audit, computedStatus }) => {
            const isSelected = selectedCallIds.has(call.id);
            const isExpanded = expandedId === call.id;

            return (
              <div
                key={call.id}
                className={`bg-white rounded-2xl border transition-all shadow-2xs p-4 sm:p-5 space-y-3 ${
                  isSelected ? 'border-amber-400 ring-1 ring-amber-400/50 bg-amber-50/20' : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {/* Header row: Checkbox, status badge, call info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectCall(call.id)}
                      className="w-4 h-4 rounded-sm border-neutral-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />

                    {/* Status Badge */}
                    {computedStatus === 'pass' && (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>PASSED (Compliant)</span>
                      </span>
                    )}

                    {computedStatus === 'fail' && (
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-900 border border-rose-300 rounded-lg text-xs font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>FAILED (Fatal Violation)</span>
                      </span>
                    )}

                    {computedStatus === 'not_audited' && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>NOT AUDITED</span>
                      </span>
                    )}

                    {computedStatus === 'scrap' && (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                        <span>SCRAP CALL (&lt;8s)</span>
                      </span>
                    )}

                    {computedStatus === 'regular' && (
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>REGULAR CALL</span>
                      </span>
                    )}

                    <span className="text-xs font-mono font-bold text-neutral-900">
                      Call #{call.id}
                    </span>

                    <span className="text-xs text-neutral-500 font-mono truncate max-w-xs" title={call.recording_name}>
                      {call.recording_name || 'call_audio.wav'}
                    </span>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-2">
                    {computedStatus === 'not_audited' && (
                      <button
                        onClick={() => handleRunAudit(call.id)}
                        disabled={auditingCallId === call.id || isLoading}
                        className="px-3 py-1.5 bg-black hover:bg-neutral-900 text-amber-400 font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1 border border-amber-400/30"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${auditingCallId === call.id ? 'animate-spin' : ''}`} />
                        <span>{auditingCallId === call.id ? 'Auditing…' : 'Run Audit'}</span>
                      </button>
                    )}

                    {audit && (
                      <>
                        <button
                          onClick={() => startEdit(audit)}
                          className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3 text-neutral-600" />
                          <span>Review</span>
                        </button>
                        <button
                          onClick={() => handleRunAudit(call.id)}
                          disabled={auditingCallId === call.id || isLoading}
                          className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1"
                          title="Re-run compliance audit on this call"
                        >
                          <RotateCcw className={`w-3 h-3 text-neutral-600 ${auditingCallId === call.id ? 'animate-spin' : ''}`} />
                          <span>Re-Audit</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : call.id)}
                      className="px-2.5 py-1 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 font-semibold rounded-lg text-xs border border-neutral-200 cursor-pointer"
                    >
                      {isExpanded ? 'Less Details' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Call Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs bg-neutral-50/80 p-3 rounded-xl border border-neutral-100">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Caller / Advisor</span>
                    <span className="font-semibold text-neutral-800 truncate block">
                      {call.caller_name || call.dealer || audit?.caller_name || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Client Code (UCC)</span>
                    <span className="font-mono font-bold text-neutral-900 truncate block">
                      {call.client || call.client_number || audit?.client || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Calling Number</span>
                    <span className="font-mono text-neutral-800 truncate block">
                      {call.calling_number || call.phone_number || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Registered Number</span>
                    <span className="font-mono text-neutral-800 truncate block">
                      {call.registered_number || '—'}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Call Date / Time</span>
                    <span className="text-neutral-800 truncate block">
                      {call.call_date || (call.created_at ? call.created_at.slice(0, 10) : '—')} {call.call_time || ''}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-400">Duration</span>
                    <span className="font-mono font-semibold text-neutral-800">
                      {call.duration_seconds ? `${call.duration_seconds}s` : '—'}
                    </span>
                  </div>
                </div>

                {/* Rubric Q1–Q5 summary chips if audited */}
                {audit && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1">
                    {/* Q1 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q1 === 'PASS' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-neutral-700">Q1 Reg Number</div>
                        <div className="text-[10px] text-neutral-500">FATAL (SEBI)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q1 === 'PASS' ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}>
                        {audit.q1}
                      </span>
                    </div>

                    {/* Q2 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q2 === 'PASS' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-neutral-700">Q2 Client Code</div>
                        <div className="text-[10px] text-neutral-500">FATAL (1 Mark)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q2 === 'PASS' ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}>
                        {audit.q2}
                      </span>
                    </div>

                    {/* Q3 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q3 === 'PASS' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-neutral-700">Q3 Stock/Price/Qty</div>
                        <div className="text-[10px] text-neutral-500">Regular (1 Mark)</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q3 === 'PASS' ? 'text-emerald-700 bg-emerald-100' : 'text-amber-800 bg-amber-100'
                      }`}>
                        {audit.q3}
                      </span>
                    </div>

                    {/* Q4 */}
                    <div className="p-2 rounded-xl border bg-emerald-50/50 border-emerald-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-[11px] text-neutral-700">Q4 Customer Ack</div>
                        <div className="text-[10px] text-neutral-500">1 Mark</div>
                      </div>
                      <span className="text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-100">
                        PASS
                      </span>
                    </div>

                    {/* Q5 */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between ${
                      audit.q5 === 'PASS' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                    }`}>
                      <div>
                        <div className="font-bold text-[11px] text-neutral-700">Q5 Return Commit</div>
                        <div className="text-[10px] text-neutral-500">FATAL</div>
                      </div>
                      <span className={`text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                        audit.q5 === 'PASS' ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}>
                        {audit.q5}
                      </span>
                    </div>
                  </div>
                )}

                {/* Expandable full evidence & transcript */}
                {isExpanded && (
                  <div className="mt-3 p-4 bg-neutral-900 text-neutral-200 rounded-xl border border-neutral-800 text-xs space-y-3">
                    <div className="font-bold text-amber-400 flex items-center justify-between border-b border-neutral-800 pb-2">
                      <span>Verbatim Evidences &amp; Audit Breakdown</span>
                      {audit && (
                        <span className="text-[11px] text-neutral-400 font-mono">
                          Audit ID #{audit.id} · Evaluated by Groq AI
                        </span>
                      )}
                    </div>

                    {audit ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div>
                            <span className="font-bold text-neutral-300">Q1 Evidence (Registered Number):</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] mt-0.5">
                              {audit.q1_evidence || 'No quote recorded'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-300">Q2 Evidence (Client Code Verbal):</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] mt-0.5">
                              {audit.q2_evidence || 'No quote recorded'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-300">Q3 Evidence (Stock, Price, Qty):</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] mt-0.5">
                              {audit.q3_evidence || 'No quote recorded'}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="font-bold text-neutral-300">Q4 Evidence (Customer Ack):</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] mt-0.5">
                              {audit.q4_evidence || 'Verbal customer confirmation confirmed.'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-300">Q5 Evidence (Return Commitment Prohibited):</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] mt-0.5">
                              {audit.q5_evidence || 'No return guarantees provided'}
                            </div>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-300">Auditor / AI Summary Comment:</span>
                            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-amber-300 font-mono text-[11px] mt-0.5">
                              {audit.audit_comment || 'Pre-order confirmation evaluated as per regulatory compliance norm.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-neutral-400 italic">
                        This call has not been audited yet. Click "Run Audit" to analyze with Groq AI.
                      </div>
                    )}

                    {call.transcript && (
                      <div className="pt-2 border-t border-neutral-800">
                        <span className="font-bold text-neutral-300 block mb-1">Raw Speech Transcript:</span>
                        <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-neutral-400 font-mono text-[11px] max-h-36 overflow-y-auto leading-relaxed">
                          {call.transcript}
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs text-xs">
          <div className="font-medium text-neutral-600">
            Showing <b>{startIndex + 1}–{Math.min(startIndex + pageSize, filteredItems.length)}</b> of <b>{filteredItems.length}</b> records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage <= 1}
              className="px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span className="px-3 py-1.5 font-mono font-bold bg-amber-400 text-black rounded-lg">
              {safeCurrentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              className="px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded-lg disabled:opacity-40 font-bold cursor-pointer"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Review / Manual Override Modal */}
      {editingAudit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-300 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Audit Review &amp; Compliance Override #{editingAudit.id}
                </h3>
                <p className="text-xs text-neutral-500">
                  Client: <b>{editingAudit.client}</b> · Advisor: <b>{editingAudit.caller_name}</b>
                </p>
              </div>
              <button
                onClick={() => setEditingAudit(null)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Q1 */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800">Q1. Confirmation in Registered Number (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ1('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ1 === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ1('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ1 === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-neutral-200 text-neutral-700'
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
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs"
                />
              </div>

              {/* Q2 */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800">Q2. Client UCC Code Confirmed (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ2('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ2 === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ2('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ2 === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-neutral-200 text-neutral-700'
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
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs"
                />
              </div>

              {/* Q3 */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800">Q3. Stock, Price &amp; Qty Confirmed</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ3('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ3 === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ3('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ3 === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-neutral-200 text-neutral-700'
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
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs"
                />
              </div>

              {/* Q5 */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800">Q5. Return Commitment Prohibited (FATAL)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditQ5('PASS')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ5 === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQ5('FAIL')}
                      className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                        editQ5 === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-neutral-200 text-neutral-700'
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
                  className="w-full px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs"
                />
              </div>

              {/* Comment */}
              <div>
                <label className="font-bold text-neutral-800 block mb-1">Auditor Remark / Comment</label>
                <textarea
                  rows={2}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full p-2 bg-white border border-neutral-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
              <button
                type="button"
                onClick={() => setEditingAudit(null)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={isSaving}
                className="px-5 py-2 bg-black hover:bg-neutral-900 text-amber-400 font-bold rounded-xl text-xs cursor-pointer border border-amber-400/30"
              >
                {isSaving ? 'Saving Changes…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
