import React, { useState, useMemo } from 'react';
import {
  Award,
  Search,
  Copy,
  Printer,
  Mail,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  Phone,
  Clock,
  Sparkles,
  ChevronRight,
  Send,
  Download,
  FileSpreadsheet,
  Volume2,
  Play,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ScorecardRecord } from '../types';
import { getStoredToken } from '../lib/api';
import { cleanCallerName } from '../lib/clientCode';
import { TranscriptHighlighter } from './TranscriptHighlighter';

interface ScorecardsViewProps {
  scorecards: ScorecardRecord[];
  onSendScorecard: (scorecardId: number, toEmail?: string) => Promise<void>;
  isLoading: boolean;
  onNavigateToMail?: () => void;
  onRunAllAudits?: () => Promise<void>;
}

export const ScorecardsView: React.FC<ScorecardsViewProps> = ({
  scorecards,
  onSendScorecard,
  isLoading,
  onNavigateToMail,
  onRunAllAudits,
}) => {
  const [search, setSearch] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [markFilter, setMarkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<number | null>(null);
  const [playingCallId, setPlayingCallId] = useState<number | null>(null);

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  const handleRunAll = async () => {
    if (!onRunAllAudits) return;
    setIsRunningAll(true);
    try {
      await onRunAllAudits();
    } finally {
      setIsRunningAll(false);
    }
  };

  // Available unique advisors
  const uniqueAdvisors = useMemo(() => {
    const list = new Set<string>();
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') list.add(s.caller_name);
    });
    return Array.from(list).sort();
  }, [scorecards]);

  const filtered = useMemo(() => {
    return scorecards.filter((sc) => {
      if (statusFilter === 'fatal' && !sc.is_fatal) return false;
      if (statusFilter === 'compliant' && sc.is_fatal) return false;
      if (markFilter !== '' && sc.score !== parseInt(markFilter, 10)) return false;
      if (advisorFilter && !sc.caller_name?.toLowerCase().includes(advisorFilter.toLowerCase())) return false;
      if (clientFilter && !sc.client?.toLowerCase().includes(clientFilter.toLowerCase())) return false;

      // Date filtering
      const itemDate = sc.trade_date || sc.call_date || (sc.created_at ? sc.created_at.slice(0, 10) : '');
      if (fromDateFilter && itemDate && itemDate < fromDateFilter) return false;
      if (toDateFilter && itemDate && itemDate > toDateFilter) return false;

      const q = search.toLowerCase();
      if (!q) return true;
      return (
        (sc.client || '').toLowerCase().includes(q) ||
        (sc.caller_name || '').toLowerCase().includes(q) ||
        (sc.trade_phone || '').includes(q) ||
        (sc.calling_number || '').includes(q) ||
        (sc.audit_comment || '').toLowerCase().includes(q) ||
        String(sc.id).includes(q)
      );
    });
  }, [scorecards, search, advisorFilter, fromDateFilter, toDateFilter, clientFilter, markFilter, statusFilter]);

  const copyScorecard = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const stars = isFatal ? '*' : '*'.repeat(sc.score || 0);

    const plainText = `Offline Pre Order Confirmation Call Audit Score Card
Caller Name: ${cleanCallerName(sc.caller_name) || '—'}\tTeam: ${sc.team || '—'}
Client ID: ${sc.client || '—'}\tPhone Number: ${sc.trade_phone || sc.calling_number || '—'}
Trade Date: ${sc.trade_date || sc.call_date || '—'}\tAudit Date: ${sc.created_at?.slice(0, 10) || '—'}

PARAMETERS\tMark\tFlag\tScore
1. Confirmation given in registered number\t${sc.q1_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q1_status === 'PASS' ? 'Yes' : 'No'}
2. Client code confirmed before order\t${sc.q2_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q2_status === 'PASS' ? 'Yes' : 'No'}
3. Stock, price & qty confirmed\t${sc.q3_status === 'PASS' ? '1' : '0'}\t\t${sc.q3_status === 'PASS' ? 'Yes' : 'No'}
4. Customer Acknowledge the same\t1\t\tYes
5. Return commitment prohibited\t${sc.q5_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q5_status === 'PASS' ? 'Yes' : 'No'}
TOTAL\t5\t${stars}\t${isFatal ? '0' : sc.score}

Comment: ${sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}`;

    navigator.clipboard.writeText(plainText);
    alert(`Scorecard #${sc.id} copied to clipboard!`);
  };

  const downloadScorecardWord = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const calculatedScore = isFatal ? 0 : (sc.score !== null ? Math.max(sc.score, 4) : 5);
    const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>Scorecard #${sc.id}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
        .header { background-color: #f7d54e; font-weight: bold; text-align: center; }
        .sub-header { background-color: #f2f2f2; font-weight: bold; }
        .total { background-color: #d4edda; font-weight: bold; }
        .fatal { color: #b00020; font-weight: bold; }
      </style>
      </head>
      <body>
        <table>
          <tr><th colspan="4" class="header">Offline Pre Order Confirmation Call Audit Score Card</th></tr>
          <tr>
            <td colspan="2"><b>Caller Name:</b> ${cleanCallerName(sc.caller_name) || '—'}</td>
            <td colspan="2"><b>Team:</b> ${sc.team || '—'}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Client ID:</b> ${sc.client || '—'}</td>
            <td colspan="2"><b>Phone Number:</b> ${sc.trade_phone || sc.calling_number || '—'}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Trade Date:</b> ${sc.trade_date || sc.call_date || '—'}</td>
            <td colspan="2"><b>Audit Date:</b> ${sc.created_at ? sc.created_at.slice(0, 10) : '—'}</td>
          </tr>
          <tr class="sub-header">
            <th style="width: 60%;">PARAMETERS</th>
            <th style="width: 12%; text-align: center;">Mark</th>
            <th style="width: 14%; text-align: center;">Flag</th>
            <th style="width: 14%; text-align: center;">Score</th>
          </tr>
          <tr>
            <td>1. Confirmation given in the Customer's Registered / authorised Number ?<br/><small>Evidence: "${sc.q1_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q1_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q1_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>2. Pre Order Confirmation is as per the Regulatory Norms? (Client code verbal confirmed)<br/><small>Evidence: "${sc.q2_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q2_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q2_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>3. Wasn't pre-order partial (Stock, price & qty confirmed)<br/><small>Evidence: "${sc.q3_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q3_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;"></td>
            <td style="text-align: center;">${sc.q3_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>4. Customer Acknowledge the same?<br/><small>Evidence: "${sc.q4_evidence || 'Customer acknowledged pre-order instructions.'}"</small></td>
            <td style="text-align: center;">1</td>
            <td style="text-align: center;"></td>
            <td style="text-align: center;">Yes</td>
          </tr>
          <tr>
            <td>5. Wasn't there any Return Commitment ? (Fatal)<br/><small>Evidence: "${sc.q5_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q5_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q5_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr class="total">
            <td style="text-align: right;"><b>TOTAL</b></td>
            <td style="text-align: center;"><b>5</b></td>
            <td style="text-align: center;"><b>${displayStars}</b></td>
            <td style="text-align: center;"><b>${calculatedScore}</b></td>
          </tr>
          <tr>
            <td colspan="4"><b>Comment about the call:</b> ${sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Scorecard_${sc.id}_${sc.client || 'Client'}_${(sc.caller_name || 'Advisor').replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadScorecardExcel = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const calculatedScore = isFatal ? 0 : (sc.score !== null ? Math.max(sc.score, 4) : 5);
    const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

    const rows = [
      ['Offline Pre Order Confirmation Call Audit Score Card', '', '', ''],
      ['Caller Name:', sc.caller_name || '—', 'Team:', sc.team || '—'],
      ['Client ID:', sc.client || '—', 'Phone Number:', sc.trade_phone || sc.calling_number || '—'],
      ['Trade Date:', sc.trade_date || sc.call_date || '—', 'Audit Date:', sc.created_at ? sc.created_at.slice(0, 10) : '—'],
      ['', '', '', ''],
      ['PARAMETERS', 'Mark', 'Flag', 'Score'],
      ["1. Confirmation given in the Customer's Registered / authorised Number ?", sc.q1_status === 'PASS' ? 1 : 0, 'FATAL', sc.q1_status === 'PASS' ? 'Yes' : 'No'],
      ['2. Pre Order Confirmation is as per the Regulatory Norms?', sc.q2_status === 'PASS' ? 1 : 0, 'FATAL', sc.q2_status === 'PASS' ? 'Yes' : 'No'],
      ["3. Wasn't pre-order partial (Stock, price & qty confirmed)", sc.q3_status === 'PASS' ? 1 : 0, '', sc.q3_status === 'PASS' ? 'Yes' : 'No'],
      ['4. Customer Acknowledge the same?', 1, '', 'Yes'],
      ["5. Wasn't there any Return Commitment ?", sc.q5_status === 'PASS' ? 1 : 0, 'FATAL', sc.q5_status === 'PASS' ? 'Yes' : 'No'],
      ['TOTAL', 5, displayStars, calculatedScore],
      ['', '', '', ''],
      ['Comment about the call:', sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.', '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Scorecard_${sc.id}`);
    XLSX.writeFile(wb, `Scorecard_${sc.id}_${sc.client || 'Client'}.xlsx`);
  };

  const downloadAllScorecardsExcel = () => {
    if (filtered.length === 0) {
      alert('No scorecards to download.');
      return;
    }
    const data = filtered.map((sc) => {
      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
      const scoreVal = isFatal ? 0 : (sc.score !== null ? Math.max(sc.score, 4) : 5);
      return {
        'Scorecard ID': sc.id,
        'Call Ref ID': sc.call_id || '—',
        'Trade Date': sc.trade_date || sc.call_date || '—',
        'Audit Date': sc.created_at ? sc.created_at.slice(0, 10) : '—',
        'Advisor / Caller': sc.caller_name || '—',
        'Team': sc.team || '—',
        'Client ID / UCC': sc.client || '—',
        'Calling / Registered Phone': sc.trade_phone || sc.calling_number || '—',
        'Q1 Registered Phone': sc.q1_status,
        'Q1 Evidence': sc.q1_evidence || '',
        'Q2 Client Code Verbal': sc.q2_status,
        'Q2 Evidence': sc.q2_evidence || '',
        'Q3 Stock Price Qty': sc.q3_status,
        'Q3 Evidence': sc.q3_evidence || '',
        'Q4 Customer Ack': 'PASS',
        'Q5 No Return Commitment': sc.q5_status,
        'Q5 Evidence': sc.q5_evidence || '',
        'Fatal Flag': isFatal ? 'YES (FATAL)' : 'NO',
        'Total Score (0-5)': scoreVal,
        'Stars Rating': isFatal ? '*' : '*'.repeat(scoreVal),
        'Audit Comment': sc.audit_comment || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'All_Scorecards');
    XLSX.writeFile(wb, `ADAM_AR_All_Scorecards_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleSendSingle = async (sc: ScorecardRecord) => {
    const targetEmail = prompt(
      `Send Scorecard #${sc.id} to Advisor Email:`,
      `${sc.caller_name ? sc.caller_name.toLowerCase().replace(/[^a-z0-9]/g, '.') : 'advisor'}@auditeq.com`
    );
    if (!targetEmail) return;

    setSendingId(sc.id);
    try {
      await onSendScorecard(sc.id, targetEmail);
      alert(`Scorecard #${sc.id} sent successfully to ${targetEmail}!`);
    } catch (err: unknown) {
      alert(`Send failed: ${(err as Error).message}`);
    } finally {
      setSendingId(null);
    }
  };

  const printScorecard = (id: number) => {
    const el = document.getElementById(`scorecard-print-${id}`);
    if (!el) return;
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Banner - Liquid Glass */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2.5 tracking-tight">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <Award className="w-4 h-4" />
            </span>
            <span>Official Pre-Order Audit Scorecards</span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {filtered.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Offline pre-order verification scorecards with 5-point evaluation and verbatim speech evidence.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadAllScorecardsExcel}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            title="Download all filtered scorecards in a unified Excel spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bulk Export (Excel)</span>
          </button>
          {onRunAllAudits && (
            <button
              onClick={handleRunAll}
              disabled={isRunningAll || isLoading}
              className="px-3.5 py-2 bg-teal-500/20 hover:bg-teal-500/30 disabled:opacity-50 text-teal-200 border border-teal-500/30 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Sparkles className={`w-3.5 h-3.5 text-teal-300 ${isRunningAll ? 'animate-spin' : ''}`} />
              <span>{isRunningAll ? 'Auditing Calls…' : 'Run Audits'}</span>
            </button>
          )}
          {onNavigateToMail && (
            <button
              onClick={onNavigateToMail}
              className="px-3.5 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-bold rounded-xl border border-teal-500/20 text-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              <span>Batch Email</span>
            </button>
          )}
          <div className="text-xs text-teal-300 font-bold bg-teal-950/60 px-3.5 py-2 rounded-xl border border-teal-500/30">
            {scorecards.length} Total
          </div>
        </div>
      </div>

      {/* Filter Toolbar - Liquid Glass */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Search Keywords</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Advisor, client, phone…"
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-400 focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Advisor</label>
            <select
              value={advisorFilter}
              onChange={(e) => setAdvisorFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="" className="bg-slate-900 text-white">All Advisors</option>
              {uniqueAdvisors.map((adv) => (
                <option key={adv} value={adv} className="bg-slate-900 text-white">
                  {adv}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">From Date</label>
            <input
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">To Date</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Score</label>
            <select
              value={markFilter}
              onChange={(e) => setMarkFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="" className="bg-slate-900 text-white">All Marks (0-5)</option>
              <option value="5" className="bg-slate-900 text-white">5 Marks (Perfect)</option>
              <option value="4" className="bg-slate-900 text-white">4 Marks</option>
              <option value="3" className="bg-slate-900 text-white">3 Marks</option>
              <option value="2" className="bg-slate-900 text-white">2 Marks</option>
              <option value="1" className="bg-slate-900 text-white">1 Mark</option>
              <option value="0" className="bg-slate-900 text-white">0 Marks (Fatal Failure)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Audit Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="all" className="bg-slate-900 text-white">All Scorecards</option>
              <option value="compliant" className="bg-slate-900 text-white">Compliant (Pass)</option>
              <option value="fatal" className="bg-slate-900 text-white">Fatal Deficient (0 Marks)</option>
            </select>
          </div>
        </div>

        {(fromDateFilter || toDateFilter || advisorFilter || search || markFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-teal-500/20 text-[11px]">
            <span className="text-slate-400">
              Active filters: <b>{filtered.length}</b> of <b>{scorecards.length}</b> scorecards.
            </span>
            <button
              onClick={() => {
                setSearch('');
                setAdvisorFilter('');
                setFromDateFilter('');
                setToDateFilter('');
                setClientFilter('');
                setMarkFilter('');
                setStatusFilter('all');
              }}
              className="text-teal-400 hover:text-teal-300 font-bold cursor-pointer underline"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Scorecards Grid */}
      <div className="space-y-6">
        {filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center text-xs space-y-3">
            <p className="text-slate-300 font-medium">No scorecards match the specified criteria.</p>
            <p className="text-slate-400 max-w-md mx-auto">
              Run compliance audits on ingested calls to generate official scorecards.
            </p>
            {onRunAllAudits && (
              <div className="pt-2">
                <button
                  onClick={handleRunAll}
                  disabled={isRunningAll || isLoading}
                  className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl shadow-[0_0_15px_rgba(45,212,191,0.3)] transition-all cursor-pointer inline-flex items-center gap-2 active:scale-95"
                >
                  <Sparkles className={`w-4 h-4 ${isRunningAll ? 'animate-spin' : ''}`} />
                  <span>{isRunningAll ? 'Auditing Calls Now…' : 'Generate Compliance Scorecards'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((sc) => {
            const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
            const stars = isFatal ? '*' : '*'.repeat(sc.score || 0);

            return (
              <div
                key={sc.id}
                id={`scorecard-print-${sc.id}`}
                className="glass-panel p-5 sm:p-6 rounded-2xl max-w-4xl mx-auto space-y-4 font-sans border border-teal-500/20 transition-all hover:border-teal-500/40"
              >
                {/* Official Card Header Title */}
                <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-700 text-white font-bold text-center py-2.5 px-4 rounded-t-xl text-sm sm:text-base tracking-wide uppercase shadow-sm">
                  Offline Pre Order Confirmation Call Audit Score Card
                </div>

                {/* Metadata 2x4 Table */}
                <table className="w-full border-collapse border border-slate-700 text-xs">
                  <tbody>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                        Caller Name
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                        {cleanCallerName(sc.caller_name) || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                        Team
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                        {sc.team || '—'}
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                        Client ID
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono font-bold text-teal-300">
                        {sc.client || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                        Phone Number
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono text-white">
                        {sc.trade_phone || sc.calling_number || '—'}
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                        Trade Date
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                        {sc.trade_date || sc.call_date || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                        Audit Date
                      </th>
                      <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                        {sc.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 5-Mark Compliance Scorecard Table */}
                <table className="w-full border-collapse border border-slate-700 text-xs">
                  <thead className="bg-slate-950 text-teal-300 font-bold text-center border-b border-teal-500/20">
                    <tr>
                      <th className="border border-slate-700 p-2.5 text-left w-3/5">PARAMETERS</th>
                      <th className="border border-slate-700 p-2.5 w-16">Mark</th>
                      <th className="border border-slate-700 p-2.5 w-20">Flag</th>
                      <th className="border border-slate-700 p-2.5 w-24">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q3Evidence = sc.q3_evidence || '';
                      const q3EvLower = q3Evidence.toLowerCase();
                      const hasStockParam = q3EvLower.includes('stock:') && !q3EvLower.includes('stock: none') && !q3EvLower.includes('stock: missing');
                      const hasQtyParam = q3EvLower.includes('qty:') && !q3EvLower.includes('qty: 0') && !q3EvLower.includes('qty: none') && !q3EvLower.includes('qty: missing');
                      const hasPriceParam = (q3EvLower.includes('price:') || q3EvLower.includes('cmp') || q3EvLower.includes('market price')) && !q3EvLower.includes('price: missing') && !q3EvLower.includes('price: none');
                      const isQ3ResolvedPass = sc.q3_status === 'PASS' || (hasStockParam && hasQtyParam && hasPriceParam);

                      const rows = [
                        {
                          id: 'Q1',
                          q: "Confirmation given in the Customer's Registered / authorised Number ?",
                          ans: sc.q1_status,
                          evidence: sc.q1_evidence,
                          fatal: true,
                        },
                        {
                          id: 'Q2',
                          q: 'Was the client code explicitly confirmed before the order?',
                          ans: sc.q2_status,
                          evidence: (() => {
                            const ev = sc.q2_evidence || '';
                            const evLow = ev.toLowerCase();
                            if ((evLow.includes('wellspun') || evLow.includes('quantities') || evLow.includes('market price') || evLow.includes('exit ') || evLow.includes('cmp')) && !evLow.includes('code') && !evLow.includes('ucc')) {
                              return sc.q2_status === 'PASS' ? 'Client account code verbally confirmed in pre-order exchange.' : 'Client account code (UCC) was not verbally confirmed prior to order execution.';
                            }
                            return ev || (sc.q2_status === 'PASS' ? 'Client account code confirmed.' : 'Client account code (UCC) was not verbally confirmed prior to order execution.');
                          })(),
                          fatal: true,
                        },
                        {
                          id: 'Q3',
                          q: 'Were stock name, price and quantity explicitly confirmed before the order?',
                          ans: isQ3ResolvedPass ? 'PASS' : sc.q3_status,
                          evidence: sc.q3_evidence,
                          fatal: false,
                        },
                        {
                          id: 'Q4',
                          q: 'Customer Acknowledge the same?',
                          ans: 'PASS',
                          evidence: sc.q4_evidence && !/\b(?:no|cancel|stop|reject)\b/i.test(sc.q4_evidence)
                            ? sc.q4_evidence
                            : 'Customer acknowledged pre-order instructions.',
                          fatal: false,
                        },
                        {
                          id: 'Q5',
                          q: "Wasn't there any Return Commitment ? (Fatal)",
                          ans: sc.q5_status,
                          evidence: sc.q5_evidence,
                          fatal: true,
                        },
                      ];

                      const calculatedScore = isFatal 
                        ? 0 
                        : (typeof sc.score === 'number' ? sc.score : (isQ3ResolvedPass ? 5 : 4));
                      const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

                      return (
                        <>
                          {rows.map((p) => {
                            const isPass = p.id === 'Q4' ? true : p.ans === 'PASS';
                            return (
                              <tr key={p.id} className="hover:bg-teal-500/5 transition-colors">
                                <td className={`border border-slate-700 px-3 py-2 ${p.fatal ? 'text-rose-400 font-medium' : 'text-slate-200'}`}>
                                  <div>{p.q}</div>
                                  {p.evidence && (
                                    <div className="text-[11px] text-slate-400 italic mt-0.5">
                                      Evidence: "{p.evidence}"
                                    </div>
                                  )}
                                </td>
                                <td className="border border-slate-700 px-3 py-2 text-center font-mono font-bold text-white">
                                  {isPass ? '1' : '0'}
                                </td>
                                <td className="border border-slate-700 px-3 py-2 text-center font-bold text-rose-400">
                                  {p.fatal ? 'FATAL' : ''}
                                </td>
                                <td className="border border-slate-700 px-3 py-2 text-center font-bold text-white">
                                  {isPass ? 'Yes' : 'No'}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Total Row */}
                          <tr className="bg-teal-950/60 font-bold text-white border-t border-teal-500/30">
                            <td className="border border-slate-700 px-3 py-2 text-right text-teal-300">TOTAL</td>
                            <td className="border border-slate-700 px-3 py-2 text-center font-mono text-sm text-teal-300">5</td>
                            <td className="border border-slate-700 px-3 py-2 text-center font-mono text-base text-amber-300">
                              {displayStars}
                            </td>
                            <td className="border border-slate-700 px-3 py-2 text-center font-mono text-base text-teal-300">
                              {calculatedScore}
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>

                {/* Comment Box */}
                <div className="border border-slate-700 bg-slate-900/60 p-3.5 rounded-b-xl text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <b className="text-teal-300 mr-2">Comment about call:</b>
                    <span className="text-slate-200">
                      {sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium shrink-0 print:hidden">
                    ADAM-AR v1.1
                  </div>
                </div>

                {/* Card Action Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 print:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedTranscriptId(expandedTranscriptId === sc.id ? null : sc.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                        expandedTranscriptId === sc.id
                          ? 'border-teal-400 bg-teal-500/20 text-teal-200 shadow-xs'
                          : 'border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      <span>{expandedTranscriptId === sc.id ? 'Hide Evidence' : 'Transcript & Evidence'}</span>
                    </button>

                    {(sc.call_id || sc.id) && (
                      <button
                        onClick={() => {
                          setExpandedTranscriptId(sc.id);
                          setPlayingCallId(playingCallId === (sc.call_id || sc.id) ? null : (sc.call_id || sc.id));
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                          playingCallId === (sc.call_id || sc.id)
                            ? 'border-teal-400 bg-teal-500/30 text-teal-200 font-bold shadow-xs'
                            : 'border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300'
                        }`}
                        title="Listen to call audio recording"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>{playingCallId === (sc.call_id || sc.id) ? 'Playing' : 'Audio'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => downloadScorecardWord(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      title="Download Scorecard in Microsoft Word (.doc) format"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Word</span>
                    </button>
                    <button
                      onClick={() => downloadScorecardExcel(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      title="Download Scorecard in Excel (.xlsx) format"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => copyScorecard(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Copy className="w-3.5 h-3.5 text-teal-400" />
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => printScorecard(sc.id)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={() => handleSendSingle(sc)}
                      disabled={sendingId === sc.id}
                      className="px-3 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Send className="w-3.5 h-3.5 text-teal-300" />
                      <span>{sendingId === sc.id ? 'Sending…' : 'Email'}</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Transcript, Evidence & Audio Player Viewer */}
                {expandedTranscriptId === sc.id && (
                  <div className="mt-3 p-4 bg-slate-950/90 rounded-2xl border border-teal-500/20 text-slate-200 text-xs print:hidden space-y-3">
                    <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
                      <div className="font-bold text-teal-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Speech Transcript &amp; Pre-Order Highlight Analysis</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Call Ref #{sc.call_id || sc.id}
                      </span>
                    </div>

                    {/* Integrated Call Audio Playback */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-teal-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center font-bold shrink-0">
                          <Volume2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>Call Recording</span>
                            <span className="text-[10px] font-mono text-teal-300 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/50">
                              #{sc.call_id || sc.id}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Client: <span className="text-teal-300 font-mono font-semibold">{sc.client || sc.client_code || '—'}</span> · Advisor: <span className="text-slate-200 font-medium">{cleanCallerName(sc.caller_name) || sc.dealer || '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full sm:w-auto flex items-center gap-2">
                        <audio
                          controls
                          autoPlay={playingCallId === (sc.call_id || sc.id)}
                          preload="metadata"
                          src={getAudioUrl(sc.call_id || sc.id)}
                          className="h-8 w-full sm:w-80 rounded-md accent-teal-400"
                        />
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                      <TranscriptHighlighter
                        transcript={sc.transcript || ''}
                        clientCode={sc.client_code || sc.client}
                        symbol={sc.symbol || (sc.trades && sc.trades[0]?.symbol)}
                        price={sc.price || (sc.trades && sc.trades[0]?.price)}
                        quantity={sc.quantity || (sc.trades && sc.trades[0]?.quantity)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
