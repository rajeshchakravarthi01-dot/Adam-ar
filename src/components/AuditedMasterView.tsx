import React, { useState, useMemo } from 'react';
import {
  Table,
  Search,
  Filter,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Edit3,
  Download,
  ShieldCheck,
  Check,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Plus,
  Trash2,
  Volume2,
  X,
  Play,
  Calendar,
  Layers,
  RefreshCw,
} from 'lucide-react';
import type { ScorecardRecord } from '../types';
import { api, getStoredToken } from '../lib/api';
import { TranscriptHighlighter } from './TranscriptHighlighter';
import { ManualTradeAuditView } from './ManualTradeAuditView';

interface AuditedMasterViewProps {
  scorecards: ScorecardRecord[];
  onUpdateScorecard: (
    id: number,
    data: Partial<ScorecardRecord> & { phone?: string; audit_date?: string; feedback?: string }
  ) => Promise<void>;
  onBulkUpdateScorecards?: (updates: Array<{ id: number; data: any }>) => Promise<void>;
  onDeleteScorecard?: (id: number) => Promise<void>;
  onCreateScorecard?: (data: any) => Promise<void>;
  onRunAllAudits?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
}

interface RowEditState {
  caller_name: string;
  client: string;
  trade_date: string;
  team: string;
  phone: string;
  audit_date: string;
  q1_status: string;
  q2_status: string;
  q3_status: string;
  q4_status: string;
  q5_status: string;
  score: number;
  feedback: string;
  is_dirty: boolean;
}

type SortField = 'id' | 'caller_name' | 'client' | 'trade_date' | 'audit_date' | 'team' | 'phone' | 'score';
type SortOrder = 'asc' | 'desc';

export function formatForDateInput(dateVal: any): string {
  if (!dateVal) return '';
  const s = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const month = m1[2].padStart(2, '0');
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m2) {
    const year = m2[1];
    const month = m2[2].padStart(2, '0');
    const day = m2[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

export const AuditedMasterView: React.FC<AuditedMasterViewProps> = ({
  scorecards = [],
  onUpdateScorecard,
  onBulkUpdateScorecards,
  onDeleteScorecard,
  onCreateScorecard,
  onRunAllAudits,
  onRefresh,
  isLoading,
}) => {
  // Safe sanitization of scorecards array
  const safeScorecards = useMemo(
    () => (Array.isArray(scorecards) ? scorecards.filter((s): s is ScorecardRecord => Boolean(s && typeof s === 'object')) : []),
    [scorecards]
  );

  // Search, Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('ALL');
  const [dispositionFilter, setDispositionFilter] = useState<'ALL' | 'COMPLIANT' | 'FATAL' | 'REVIEW'>('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Inline editing state dictionary indexed by scorecard.id
  const [editedRows, setEditedRows] = useState<Record<number, RowEditState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [savedSuccessId, setSavedSuccessId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals & Audio Preview
  const [activeModalItem, setActiveModalItem] = useState<ScorecardRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [audioPreviewCallId, setAudioPreviewCallId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // New Record Form State
  const [newRecord, setNewRecord] = useState({
    caller_name: '',
    client: '',
    trade_date: new Date().toISOString().slice(0, 10),
    team: '',
    phone: '',
    audit_date: new Date().toISOString().slice(0, 10),
    q1_status: 'PASS',
    q2_status: 'PASS',
    q3_status: 'PASS',
    q5_status: 'PASS',
    score: 5,
    feedback: 'Pre Order Confirmation verified as per standard procedure.',
  });

  // Initialize or get row edit state safely
  const getRowState = (sc: ScorecardRecord): RowEditState => {
    if (!sc) {
      return {
        caller_name: '',
        client: '',
        trade_date: '',
        team: '',
        phone: '',
        audit_date: '',
        q1_status: 'PASS',
        q2_status: 'PASS',
        q3_status: 'PASS',
        q4_status: 'PASS',
        q5_status: 'PASS',
        score: 5,
        feedback: '',
        is_dirty: false,
      };
    }
    if (editedRows[sc.id]) {
      return editedRows[sc.id];
    }
    const resolvedClient = (() => {
      const c = sc.client_code && sc.client_code !== 'REVIEW / NOT RESOLVED' && sc.client_code !== '—'
        ? sc.client_code
        : sc.client && sc.client !== 'REVIEW / NOT RESOLVED' && sc.client !== '—'
          ? sc.client
          : (sc.trades && sc.trades[0]?.client) || '';
      if (c) return c;
      if (sc.transcript) {
        const spoken = sc.transcript.match(/(?:client|ucc|account|id|code)\s*(?:is|code|id|no|number|#)?\s*[:\-]?\s*([a-zA-Z0-9\-_]{4,12})/i);
        if (spoken) return spoken[1].toUpperCase();
      }
      return '';
    })();

    const resolvedTradeDate = formatForDateInput(
      sc.trade_date ||
      (sc.trades && sc.trades[0]?.trade_date) ||
      sc.call_date ||
      (sc.created_at ? String(sc.created_at).slice(0, 10) : '')
    );

    const resolvedAuditDate = formatForDateInput(
      (sc as any).audit_date ||
      sc.call_date ||
      (sc.created_at ? String(sc.created_at).slice(0, 10) : '') ||
      resolvedTradeDate
    );

    return {
      caller_name: String(sc.caller_name || ''),
      client: resolvedClient,
      trade_date: resolvedTradeDate,
      team: String(sc.team || ''),
      phone: String(sc.calling_number || sc.trade_phone || sc.registered_number || ''),
      audit_date: resolvedAuditDate,
      q1_status: sc.q1_status || 'PASS',
      q2_status: sc.q2_status || 'PASS',
      q3_status: sc.q3_status || 'PASS',
      q4_status: 'PASS',
      q5_status: sc.q5_status || 'PASS',
      score: typeof sc.score === 'number' ? sc.score : 5,
      feedback: String(sc.audit_comment || ''),
      is_dirty: false,
    };
  };

  const handleCellChange = (
    sc: ScorecardRecord,
    field: keyof RowEditState,
    value: any
  ) => {
    const current = getRowState(sc);
    let normalizedVal = value;
    if (field === 'trade_date' || field === 'audit_date') {
      normalizedVal = formatForDateInput(value) || value;
    }

    const updated: RowEditState = {
      ...current,
      [field]: normalizedVal,
      is_dirty: true,
    };

    // Real-time auto-recalculation when question parameters change
    if (field === 'q1_status' || field === 'q2_status' || field === 'q3_status' || field === 'q5_status') {
      const q1 = field === 'q1_status' ? value : updated.q1_status;
      const q2 = field === 'q2_status' ? value : updated.q2_status;
      const q3 = field === 'q3_status' ? value : updated.q3_status;
      const q5 = field === 'q5_status' ? value : updated.q5_status;

      const isFatal = q1 === 'FAIL' || q2 === 'FAIL' || q5 === 'FAIL';
      if (isFatal) {
        updated.score = 0;
        updated.feedback = 'NON-COMPLIANT: Pre-order audit standard violation.';
      } else {
        let scMark = 5;
        if (q3 !== 'PASS') scMark -= 1;
        updated.score = scMark;
        updated.feedback = scMark === 5 
          ? 'Pre Order Confirmation verified as per standard procedure.' 
          : 'Pre Order Confirmation verified with minor trade remarks.';
      }
    }

    setEditedRows((prev) => ({
      ...prev,
      [sc.id]: updated,
    }));
  };

  const handleSaveRow = async (sc: ScorecardRecord) => {
    const current = getRowState(sc);
    setSavingId(sc.id);
    try {
      await onUpdateScorecard(sc.id, {
        caller_name: current.caller_name,
        client: current.client,
        trade_date: current.trade_date,
        team: current.team,
        phone: current.phone,
        audit_date: current.audit_date,
        q1_status: current.q1_status,
        q2_status: current.q2_status,
        q3_status: current.q3_status,
        q4_status: 'PASS',
        q5_status: current.q5_status,
        score: current.score,
        feedback: current.feedback,
      });

      // Clear the row from local edit state so it rebinds to the fresh props
      setEditedRows((prev) => {
        const next = { ...prev };
        delete next[sc.id];
        return next;
      });

      setSavedSuccessId(sc.id);
      setTimeout(() => setSavedSuccessId(null), 2500);
      setActionMessage(`Audit row #${sc.id} successfully saved.`);
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: unknown) {
      alert(`Failed to save row: ${(err as Error).message}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleResetRow = (sc: ScorecardRecord) => {
    setEditedRows((prev) => {
      const next = { ...prev };
      delete next[sc.id];
      return next;
    });
  };

  // Bulk save all modified rows in one atomic request
  const dirtyRowIds = useMemo(() => {
    return Object.keys(editedRows)
      .map(Number)
      .filter((id) => editedRows[id]?.is_dirty);
  }, [editedRows]);

  const handleSaveAllDirty = async () => {
    if (dirtyRowIds.length === 0) return;
    setIsBulkSaving(true);
    try {
      const updates = dirtyRowIds.map((id) => ({
        id,
        data: editedRows[id],
      }));

      if (onBulkUpdateScorecards) {
        await onBulkUpdateScorecards(updates);
      } else {
        await api.bulkUpdateScorecards(updates);
        if (onRefresh) await onRefresh();
      }

      setEditedRows({});
      setActionMessage(`Successfully saved all ${updates.length} modified audit records.`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: unknown) {
      alert(`Bulk update failed: ${(err as Error).message}`);
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Are you sure you want to delete Audit Record #${id}?`)) return;
    setDeletingId(id);
    try {
      if (onDeleteScorecard) {
        await onDeleteScorecard(id);
      } else {
        await api.deleteScorecard(id);
        if (onRefresh) await onRefresh();
      }
      setActionMessage(`Record #${id} deleted.`);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: unknown) {
      alert(`Failed to delete record: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isFatal = newRecord.q1_status === 'FAIL' || newRecord.q2_status === 'FAIL' || newRecord.q5_status === 'FAIL';
      const calculatedScore = isFatal ? 0 : (newRecord.q3_status === 'PASS' ? 5 : 4);
      const recordPayload = {
        ...newRecord,
        trade_date: formatForDateInput(newRecord.trade_date) || newRecord.trade_date,
        audit_date: formatForDateInput(newRecord.audit_date) || newRecord.audit_date,
        q4_status: 'PASS',
        score: calculatedScore,
      };

      if (onCreateScorecard) {
        await onCreateScorecard(recordPayload);
      } else {
        await api.createScorecard(recordPayload);
        if (onRefresh) await onRefresh();
      }
      setShowCreateModal(false);
      setNewRecord({
        caller_name: '',
        client: '',
        trade_date: formatForDateInput(new Date().toISOString().slice(0, 10)),
        team: '',
        phone: '',
        audit_date: formatForDateInput(new Date().toISOString().slice(0, 10)),
        q1_status: 'PASS',
        q2_status: 'PASS',
        q3_status: 'PASS',
        q5_status: 'PASS',
        score: 5,
        feedback: 'Pre Order Confirmation is as per the Regulatory Norm.',
      });
      setActionMessage('New audit entry created successfully.');
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: unknown) {
      alert(`Failed to create audit entry: ${(err as Error).message}`);
    }
  };

  // Distinct lists for dropdowns
  const advisorsList = useMemo(() => {
    const set = new Set<string>();
    safeScorecards.forEach((s) => {
      if (s && s.caller_name) set.add(String(s.caller_name));
    });
    return Array.from(set).sort();
  }, [safeScorecards]);

  const teamsList = useMemo(() => {
    const set = new Set<string>();
    safeScorecards.forEach((s) => {
      if (s && s.team) set.add(String(s.team));
    });
    return Array.from(set).sort();
  }, [safeScorecards]);

  // Filtering & Sorting
  const filteredAndSortedScorecards = useMemo(() => {
    let result = safeScorecards.filter((sc) => {
      if (!sc) return false;
      // Search term
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesCaller = String(sc.caller_name || '').toLowerCase().includes(q);
        const matchesClient = String(sc.client || '').toLowerCase().includes(q);
        const matchesPhone = String(sc.calling_number || sc.trade_phone || '').includes(q);
        const matchesTeam = String(sc.team || '').toLowerCase().includes(q);
        const matchesComment = String(sc.audit_comment || '').toLowerCase().includes(q);
        if (!matchesCaller && !matchesClient && !matchesPhone && !matchesTeam && !matchesComment) {
          return false;
        }
      }

      // Advisor
      if (advisorFilter !== 'ALL' && sc.caller_name !== advisorFilter) {
        return false;
      }

      // Team
      if (teamFilter !== 'ALL' && sc.team !== teamFilter) {
        return false;
      }

      // Date Range
      const rowDate = sc.trade_date || sc.call_date || '';
      if (dateFrom && rowDate && rowDate < dateFrom) return false;
      if (dateTo && rowDate && rowDate > dateTo) return false;

      // Disposition
      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL' || sc.score === 0;
      if (dispositionFilter === 'FATAL' && !isFatal) return false;
      if (dispositionFilter === 'COMPLIANT' && (isFatal || (sc.score || 0) < 4)) return false;
      if (dispositionFilter === 'REVIEW' && (isFatal || (sc.score || 0) >= 4)) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let valA: any = a ? a[sortField as keyof ScorecardRecord] ?? '' : '';
      let valB: any = b ? b[sortField as keyof ScorecardRecord] ?? '' : '';

      if (sortField === 'id' || sortField === 'score') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [safeScorecards, searchTerm, advisorFilter, teamFilter, dateFrom, dateTo, dispositionFilter, sortField, sortOrder]);

  // Paginated records
  const paginatedScorecards = useMemo(() => {
    if (pageSize >= filteredAndSortedScorecards.length) return filteredAndSortedScorecards;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedScorecards.slice(start, start + pageSize);
  }, [filteredAndSortedScorecards, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedScorecards.length / pageSize) || 1;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const exportTableCSV = () => {
    const headers = [
      'ID',
      'Caller Name',
      'Client ID',
      'Trade Date',
      'Team',
      'Phone Number',
      'Audit Date',
      'Q1 (CLI - Fatal)',
      'Q2 (Client UCC - Fatal)',
      'Q3 (Symbol/Qty/Price - 1 Pt)',
      'Q4 (Customer Ack - Default PASS)',
      'Q5 (No Return Guarantee - Fatal)',
      'Total Score (Out of 5)',
      'Status',
      'Audit Remarks / Feedback',
    ];

    const rows = filteredAndSortedScorecards.map((sc) => {
      const state = getRowState(sc);
      const isFatal = state.q1_status === 'FAIL' || state.q2_status === 'FAIL' || state.q5_status === 'FAIL' || state.score === 0;
      const statusLabel = isFatal ? 'FATAL NON-COMPLIANT' : state.score >= 4 ? 'COMPLIANT' : 'REVIEW';

      return [
        sc.id,
        `"${state.caller_name.replace(/"/g, '""')}"`,
        `"${state.client.replace(/"/g, '""')}"`,
        state.trade_date,
        `"${state.team.replace(/"/g, '""')}"`,
        state.phone,
        state.audit_date,
        state.q1_status,
        state.q2_status,
        state.q3_status,
        state.q4_status,
        state.q5_status,
        state.score,
        statusLabel,
        `"${state.feedback.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audited_Master_Grid_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  return (
    <div className="space-y-5">
      {/* Action Notice */}
      {actionMessage && (
        <div className="bg-amber-400 text-black px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner - High-contrast Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-black">
              <Table className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-neutral-900">Audited Master Grid</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 border border-neutral-200">
              {filteredAndSortedScorecards.length} Records
            </span>
            {dirtyRowIds.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-black animate-pulse">
                {dirtyRowIds.length} Unsaved Changes
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Complete pre-order audit master sheet. Live inline cell editing, automated 5-parameter scoring, sorting, and manual record adjustments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirtyRowIds.length > 0 && (
            <button
              onClick={handleSaveAllDirty}
              disabled={isBulkSaving}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-500 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isBulkSaving ? 'Saving...' : `Save All Changes (${dirtyRowIds.length})`}</span>
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 bg-neutral-900 hover:bg-black text-white font-medium text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Entry</span>
          </button>

          <button
            onClick={exportTableCSV}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-neutral-200 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-neutral-600" />
            <span>Export CSV</span>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl border border-neutral-200 cursor-pointer"
              title="Refresh grid data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Empty State Banner with Auto-Auditing Trigger */}
      {scorecards.length === 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-200">
          <ShieldCheck className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Audited Scorecards Found</h3>
          <p className="text-xs text-neutral-400 max-w-lg mx-auto mt-1 mb-4">
            Upload recordings in the Ingest Recordings tab, or run automated audits to correlate calls with trade data and populate this master table.
          </p>
          {onRunAllAudits && (
            <button
              onClick={onRunAllAudits}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black font-bold text-xs rounded-xl inline-flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>Run Automated Audits Now</span>
            </button>
          )}
        </div>
      )}

      {/* Filters & Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search advisor, client code, phone, remarks…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {/* Advisor Filter */}
          <div>
            <select
              value={advisorFilter}
              onChange={(e) => setAdvisorFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 font-medium focus:outline-hidden focus:border-amber-400"
            >
              <option value="ALL">All Advisors ({advisorsList.length})</option>
              {advisorsList.map((adv) => (
                <option key={adv} value={adv}>
                  {adv}
                </option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          <div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 font-medium focus:outline-hidden focus:border-amber-400"
            >
              <option value="ALL">All Teams ({teamsList.length})</option>
              {teamsList.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Disposition Filter */}
          <div>
            <select
              value={dispositionFilter}
              onChange={(e) => setDispositionFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 font-medium focus:outline-hidden focus:border-amber-400"
            >
              <option value="ALL">All Dispositions</option>
              <option value="COMPLIANT">Compliant Only (Score 4-5)</option>
              <option value="FATAL">Fatal Violations (Score 0)</option>
              <option value="REVIEW">Needs Review</option>
            </select>
          </div>

          {/* Page Size */}
          <div>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 font-medium focus:outline-hidden focus:border-amber-400"
            >
              <option value={25}>Show 25 rows</option>
              <option value={50}>Show 50 rows</option>
              <option value={100}>Show 100 rows</option>
              <option value={9999}>Show All ({scorecards.length})</option>
            </select>
          </div>
        </div>

        {/* Date Range Sub-Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-100 text-xs text-neutral-600">
          <span className="font-semibold text-neutral-700 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            <span>Date Range:</span>
          </span>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-neutral-500">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-neutral-500">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-xs"
            />
          </div>
          {(dateFrom || dateTo || searchTerm || advisorFilter !== 'ALL' || teamFilter !== 'ALL' || dispositionFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setAdvisorFilter('ALL');
                setTeamFilter('ALL');
                setDispositionFilter('ALL');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-[11px] text-amber-600 hover:text-amber-800 font-bold ml-auto cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Audio Player if listening */}
      {audioPreviewCallId && (
        <div className="bg-neutral-900 text-white p-3.5 rounded-xl border border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-400 text-black">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Audio Stream · Call #{audioPreviewCallId}
              </div>
              <div className="text-[11px] text-neutral-400">Verifying live conversation for compliance evaluation</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <audio controls autoPlay src={getAudioUrl(audioPreviewCallId)} className="h-8 w-64" />
            <button
              onClick={() => setAudioPreviewCallId(null)}
              className="p-1 text-neutral-400 hover:text-white rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#111115] text-neutral-200 text-[11px] uppercase tracking-wider font-semibold border-b border-neutral-800">
              <tr>
                <th
                  onClick={() => toggleSort('id')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 text-amber-400 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>#</span>
                    {sortField === 'id' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('caller_name')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[140px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Caller Name</span>
                    {sortField === 'caller_name' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('client')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[100px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Client ID</span>
                    {sortField === 'client' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('trade_date')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Trade Date</span>
                    {sortField === 'trade_date' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('team')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[100px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Team</span>
                    {sortField === 'team' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('phone')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Phone Number</span>
                    {sortField === 'phone' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('audit_date')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-400 select-none whitespace-nowrap min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Audit Date</span>
                    {sortField === 'audit_date' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th className="py-3 px-2 text-center whitespace-nowrap" title="Q1: Registered Number / CLI match (Fatal)">
                  <div className="text-amber-400 font-bold">Q1 (CLI)</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th className="py-3 px-2 text-center whitespace-nowrap" title="Q2: Client UCC explicitly stated (Fatal)">
                  <div className="text-amber-400 font-bold">Q2 (UCC)</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th className="py-3 px-2 text-center whitespace-nowrap" title="Q3: Stock, Quantity & Price confirmed (1 pt)">
                  <div className="text-amber-400 font-bold">Q3 (Symbol)</div>
                  <div className="text-[9px] text-neutral-300 normal-case">1 Pt</div>
                </th>
                <th className="py-3 px-2 text-center whitespace-nowrap" title="Q4: Customer Acknowledgement (Not Audited - Always PASS)">
                  <div className="text-amber-400 font-bold">Q4 (Ack)</div>
                  <div className="text-[9px] text-emerald-400 font-bold normal-case">Default PASS</div>
                </th>
                <th className="py-3 px-2 text-center whitespace-nowrap" title="Q5: Return / Profit Guarantee Prohibition (Fatal)">
                  <div className="text-amber-400 font-bold">Q5 (Ethics)</div>
                  <div className="text-[9px] text-rose-400 font-semibold normal-case">Fatal</div>
                </th>
                <th
                  onClick={() => toggleSort('score')}
                  className="py-3 px-3 text-center cursor-pointer hover:text-amber-400 select-none whitespace-nowrap"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Score</span>
                    {sortField === 'score' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-neutral-600" />}
                  </div>
                </th>
                <th className="py-3 px-3 min-w-[200px]">Remarks / Feedback</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {paginatedScorecards.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-neutral-400">
                    No matching audit records found. Try adjusting your search or filters.
                  </td>
                </tr>
              ) : (
                paginatedScorecards.map((sc) => {
                  const state = getRowState(sc);
                  const isDirty = state.is_dirty;
                  const isSavingThis = savingId === sc.id;
                  const isSuccessThis = savedSuccessId === sc.id;
                  const isFatal = state.q1_status === 'FAIL' || state.q2_status === 'FAIL' || state.q5_status === 'FAIL' || state.score === 0;

                  return (
                    <tr
                      key={sc.id}
                      className={`transition-colors ${isDirty ? 'bg-amber-50/50' : 'hover:bg-neutral-50/60'} ${isFatal ? 'border-l-4 border-l-red-600' : 'border-l-4 border-l-transparent'}`}
                    >
                      {/* ID */}
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-700 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {sc.call_id ? (
                            <button
                              onClick={() => setAudioPreviewCallId(sc.call_id)}
                              className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-200 rounded-sm cursor-pointer"
                              title="Listen to call audio"
                            >
                              <Play className="w-3 h-3 fill-current text-amber-500" />
                            </button>
                          ) : null}
                          <span>#{sc.id}</span>
                        </div>
                      </td>

                      {/* Caller Name */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.caller_name}
                          onChange={(e) => handleCellChange(sc, 'caller_name', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-xs text-neutral-900 font-medium focus:outline-hidden"
                        />
                      </td>

                      {/* Client ID */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.client}
                          onChange={(e) => handleCellChange(sc, 'client', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-xs font-mono font-bold text-neutral-900 focus:outline-hidden"
                        />
                      </td>

                      {/* Trade Date */}
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={state.trade_date}
                          onChange={(e) => handleCellChange(sc, 'trade_date', e.target.value)}
                          className="w-full px-1.5 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-[11px] text-neutral-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Team */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.team}
                          onChange={(e) => handleCellChange(sc, 'team', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-xs text-neutral-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Phone Number */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.phone}
                          onChange={(e) => handleCellChange(sc, 'phone', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-xs font-mono text-neutral-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Audit Date */}
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={state.audit_date}
                          onChange={(e) => handleCellChange(sc, 'audit_date', e.target.value)}
                          className="w-full px-1.5 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-[11px] text-neutral-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Q1 Select */}
                      <td className="py-2 px-2 text-center">
                        <select
                          value={state.q1_status}
                          onChange={(e) => handleCellChange(sc, 'q1_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1.5 py-0.5 rounded-sm border cursor-pointer ${
                            state.q1_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border-rose-400 font-black'
                          }`}
                        >
                          <option value="PASS">PASS</option>
                          <option value="FAIL">FAIL (Fatal)</option>
                        </select>
                      </td>

                      {/* Q2 Select */}
                      <td className="py-2 px-2 text-center">
                        <select
                          value={state.q2_status}
                          onChange={(e) => handleCellChange(sc, 'q2_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1.5 py-0.5 rounded-sm border cursor-pointer ${
                            state.q2_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border-rose-400 font-black'
                          }`}
                        >
                          <option value="PASS">PASS</option>
                          <option value="FAIL">FAIL (Fatal)</option>
                        </select>
                      </td>

                      {/* Q3 Select */}
                      <td className="py-2 px-2 text-center">
                        <select
                          value={state.q3_status}
                          onChange={(e) => handleCellChange(sc, 'q3_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1.5 py-0.5 rounded-sm border cursor-pointer ${
                            state.q3_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-400'
                          }`}
                        >
                          <option value="PASS">PASS</option>
                          <option value="FAIL">FAIL (-1)</option>
                        </select>
                      </td>

                      {/* Q4 (Customer Ack - Default PASS) */}
                      <td className="py-2 px-2 text-center whitespace-nowrap" title="Not audited: Always PASS per regulatory rubric">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>PASS</span>
                          <span className="text-[9px] font-normal text-emerald-700">(Default)</span>
                        </span>
                      </td>

                      {/* Q5 Select */}
                      <td className="py-2 px-2 text-center">
                        <select
                          value={state.q5_status}
                          onChange={(e) => handleCellChange(sc, 'q5_status', e.target.value)}
                          className={`text-center font-bold text-[11px] px-1.5 py-0.5 rounded-sm border cursor-pointer ${
                            state.q5_status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border-rose-400 font-black'
                          }`}
                        >
                          <option value="PASS">PASS</option>
                          <option value="FAIL">FAIL (Fatal)</option>
                        </select>
                      </td>

                      {/* Score */}
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${
                            state.score === 5
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : state.score >= 4
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-rose-100 text-rose-900 border border-rose-300 font-extrabold'
                          }`}
                        >
                          {state.score} / 5
                        </span>
                      </td>

                      {/* Feedback Remarks */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={state.feedback}
                          onChange={(e) => handleCellChange(sc, 'feedback', e.target.value)}
                          className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-neutral-300 focus:border-amber-400 rounded-sm text-xs text-neutral-800 focus:outline-hidden"
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isDirty && (
                            <>
                              <button
                                onClick={() => handleSaveRow(sc)}
                                disabled={isSavingThis}
                                className="p-1 bg-amber-400 hover:bg-amber-500 text-black rounded-md cursor-pointer transition-colors shadow-2xs"
                                title="Save changes to this row"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleResetRow(sc)}
                                className="p-1 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-md cursor-pointer"
                                title="Discard inline edits"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isSuccessThis && (
                            <span className="text-emerald-700 text-xs font-bold flex items-center gap-0.5">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          )}

                          <button
                            onClick={() => setActiveModalItem(sc)}
                            className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-200 rounded-md cursor-pointer"
                            title="View full audit evidence details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(sc.id)}
                            disabled={deletingId === sc.id}
                            className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                            title="Delete this audit record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-600">
          <div>
            Showing <span className="font-bold text-neutral-900">{paginatedScorecards.length}</span> of{' '}
            <span className="font-bold text-neutral-900">{filteredAndSortedScorecards.length}</span> filtered audits (Total:{' '}
            {scorecards.length})
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 disabled:opacity-40 cursor-pointer font-medium"
            >
              Previous
            </button>
            <span className="px-2 py-1 font-mono text-neutral-800 font-bold">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 disabled:opacity-40 cursor-pointer font-medium"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Manual Audit for Trades Missing Recorded Calls (e.g. Mail Confirmation) */}
      <div className="pt-8 border-t-2 border-dashed border-neutral-300">
        <ManualTradeAuditView onScorecardCreated={onRefresh} />
      </div>

      {/* Modal: Full Audit Evidence Detail */}
      {activeModalItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-neutral-300 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <span className="p-1 rounded-md bg-amber-400 text-black">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span>Compliance Audit Details · Record #{activeModalItem.id}</span>
                </h3>
                <p className="text-xs text-neutral-500">
                  Advisor: {activeModalItem.caller_name || '—'} · Client: {activeModalItem.client_code || activeModalItem.client || '—'}
                </p>
              </div>
              <button
                onClick={() => setActiveModalItem(null)}
                className="p-1.5 text-neutral-400 hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
              <div>
                <span className="text-neutral-500">Trade Phone / CLI:</span>
                <span className="font-mono font-bold text-neutral-900 ml-1.5">
                  {activeModalItem.calling_number || activeModalItem.trade_phone || '—'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Registered Mobile:</span>
                <span className="font-mono font-bold text-neutral-900 ml-1.5">
                  {activeModalItem.registered_number || '—'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Trade Date:</span>
                <span className="font-medium text-neutral-900 ml-1.5">{activeModalItem.trade_date || '—'}</span>
              </div>
              <div>
                <span className="text-neutral-500">Team:</span>
                <span className="font-medium text-neutral-900 ml-1.5">{activeModalItem.team || '—'}</span>
              </div>
            </div>

            {/* Audio Stream for Verification */}
            {activeModalItem.call_id ? (
              <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 text-white flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-400 text-black shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Audio Stream · Call #{activeModalItem.call_id}</div>
                    <div className="text-[10px] text-neutral-400">Verifying live pre-order conversation &amp; spoken facts</div>
                  </div>
                </div>
                <audio controls src={getAudioUrl(activeModalItem.call_id)} className="h-8 w-full sm:w-64" />
              </div>
            ) : null}

            {/* 5 Parameters Full Evidence */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Audit Evidence Log</h4>
              
              <div className="p-3 rounded-lg border border-neutral-200 bg-white space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Q1: Registered Number / CLI Verification</span>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 font-bold">FATAL</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-sm font-bold text-xs ${activeModalItem.q1_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {activeModalItem.q1_status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{activeModalItem.q1_evidence || 'No specific evidence notes recorded.'}</p>
              </div>

              <div className="p-3 rounded-lg border border-neutral-200 bg-white space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Q2: Client Identity &amp; UCC Spoken</span>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 font-bold">FATAL</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-sm font-bold text-xs ${activeModalItem.q2_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {activeModalItem.q2_status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{activeModalItem.q2_evidence || 'No specific evidence notes recorded.'}</p>
              </div>

              <div className="p-3 rounded-lg border border-neutral-200 bg-white space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Q3: Stock Symbol, Quantity &amp; Execution Price</span>
                    <span className="text-[10px] text-neutral-600 bg-neutral-100 px-1 py-0.5 rounded border border-neutral-200 font-semibold">1 PT</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-sm font-bold text-xs ${activeModalItem.q3_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {activeModalItem.q3_status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{activeModalItem.q3_evidence || 'No specific evidence notes recorded.'}</p>
              </div>

              <div className="p-3 rounded-lg border border-neutral-200 bg-white space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Q4: Customer Order Acknowledgement</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 font-semibold">NOT AUDITED · ALWAYS PASS</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-sm font-bold text-xs bg-emerald-100 text-emerald-800">
                    PASS (Default)
                  </span>
                </div>
                <p className="text-xs text-neutral-600">Standard regulatory rule: Parameter not actively evaluated in this rubric; automatically awarded PASS.</p>
              </div>

              <div className="p-3 rounded-lg border border-neutral-200 bg-white space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Q5: Ethical Standards (No Return / Profit Guarantee)</span>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 font-bold">FATAL</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded-sm font-bold text-xs ${activeModalItem.q5_status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {activeModalItem.q5_status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{activeModalItem.q5_evidence || 'No specific evidence notes recorded.'}</p>
              </div>
            </div>

            <div className="p-3 bg-neutral-900 text-white rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-400">Official Evaluation Rating</div>
                <div className="text-sm font-bold text-amber-400">Score: {activeModalItem.score} / 5 Points</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-400">Audit Status</div>
                <div className={`text-xs font-bold ${activeModalItem.score >= 4 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activeModalItem.score >= 4 ? 'AUDIT COMPLIANT' : 'AUDIT DEFICIENT'}
                </div>
              </div>
            </div>

            {/* Highlighting Analysis Section */}
            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1.5">
                Speech Transcript &amp; Audit Evidence Highlights
              </h4>
              <div className="p-3.5 bg-neutral-950 text-neutral-200 font-mono text-xs rounded-xl border border-neutral-800 max-h-64 overflow-y-auto">
                <TranscriptHighlighter
                  transcript={activeModalItem.transcript || ''}
                  clientCode={activeModalItem.client_code || activeModalItem.client}
                  symbol={activeModalItem.symbol || (activeModalItem.trades && activeModalItem.trades[0]?.symbol)}
                  price={activeModalItem.price || (activeModalItem.trades && activeModalItem.trades[0]?.price)}
                  quantity={activeModalItem.quantity || (activeModalItem.trades && activeModalItem.trades[0]?.quantity)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-900 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create New Audit Entry */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-300 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <span className="p-1 rounded-md bg-amber-400 text-black">
                  <Plus className="w-4 h-4" />
                </span>
                <span>Add Manual Audit Record</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-neutral-400 hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Caller / Advisor Name *</label>
                  <input
                    type="text"
                    required
                    value={newRecord.caller_name}
                    onChange={(e) => setNewRecord({ ...newRecord, caller_name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Client ID / UCC *</label>
                  <input
                    type="text"
                    required
                    value={newRecord.client}
                    onChange={(e) => setNewRecord({ ...newRecord, client: e.target.value })}
                    placeholder="e.g. CLI001"
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Trade Date</label>
                  <input
                    type="date"
                    value={newRecord.trade_date}
                    onChange={(e) => setNewRecord({ ...newRecord, trade_date: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newRecord.phone}
                    onChange={(e) => setNewRecord({ ...newRecord, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Team</label>
                  <input
                    type="text"
                    value={newRecord.team}
                    onChange={(e) => setNewRecord({ ...newRecord, team: e.target.value })}
                    placeholder="e.g. Equities North"
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 font-medium mb-1">Audit Date</label>
                  <input
                    type="date"
                    value={newRecord.audit_date}
                    onChange={(e) => setNewRecord({ ...newRecord, audit_date: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Status Selectors */}
              <div className="grid grid-cols-5 gap-2 pt-2 border-t border-neutral-100">
                <div>
                  <label className="block text-[10px] text-neutral-600 font-bold mb-1">Q1 (CLI) <span className="text-rose-600 font-bold">Fatal</span></label>
                  <select
                    value={newRecord.q1_status}
                    onChange={(e) => setNewRecord({ ...newRecord, q1_status: e.target.value })}
                    className="w-full py-1 text-xs border rounded-md"
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL (Fatal)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-600 font-bold mb-1">Q2 (UCC) <span className="text-rose-600 font-bold">Fatal</span></label>
                  <select
                    value={newRecord.q2_status}
                    onChange={(e) => setNewRecord({ ...newRecord, q2_status: e.target.value })}
                    className="w-full py-1 text-xs border rounded-md"
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL (Fatal)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-600 font-bold mb-1">Q3 (Symbol) <span className="text-neutral-500 font-semibold">1 Pt</span></label>
                  <select
                    value={newRecord.q3_status}
                    onChange={(e) => setNewRecord({ ...newRecord, q3_status: e.target.value })}
                    className="w-full py-1 text-xs border rounded-md"
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL (-1)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-600 font-bold mb-1">Q4 (Ack)</label>
                  <div className="w-full py-1 px-1 text-[11px] border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-md font-bold text-center">
                    PASS <span className="text-[9px] font-normal block text-emerald-600">(Default)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-600 font-bold mb-1">Q5 (Ethics) <span className="text-rose-600 font-bold">Fatal</span></label>
                  <select
                    value={newRecord.q5_status}
                    onChange={(e) => setNewRecord({ ...newRecord, q5_status: e.target.value })}
                    className="w-full py-1 text-xs border rounded-md"
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL (Fatal)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-600 font-medium mb-1">Audit Feedback / Comment</label>
                <input
                  type="text"
                  value={newRecord.feedback}
                  onChange={(e) => setNewRecord({ ...newRecord, feedback: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-black font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  Insert Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
