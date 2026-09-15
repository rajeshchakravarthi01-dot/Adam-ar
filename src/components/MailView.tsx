import React, { useState, useMemo, useEffect } from 'react';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Filter,
  ShieldCheck,
  FileCheck2,
  Zap,
  Server,
  RefreshCw,
  Sparkles,
  Settings,
  Tag,
  RotateCcw,
  Plus,
  Edit3,
  X,
} from 'lucide-react';
import emailjs from '@emailjs/browser';
import type { ScorecardRecord, MailHistoryRecord } from '../types';
import { api } from '../lib/api';
import {
  getAdvisorEmailRouting,
  FUNDSINDIA_ADVISOR_DIRECTORY,
  FATAL_CC_EMAIL,
} from '../lib/fundsindia-directory';

interface MailViewProps {
  scorecards: ScorecardRecord[];
  advisors: string[];
  mailHistory: MailHistoryRecord[];
  onBulkSend: (options: {
    advisor: string;
    from_date?: string;
    to_date?: string;
    subject?: string;
    to?: string;
    cc?: string;
    marker_filter?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export const MailView: React.FC<MailViewProps> = ({
  scorecards,
  advisors,
  mailHistory,
  onBulkSend,
  isLoading,
}) => {
  // Custom user-entered advisors (persisted in browser storage)
  const [customAdvisors, setCustomAdvisors] = useState<Array<{ name: string; email: string }>>(() => {
    try {
      const saved = localStorage.getItem('auditeq_custom_advisors') || localStorage.getItem('fundsindia_custom_advisors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Manual advisor email override mode for "Individual Advisor Mailboxes"
  const [isManualEmailMode, setIsManualEmailMode] = useState<boolean>(false);
  const [manualEmailInput, setManualEmailInput] = useState<string>('');

  // Add new manual advisor inline modal state
  const [showAddAdvisorInline, setShowAddAdvisorInline] = useState<boolean>(false);
  const [newAdvisorName, setNewAdvisorName] = useState<string>('');
  const [newAdvisorEmail, setNewAdvisorEmail] = useState<string>('');

  // Derive unique advisor list from directory + scorecards + custom advisors
  const availableAdvisors = useMemo(() => {
    const list = new Set<string>();
    // Add directory advisors first
    FUNDSINDIA_ADVISOR_DIRECTORY.forEach((entry) => list.add(entry.advisor_name));
    // Add custom manually added advisors
    customAdvisors.forEach((ca) => ca.name && list.add(ca.name));
    // Add from props
    advisors.forEach((a) => a && list.add(a));
    // Add from scorecards
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') list.add(s.caller_name);
    });
    return Array.from(list).filter(Boolean);
  }, [advisors, scorecards, customAdvisors]);

  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('ALL');

  // Marker / Score Categorization Filter
  const [markerFilter, setMarkerFilter] = useState<'all' | '0' | '4' | '5'>('all');

  // Date Range State
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Email Config State
  const [toEmail, setToEmail] = useState<string>('');
  const [ccEmail, setCcEmail] = useState<string>('');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Dispatch Engine Selection (Backend SMTP vs EmailJS)
  const [dispatchEngine, setDispatchEngine] = useState<'smtp' | 'emailjs'>('smtp');
  const [emailJsServiceId, setEmailJsServiceId] = useState<string>('');
  const [emailJsTemplateId, setEmailJsTemplateId] = useState<string>('');
  const [emailJsPublicKey, setEmailJsPublicKey] = useState<string>('');
  const [showEmailJsConfig, setShowEmailJsConfig] = useState<boolean>(false);

  // Live SMTP Diagnostic State
  const [testEmail, setTestEmail] = useState<string>('ashutosh.kumar@auditeq.com');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Re-sync routing whenever advisor or marker filter changes
  useEffect(() => {
    if (selectedAdvisor === 'ALL') {
      const isFatalAlone = markerFilter === '0';
      if (isManualEmailMode && manualEmailInput) {
        setToEmail(manualEmailInput);
      } else {
        setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
      }
      setCcEmail(isFatalAlone ? `compliance@auditeq.com, ${FATAL_CC_EMAIL}` : 'compliance@auditeq.com');
    } else if (selectedAdvisor) {
      const customMatch = customAdvisors.find(
        (c) => c.name.toLowerCase() === selectedAdvisor.toLowerCase()
      );
      if (customMatch) {
        setToEmail(customMatch.email);
        setCcEmail(markerFilter === '0' ? `compliance@auditeq.com, ${FATAL_CC_EMAIL}` : 'compliance@auditeq.com');
      } else {
        const isFatalAlone = markerFilter === '0';
        const routing = getAdvisorEmailRouting({
          advisorName: selectedAdvisor,
          isFatalAlone,
        });
        setToEmail(routing.to);
        setCcEmail(routing.cc);
      }
    }
  }, [selectedAdvisor, markerFilter, isManualEmailMode, manualEmailInput, customAdvisors]);

  const handleResetRouting = () => {
    setIsManualEmailMode(false);
    setManualEmailInput('');
    if (selectedAdvisor === 'ALL') {
      const isFatalAlone = markerFilter === '0';
      setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
      setCcEmail(isFatalAlone ? `compliance@auditeq.com, ${FATAL_CC_EMAIL}` : 'compliance@auditeq.com');
      setCustomSubject('');
      setStatusMsg({ text: 'Email recipients reset to organizational directory standards.', type: 'success' });
    } else if (selectedAdvisor) {
      const customMatch = customAdvisors.find(
        (c) => c.name.toLowerCase() === selectedAdvisor.toLowerCase()
      );
      if (customMatch) {
        setToEmail(customMatch.email);
        setCcEmail(markerFilter === '0' ? `compliance@auditeq.com, ${FATAL_CC_EMAIL}` : 'compliance@auditeq.com');
      } else {
        const isFatalAlone = markerFilter === '0';
        const routing = getAdvisorEmailRouting({
          advisorName: selectedAdvisor,
          isFatalAlone,
        });
        setToEmail(routing.to);
        setCcEmail(routing.cc);
      }
      setCustomSubject('');
      setStatusMsg({ text: 'Email recipients reset to organizational directory standards.', type: 'success' });
    }
  };

  const handleAddCustomAdvisor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdvisorName.trim() || !newAdvisorEmail.trim()) {
      setStatusMsg({ text: 'Please provide both Advisor Name and Email address.', type: 'error' });
      return;
    }
    const trimmedName = newAdvisorName.trim();
    const trimmedEmail = newAdvisorEmail.trim();
    const updated = [
      ...customAdvisors.filter((c) => c.name.toLowerCase() !== trimmedName.toLowerCase()),
      { name: trimmedName, email: trimmedEmail },
    ];
    setCustomAdvisors(updated);
    try {
      localStorage.setItem('advisors_custom_directory', JSON.stringify(updated));
    } catch {}
    setSelectedAdvisor(trimmedName);
    setToEmail(trimmedEmail);
    setNewAdvisorName('');
    setNewAdvisorEmail('');
    setShowAddAdvisorInline(false);
    setStatusMsg({
      text: `Manual advisor ${trimmedName} (${trimmedEmail}) added and selected.`,
      type: 'success',
    });
  };

  const handleResetFilters = () => {
    setSelectedAdvisor('ALL');
    setMarkerFilter('all');
    setFromDate('');
    setToDate('');
    setCustomSubject('');
    setStatusMsg(null);
  };

  // Compute Default Subject
  const defaultSubject = useMemo(() => {
    const datePart = fromDate || toDate ? ` · ${fromDate || 'Start'} to ${toDate || 'Present'}` : '';
    let categoryPart = '';
    if (markerFilter === '0') categoryPart = ' [FATALS ALONE]';
    else if (markerFilter === '5') categoryPart = ' [5 MARKS - Full Compliance]';
    else if (markerFilter === '4') categoryPart = ' [4 MARKS - Compliant]';

    const advLabel = selectedAdvisor === 'ALL' ? 'All Advisors' : (selectedAdvisor || 'Advisor');
    return `Pre-Order Quality Audit Scorecards${categoryPart} — ${advLabel}${datePart}`;
  }, [selectedAdvisor, fromDate, toDate, markerFilter]);

  const currentSubject = customSubject || defaultSubject;

  // Filtered Scorecards matching advisor + date range + marker filter
  const matchedScorecards = useMemo(() => {
    return scorecards.filter((sc) => {
      // Match advisor (unless ALL)
      if (selectedAdvisor && selectedAdvisor !== 'ALL') {
        const advisorMatch =
          (sc.caller_name || '').toLowerCase() === selectedAdvisor.toLowerCase() ||
          (sc.dealer || '').toLowerCase() === selectedAdvisor.toLowerCase();
        if (!advisorMatch) return false;
      }

      // Match Date Range
      const itemDate = sc.trade_date || sc.call_date || (sc.created_at ? sc.created_at.slice(0, 10) : '');
      if (fromDate && itemDate && itemDate < fromDate) return false;
      if (toDate && itemDate && itemDate > toDate) return false;

      // Match Marker Filter
      const isFatal =
        Boolean(sc.is_fatal) ||
        sc.score === 0 ||
        sc.q1_status === 'FAIL' ||
        sc.q2_status === 'FAIL' ||
        sc.q5_status === 'FAIL';

      if (markerFilter === '0') {
        if (!isFatal) return false;
      } else if (markerFilter === '4') {
        if (isFatal || sc.score !== 4) return false;
      } else if (markerFilter === '5') {
        if (isFatal || sc.score !== 5) return false;
      }

      return true;
    });
  }, [scorecards, selectedAdvisor, fromDate, toDate, markerFilter]);

  // Unique advisors represented in the filtered result
  const uniqueAdvisorsInFiltered = useMemo(() => {
    const set = new Set<string>();
    matchedScorecards.forEach((sc) => {
      const name = sc.caller_name || sc.dealer;
      if (name && name !== '—') set.add(name);
    });
    return Array.from(set);
  }, [matchedScorecards]);

  // Summary Metrics for the selection
  const totalCount = matchedScorecards.length;
  const passCount = matchedScorecards.filter((s) => !s.is_fatal && s.score >= 4).length;
  const fatalCount = matchedScorecards.filter((s) => s.is_fatal || s.score === 0).length;
  const avgScore =
    totalCount > 0
      ? (matchedScorecards.reduce((acc, s) => acc + (s.score || 0), 0) / totalCount).toFixed(1)
      : '0';

  const handleQuickDatePreset = (preset: 'today' | '7days' | '30days' | 'all') => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    }
  };

  const handleOneClickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvisor) {
      setStatusMsg({ text: 'Please select an advisor or choose "All Advisors".', type: 'error' });
      return;
    }

    if (totalCount === 0) {
      const markerLabel = markerFilter === 'all' ? '' : ` with marker filter ${markerFilter}`;
      setStatusMsg({
        text: `No scorecards found${selectedAdvisor === 'ALL' ? '' : ` for ${selectedAdvisor}`}${markerLabel} within the selected date range. Please adjust filters.`,
        type: 'error',
      });
      return;
    }

    setIsSending(true);
    setStatusMsg(null);

    try {
      if (selectedAdvisor !== 'ALL' && dispatchEngine === 'emailjs' && emailJsServiceId && emailJsTemplateId && emailJsPublicKey) {
        // Send via EmailJS
        const templateParams = {
          to_email: toEmail,
          cc_email: ccEmail,
          advisor_name: selectedAdvisor,
          subject: currentSubject,
          scorecard_count: totalCount,
          average_score: avgScore,
          date_range: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Present'}` : 'All dates',
          summary_text: `Dispatched ${totalCount} scorecards (${passCount} passed, ${fatalCount} fatal flags). Marker Filter: ${markerFilter}`,
        };

        await emailjs.send(emailJsServiceId, emailJsTemplateId, templateParams, emailJsPublicKey);

        setStatusMsg({
          text: `Successfully dispatched via EmailJS to ${toEmail} (CC: ${ccEmail || 'None'})!`,
          type: 'success',
        });
      } else {
        // Standard high-reliability backend SMTP dispatch
        const effectiveTo = (selectedAdvisor === 'ALL' && isManualEmailMode && toEmail.trim())
          ? toEmail.trim()
          : (selectedAdvisor === 'ALL' ? undefined : (toEmail || undefined));

        await onBulkSend({
          advisor: selectedAdvisor,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          subject: currentSubject,
          to: effectiveTo,
          cc: (selectedAdvisor === 'ALL' && !isManualEmailMode) ? undefined : (ccEmail || undefined),
          marker_filter: markerFilter !== 'all' ? markerFilter : undefined,
        });

        const targetDesc = selectedAdvisor === 'ALL'
          ? (isManualEmailMode && toEmail.trim() ? `to manual advisor mailbox (${toEmail})` : `across ${uniqueAdvisorsInFiltered.length} advisor(s)`)
          : `for ${selectedAdvisor} to ${toEmail}`;

        setStatusMsg({
          text: `Successfully dispatched ${totalCount} filtered scorecard(s) ${targetDesc}!`,
          type: 'success',
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        text: `Dispatch failed: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner - Liquid Glass Oceanic */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-teal-500/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-base font-bold text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 text-slate-950 shadow-md shadow-teal-500/20">
              <Mail className="w-4 h-4" />
            </span>
            <span>Advisor Scorecard Dispatch &amp; Categorization</span>
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Filter scorecards by advisor, date range, and marker score (0 / 4 / 5) with automatic organizational directory routing.
          </p>
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <span className="text-xs px-3.5 py-1.5 bg-teal-500/10 text-teal-300 font-bold rounded-xl border border-teal-500/30 flex items-center gap-1.5 backdrop-blur-md shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Advisor Routing Directory Enforced</span>
          </span>
        </div>
      </div>

      {/* 1-Click Dispatch Interactive Panel */}
      <div className="glass-panel rounded-2xl border border-teal-500/20 shadow-2xl overflow-hidden backdrop-blur-xl">
        <div className="bg-slate-950/80 p-4 text-white border-b border-teal-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>Configure Batch Dispatch &amp; Categorization Parameters</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Audit Standard · Regulatory Compliance v18.0
            </div>
          </div>
        </div>

        <form onSubmit={handleOneClickSend} className="p-6 space-y-6 text-xs">
          {/* Row 1: Advisor Selector & Marker Filter Categorization */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Advisor Selector (col-span-6) */}
            <div className="md:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-teal-400" />
                  <span>Select Advisor Name *</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddAdvisorInline(!showAddAdvisorInline)}
                    className="text-[11px] text-teal-300 hover:text-teal-200 font-bold flex items-center gap-1 cursor-pointer bg-teal-500/10 hover:bg-teal-500/20 px-2.5 py-1 rounded-lg border border-teal-500/30 transition-colors"
                    title="Add custom advisor email ID manually"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{showAddAdvisorInline ? 'Cancel' : '+ Add Advisor'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] text-slate-400 hover:text-slate-200 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset all filters"
                  >
                    <Filter className="w-3 h-3 text-slate-400" />
                    <span>Reset Filters</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetRouting}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset To and CC from directory matrix"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Sync Directory</span>
                  </button>
                </div>
              </div>

              {/* Inline Manual Advisor Addition Card */}
              {showAddAdvisorInline && (
                <div className="p-4 glass-inner border border-teal-500/30 rounded-xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-teal-400" />
                      <span>Add Advisor Email ID Manually</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddAdvisorInline(false)}
                      className="text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Advisor Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Vikram Malhotra"
                        value={newAdvisorName}
                        onChange={(e) => setNewAdvisorName(e.target.value)}
                        className="w-full px-3 py-1.5 glass-input rounded-xl text-xs font-medium placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Advisor Email ID</label>
                      <input
                        type="email"
                        placeholder="e.g. vikram.malhotra@company.com"
                        value={newAdvisorEmail}
                        onChange={(e) => setNewAdvisorEmail(e.target.value)}
                        className="w-full px-3 py-1.5 glass-input rounded-xl text-xs font-mono placeholder-slate-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddAdvisorInline(false)}
                      className="px-3 py-1.5 text-slate-400 hover:text-slate-200 glass-inner rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomAdvisor}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold rounded-xl text-xs cursor-pointer shadow-md transition-transform active:scale-95"
                    >
                      Save &amp; Select Advisor
                    </button>
                  </div>
                </div>
              )}

              <select
                value={selectedAdvisor}
                onChange={(e) => {
                  if (e.target.value === '__ADD_MANUAL__') {
                    setShowAddAdvisorInline(true);
                  } else {
                    setSelectedAdvisor(e.target.value);
                  }
                }}
                className="w-full px-3 py-2.5 glass-input rounded-xl text-xs font-semibold text-slate-100 cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-white">🌟 All Advisors ({scorecards.length} scorecards recorded)</option>
                <option value="__ADD_MANUAL__" className="font-bold text-teal-300 bg-slate-900">
                  ➕ + Add Manual Advisor Email ID...
                </option>
                {availableAdvisors.length > 0 ? (
                  availableAdvisors.map((adv) => {
                    const advCount = scorecards.filter(
                      (s) => (s.caller_name || '').toLowerCase() === adv.toLowerCase()
                    ).length;
                    const dirEntry = FUNDSINDIA_ADVISOR_DIRECTORY.find(
                      (d) => d.advisor_name.toLowerCase() === adv.toLowerCase()
                    );
                    const isCustom = customAdvisors.some(
                      (c) => c.name.toLowerCase() === adv.toLowerCase()
                    );
                    const dealerTag = dirEntry ? `[${dirEntry.dealer}] ` : isCustom ? '[Manual] ' : '';
                    return (
                      <option key={adv} value={adv} className="bg-slate-900 text-white">
                        {dealerTag}{adv} ({advCount} scorecards available)
                      </option>
                    );
                  })
                ) : (
                  <option value="Ashutosh" className="bg-slate-900 text-white">Ashutosh</option>
                )}
              </select>
            </div>

            {/* Marker / Score Filter Categorization (col-span-6) */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-teal-400" />
                <span>Scorecard Marker / Category Filter</span>
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMarkerFilter('all')}
                  className={`py-2 px-1.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all duration-200 ${
                    markerFilter === 'all'
                      ? 'bg-teal-400 text-slate-950 border-teal-300 shadow-[0_0_15px_rgba(20,184,166,0.35)]'
                      : 'glass-inner text-slate-300 border-teal-500/20 hover:bg-teal-500/10'
                  }`}
                >
                  All Markers
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('0')}
                  className={`py-2 px-1.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all duration-200 ${
                    markerFilter === '0'
                      ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
                      : 'glass-inner text-rose-300 border-rose-500/20 hover:bg-rose-500/15'
                  }`}
                  title="Filter scorecards with score 0 or fatal violations"
                >
                  0 Marks (Fatals)
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('4')}
                  className={`py-2 px-1.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all duration-200 ${
                    markerFilter === '4'
                      ? 'bg-blue-500 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                      : 'glass-inner text-blue-300 border-blue-500/20 hover:bg-blue-500/15'
                  }`}
                  title="Filter scorecards with 4 marks (Partial Execution / Compliant)"
                >
                  4 Marks
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('5')}
                  className={`py-2 px-1.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all duration-200 ${
                    markerFilter === '5'
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                      : 'glass-inner text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/15'
                  }`}
                  title="Filter scorecards with 5 marks (Perfect Pre-Order Compliance)"
                >
                  5 Marks
                </button>
              </div>
            </div>
          </div>

          {/* Conditional Routing Notification Banner */}
          {markerFilter === '0' ? (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Fatal Filter Active (0 Marks):</strong> CCs applied: <code className="font-mono font-bold bg-rose-900/60 px-1.5 py-0.5 rounded text-rose-200">{FATAL_CC_EMAIL}</code> is <strong>included in CC</strong> for fatal scorecards (0 marks).
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                Lead Supervisor In CC
              </span>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-teal-950/40 border border-teal-500/30 text-teal-200 text-xs flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>
                  <strong>Standard Routing ({markerFilter === 'all' ? 'All Scorecards' : `${markerFilter} Marks`}):</strong> Standard supervisory manager CCs applied. <code className="font-mono text-teal-300/80">{FATAL_CC_EMAIL}</code> is <strong>omitted</strong> (excluded for 4 & 5 marks).
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full">
                Supervisor Excluded
              </span>
            </div>
          )}

          {/* Row 2: Date Range Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* From Date */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>From Date (Optional)</span>
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-slate-100"
              />
            </div>

            {/* To Date */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>To Date (Optional)</span>
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-slate-100"
              />
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-teal-500/15 text-[11px]">
            <span className="text-slate-400 font-semibold">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('all')}
              className={`px-3 py-1 rounded-xl border font-medium cursor-pointer transition-colors ${
                !fromDate && !toDate
                  ? 'bg-teal-400 text-slate-950 font-bold border-teal-300 shadow-xs'
                  : 'glass-inner text-slate-300 border-teal-500/20 hover:bg-teal-500/15'
              }`}
            >
              All Recorded Dates
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('today')}
              className="px-3 py-1 glass-inner hover:bg-teal-500/15 text-slate-300 rounded-xl border border-teal-500/20 font-medium cursor-pointer transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('7days')}
              className="px-3 py-1 glass-inner hover:bg-teal-500/15 text-slate-300 rounded-xl border border-teal-500/20 font-medium cursor-pointer transition-colors"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('30days')}
              className="px-3 py-1 glass-inner hover:bg-teal-500/15 text-slate-300 rounded-xl border border-teal-500/20 font-medium cursor-pointer transition-colors"
            >
              Last 30 Days
            </button>
          </div>

          {/* Row 3: Target Email, CC, and Subject */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-teal-500/15">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-200 text-xs">
                  Advisor Email Address (To) *
                </label>
                {selectedAdvisor === 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isManualEmailMode;
                      setIsManualEmailMode(next);
                      if (next) {
                        setToEmail(manualEmailInput || '');
                      } else {
                        setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
                      }
                    }}
                    className="text-[11px] font-bold text-teal-300 hover:text-teal-200 flex items-center gap-1 cursor-pointer bg-teal-500/10 hover:bg-teal-500/20 px-2.5 py-0.5 rounded-lg border border-teal-500/30 transition-colors"
                  >
                    <Edit3 className="w-3 h-3 text-teal-400" />
                    <span>{isManualEmailMode ? 'Reset to Auto-Route' : '+ Enter Manual Advisor Email'}</span>
                  </button>
                )}
              </div>

              {selectedAdvisor === 'ALL' && !isManualEmailMode ? (
                <div>
                  <div className="w-full px-3 py-2 glass-inner rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-between border border-teal-500/20">
                    <span className="truncate">Individual Advisor Mailboxes (Auto-routed via directory)</span>
                    <span className="text-[10px] font-bold bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-md shrink-0 ml-2 border border-teal-500/30">Directory Auto</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span>Auto-routes each scorecard to its respective advisor email address from directory.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualEmailMode(true);
                        setToEmail(manualEmailInput || '');
                      }}
                      className="text-teal-300 hover:underline font-bold shrink-0 ml-2 cursor-pointer"
                    >
                      Override manually
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="email"
                    value={toEmail}
                    onChange={(e) => {
                      setToEmail(e.target.value);
                      if (selectedAdvisor === 'ALL') {
                        setManualEmailInput(e.target.value);
                      }
                    }}
                    placeholder="Enter manual advisor email ID (e.g. advisor.name@company.com)"
                    className="w-full px-3 py-2 glass-input border-2 border-teal-400 rounded-xl text-xs font-mono text-white focus:outline-hidden focus:ring-1 focus:ring-teal-400"
                    required
                  />
                  <div className="mt-1 text-[11px]">
                    {selectedAdvisor === 'ALL' ? (
                      <span className="text-teal-300 font-medium">
                        ⚡ <strong>Manual Override Active:</strong> All {matchedScorecards.length} filtered scorecards will be dispatched to <strong>{toEmail || 'this manual advisor email ID'}</strong>.
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Target recipient mailbox for {selectedAdvisor}. You can edit or enter any custom email ID.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-200 mb-1">
                CC Email Addresses (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="compliance@company.com"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono text-white placeholder-slate-500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Official supervisory managers from organizational directory.
              </span>
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-slate-200 mb-1">
                Email Subject Line *
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder={defaultSubject}
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-medium text-white placeholder-slate-500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Subject: <span className="font-semibold text-teal-300">{currentSubject}</span>
              </span>
            </div>
          </div>

          {/* Dispatch Engine: SMTP vs EmailJS Toggle */}
          <div className="p-3.5 glass-inner rounded-xl border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-200 text-xs">Dispatch Delivery Mode:</span>
              <div className="inline-flex rounded-xl border border-teal-500/30 p-0.5 bg-slate-950/80">
                <button
                  type="button"
                  onClick={() => setDispatchEngine('smtp')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    dispatchEngine === 'smtp' ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  High-Reliability SMTP
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchEngine('emailjs')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    dispatchEngine === 'emailjs' ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  EmailJS Client
                </button>
              </div>
            </div>

            {dispatchEngine === 'emailjs' && (
              <button
                type="button"
                onClick={() => setShowEmailJsConfig(!showEmailJsConfig)}
                className="text-[11px] text-teal-300 hover:text-teal-200 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-teal-400" />
                <span>{showEmailJsConfig ? 'Hide Config' : 'Configure EmailJS Keys'}</span>
              </button>
            )}
          </div>

          {dispatchEngine === 'emailjs' && showEmailJsConfig && (
            <div className="p-4 glass-inner rounded-xl border border-teal-500/30 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">EmailJS Service ID</label>
                <input
                  type="text"
                  value={emailJsServiceId}
                  onChange={(e) => setEmailJsServiceId(e.target.value)}
                  placeholder="service_xxx"
                  className="w-full px-3 py-1.5 glass-input rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">EmailJS Template ID</label>
                <input
                  type="text"
                  value={emailJsTemplateId}
                  onChange={(e) => setEmailJsTemplateId(e.target.value)}
                  placeholder="template_xxx"
                  className="w-full px-3 py-1.5 glass-input rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">EmailJS Public Key</label>
                <input
                  type="text"
                  value={emailJsPublicKey}
                  onChange={(e) => setEmailJsPublicKey(e.target.value)}
                  placeholder="Public Key"
                  className="w-full px-3 py-1.5 glass-input rounded-xl text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* Live Filter Selection Summary Card */}
          <div className="glass-inner p-4 rounded-xl border border-teal-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>Selected Scorecards Batch Overview</span>
              </h4>
              <div className="text-xs font-mono font-bold text-teal-300">
                {totalCount} Call Scorecard(s) Matching Criteria
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="glass-panel-subtle p-3 rounded-xl border border-teal-500/20 shadow-xs">
                <div className="text-[11px] text-slate-400 font-medium">Selected Advisor</div>
                <div className="font-bold text-white truncate mt-0.5">{selectedAdvisor || '—'}</div>
              </div>
              <div className="glass-panel-subtle p-3 rounded-xl border border-teal-500/20 shadow-xs">
                <div className="text-[11px] text-slate-400 font-medium">Date Scope &amp; Marker</div>
                <div className="font-bold text-white mt-0.5">
                  {markerFilter === 'all' ? 'All' : `${markerFilter} Marks`} · {fromDate || toDate ? `${fromDate || '—'} → ${toDate || '—'}` : 'All Dates'}
                </div>
              </div>
              <div className="glass-panel-subtle p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 shadow-xs">
                <div className="text-[11px] text-emerald-400 font-medium">Compliant Calls</div>
                <div className="font-bold text-emerald-300 text-sm mt-0.5">{passCount} / {totalCount}</div>
              </div>
              <div className="glass-panel-subtle p-3 rounded-xl border border-rose-500/20 bg-rose-950/20 shadow-xs">
                <div className="text-[11px] text-rose-400 font-medium">Fatal Violations</div>
                <div className="font-bold text-rose-300 text-sm mt-0.5">{fatalCount} ({avgScore} avg mark)</div>
              </div>
            </div>

            {/* List of included calls preview */}
            {matchedScorecards.length > 0 ? (
              <div className="max-h-48 overflow-y-auto border border-teal-500/20 rounded-xl glass-panel-subtle divide-y divide-teal-500/10 text-[11px]">
                {matchedScorecards.map((sc) => (
                  <div key={sc.id} className="p-2.5 flex items-center justify-between hover:bg-teal-500/10 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-400">#{sc.id}</span>
                      <span className="font-semibold text-white">{sc.client}</span>
                      <span className="text-slate-400">· {sc.trade_date || sc.call_date || 'Today'}</span>
                      {sc.dealer && (
                        <span className="text-[10px] font-mono text-slate-300 bg-slate-800/80 border border-teal-500/20 px-1.5 py-0.2 rounded">
                          {sc.dealer}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      {sc.is_fatal || sc.score === 0 ? (
                        <span className="text-rose-300 font-bold bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30 text-[10px]">
                          FATAL (0/5)
                        </span>
                      ) : sc.score === 5 ? (
                        <span className="text-emerald-300 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 text-[10px]">
                          5/5 MARKS (PERFECT)
                        </span>
                      ) : (
                        <span className="text-blue-300 font-bold bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30 text-[10px]">
                          {sc.score}/5 MARKS
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 glass-inner rounded-xl border border-teal-500/15">
                {selectedAdvisor === 'ALL'
                  ? `No scorecards found across all advisors with the current filter settings (${markerFilter === 'all' ? 'All Markers' : `Marker ${markerFilter}`}).`
                  : `No scorecards found for ${selectedAdvisor} with the current filter settings (${markerFilter === 'all' ? 'All Markers' : `Marker ${markerFilter}`}).`}
              </div>
            )}
          </div>

          {/* Action Trigger Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="text-[11px] text-slate-400">
              Dispatches an encrypted HTML audit report containing complete 5-mark tables &amp; verbatim evidence.
            </div>

            <button
              type="submit"
              disabled={isSending || isLoading || totalCount === 0}
              className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-500 hover:brightness-110 active:scale-95 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-[0_4px_20px_rgba(20,184,166,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2 border border-teal-300/40"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending
                  ? 'Dispatching Scorecards…'
                  : selectedAdvisor === 'ALL'
                  ? `⚡ Send All Filtered Mails (${totalCount} Scorecards across ${uniqueAdvisorsInFiltered.length} Advisors${markerFilter !== 'all' ? ` · ${markerFilter} Marks` : ''})`
                  : `⚡ Send All Filtered Mails (${totalCount} Scorecards to ${selectedAdvisor}${markerFilter !== 'all' ? ` · ${markerFilter} Marks` : ''})`}
              </span>
            </button>
          </div>
        </form>

        {/* Status Toast/Banner */}
        {statusMsg && (
          <div
            className={`p-4 border-t flex items-center gap-2.5 text-xs font-medium ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/60 border-rose-500/30 text-rose-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4.5 h-4.5 text-rose-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Live SMTP Diagnostic & Dispatch Verification Card */}
      <div className="glass-panel rounded-2xl border border-teal-500/20 shadow-xl p-5 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-500/15 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-500/10 text-teal-300 rounded-xl border border-teal-500/20">
              <Server className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Real SMTP Transport &amp; Delivery Verification</h3>
              <p className="text-xs text-slate-300">Test actual socket handshake or dispatch a live test email directly to any inbox.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>SMTP Ready</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Destination Test Recipient Email
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="e.g. audit.lead@company.com"
              className="w-full text-xs px-3 py-2.5 glass-input rounded-xl focus:border-teal-400 focus:outline-hidden font-mono text-white placeholder-slate-500"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              disabled={isTestingSmtp}
              onClick={async () => {
                setIsTestingSmtp(true);
                setSmtpResult(null);
                try {
                  const res = await api.testSmtpConnection();
                  setSmtpResult(res);
                } catch (err: unknown) {
                  setSmtpResult({ ok: false, message: `Handshake error: ${(err as Error).message}` });
                } finally {
                  setIsTestingSmtp(false);
                }
              }}
              className="w-full text-xs font-semibold py-2.5 px-3 glass-inner hover:bg-teal-500/15 text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-teal-500/25 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isTestingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" /> : <Zap className="w-3.5 h-3.5 text-teal-400" />}
              <span>{isTestingSmtp ? 'Verifying...' : 'Test Connection'}</span>
            </button>
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              disabled={isSendingTest || !testEmail}
              onClick={async () => {
                setIsSendingTest(true);
                setSmtpResult(null);
                try {
                  const res = await api.sendTestEmail({ to: testEmail });
                  setSmtpResult(res);
                } catch (err: unknown) {
                  setSmtpResult({ ok: false, message: `Dispatch error: ${(err as Error).message}` });
                } finally {
                  setIsSendingTest(false);
                }
              }}
              className="w-full text-xs font-bold py-2.5 px-3 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 border border-teal-300/40 cursor-pointer active:scale-95"
            >
              {isSendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{isSendingTest ? 'Dispatching...' : 'Send Live Test Email'}</span>
            </button>
          </div>
        </div>

        {smtpResult && (
          <div
            className={`mt-3 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 backdrop-blur-md ${
              smtpResult.ok
                ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/50 border-rose-500/30 text-rose-200'
            }`}
          >
            {smtpResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-mono text-[11px] leading-relaxed">
              {smtpResult.message}
            </div>
          </div>
        )}
      </div>

      {/* Mail Delivery History Table */}
      <div className="glass-panel rounded-2xl border border-teal-500/20 shadow-xl overflow-hidden backdrop-blur-xl">
        <div className="p-4 border-b border-teal-500/15 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-400" />
              <span>Dispatched Mail History ({mailHistory.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Immutable audit trail of all scorecard emails sent to advisors and CC recipients.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-teal-300 font-semibold border-b border-teal-500/20 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 text-teal-400">Sent Time</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Advisor</th>
                <th className="py-3 px-3 text-center">Scorecards</th>
                <th className="py-3 px-3">Recipient (To)</th>
                <th className="py-3 px-3">CC</th>
                <th className="py-3 px-3">Subject</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-500/10 text-slate-200">
              {mailHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No scorecard emails have been dispatched yet. Use the 1-Click dispatch panel above to send scorecards.
                  </td>
                </tr>
              ) : (
                mailHistory.map((m) => (
                  <tr key={m.id} className="hover:bg-teal-500/10 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                      {m.sent_at || m.created_at}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-teal-200 bg-teal-500/15 border border-teal-500/20 px-2 py-0.5 rounded-full text-[10px] uppercase font-mono">
                        {m.mail_type || 'single'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {m.caller_name || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-teal-300">
                      {m.scorecard_count}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {m.recipient_to}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                      {m.recipient_cc || '—'}
                    </td>
                    <td className="py-2.5 px-3 max-w-[220px] truncate font-medium text-slate-300" title={m.subject}>
                      {m.subject}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Sent</span>
                      </span>
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
