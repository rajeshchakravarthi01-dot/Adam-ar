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
  // Derive unique advisor list from directory + scorecards
  const availableAdvisors = useMemo(() => {
    const list = new Set<string>();
    // Add directory advisors first
    FUNDSINDIA_ADVISOR_DIRECTORY.forEach((entry) => list.add(entry.advisor_name));
    // Add from props
    advisors.forEach((a) => a && list.add(a));
    // Add from scorecards
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') list.add(s.caller_name);
    });
    return Array.from(list).filter(Boolean);
  }, [advisors, scorecards]);

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
  const [testEmail, setTestEmail] = useState<string>('ashutosh.kumar@fundsindia.com');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Re-sync routing whenever advisor or marker filter changes
  useEffect(() => {
    if (selectedAdvisor === 'ALL') {
      const isFatalAlone = markerFilter === '0';
      setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
      setCcEmail(isFatalAlone ? `compliance@fundsindia.com, ${FATAL_CC_EMAIL}` : 'compliance@fundsindia.com');
    } else if (selectedAdvisor) {
      const isFatalAlone = markerFilter === '0';
      const routing = getAdvisorEmailRouting({
        advisorName: selectedAdvisor,
        isFatalAlone,
      });
      setToEmail(routing.to);
      setCcEmail(routing.cc);
    }
  }, [selectedAdvisor, markerFilter]);

  const handleResetRouting = () => {
    if (selectedAdvisor === 'ALL') {
      const isFatalAlone = markerFilter === '0';
      setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
      setCcEmail(isFatalAlone ? `compliance@fundsindia.com, ${FATAL_CC_EMAIL}` : 'compliance@fundsindia.com');
      setCustomSubject('');
      setStatusMsg({ text: 'Email recipients reset to FundsIndia directory standards.', type: 'success' });
    } else if (selectedAdvisor) {
      const isFatalAlone = markerFilter === '0';
      const routing = getAdvisorEmailRouting({
        advisorName: selectedAdvisor,
        isFatalAlone,
      });
      setToEmail(routing.to);
      setCcEmail(routing.cc);
      setCustomSubject('');
      setStatusMsg({ text: 'Email recipients reset to FundsIndia directory standards.', type: 'success' });
    }
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
        await onBulkSend({
          advisor: selectedAdvisor,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          subject: currentSubject,
          to: selectedAdvisor === 'ALL' ? undefined : (toEmail || undefined),
          cc: selectedAdvisor === 'ALL' ? undefined : (ccEmail || undefined),
          marker_filter: markerFilter !== 'all' ? markerFilter : undefined,
        });

        const targetDesc = selectedAdvisor === 'ALL'
          ? `across ${uniqueAdvisorsInFiltered.length} advisor(s)`
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
      {/* Top Banner - Classy Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-black">
              <Mail className="w-4 h-4" />
            </span>
            <span>Advisor Scorecard Dispatch &amp; Categorization</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Filter scorecards by advisor, date range, and marker score (0 / 4 / 5) with automatic FundsIndia directory routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 bg-amber-400/10 text-amber-900 font-bold rounded-lg border border-amber-400/30 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>FundsIndia Routing Directory Enforced</span>
          </span>
        </div>
      </div>

      {/* 1-Click Dispatch Interactive Panel */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="bg-[#111115] p-4 text-white border-b border-neutral-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Configure Batch Dispatch &amp; Categorization Parameters</span>
            </div>
            <div className="text-xs text-neutral-400 font-mono">
              Audit Standard · FundsIndia SEBI Compliance v18.0
            </div>
          </div>
        </div>

        <form onSubmit={handleOneClickSend} className="p-6 space-y-6 text-xs">
          {/* Row 1: Advisor Selector & Marker Filter Categorization */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Advisor Selector (col-span-6) */}
            <div className="md:col-span-6 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-500" />
                  <span>Select Advisor Name *</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] text-neutral-600 hover:text-neutral-900 font-semibold flex items-center gap-1 cursor-pointer"
                    title="Reset all filters to defaults"
                  >
                    <Filter className="w-3 h-3 text-neutral-400" />
                    <span>Reset Filters</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetRouting}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1 cursor-pointer"
                    title="Reset To and CC from directory matrix"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Sync Directory</span>
                  </button>
                </div>
              </div>
              <select
                value={selectedAdvisor}
                onChange={(e) => setSelectedAdvisor(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              >
                <option value="ALL">🌟 All Advisors ({scorecards.length} scorecards recorded)</option>
                {availableAdvisors.length > 0 ? (
                  availableAdvisors.map((adv) => {
                    const advCount = scorecards.filter(
                      (s) => (s.caller_name || '').toLowerCase() === adv.toLowerCase()
                    ).length;
                    const dirEntry = FUNDSINDIA_ADVISOR_DIRECTORY.find(
                      (d) => d.advisor_name.toLowerCase() === adv.toLowerCase()
                    );
                    const dealerTag = dirEntry ? `[${dirEntry.dealer}] ` : '';
                    return (
                      <option key={adv} value={adv}>
                        {dealerTag}{adv} ({advCount} scorecards available)
                      </option>
                    );
                  })
                ) : (
                  <option value="Ashutosh">Ashutosh (Default)</option>
                )}
              </select>
            </div>

            {/* Marker / Score Filter Categorization (col-span-6) */}
            <div className="md:col-span-6 space-y-1.5">
              <label className="font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-500" />
                <span>Scorecard Marker / Category Filter</span>
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMarkerFilter('all')}
                  className={`py-2 px-1.5 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                    markerFilter === 'all'
                      ? 'bg-neutral-900 text-amber-400 border-neutral-900 shadow-xs'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  All Markers
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('0')}
                  className={`py-2 px-1.5 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                    markerFilter === '0'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                  title="Filter scorecards with score 0 or fatal violations"
                >
                  0 Marks (Fatals)
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('4')}
                  className={`py-2 px-1.5 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                    markerFilter === '4'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                  title="Filter scorecards with 4 marks (Partial Execution / Compliant)"
                >
                  4 Marks
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerFilter('5')}
                  className={`py-2 px-1.5 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                    markerFilter === '5'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title="Filter scorecards with 5 marks (Perfect Pre-Order Compliance)"
                >
                  5 Marks
                </button>
              </div>
            </div>
          </div>

          {/* Sambath S Conditional Routing Notification Banner */}
          {markerFilter === '0' ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Fatal Filter Active (0 Marks):</strong> <code className="font-mono font-bold bg-rose-100 px-1 py-0.5 rounded text-rose-900">{FATAL_CC_EMAIL}</code> is <strong>included in CC</strong> per FundsIndia compliance policy.
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-900 px-2 py-0.5 rounded">
                Sambath S In CC
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Standard Routing ({markerFilter === 'all' ? 'All Scorecards' : `${markerFilter} Marks`}):</strong> Standard supervisory manager CCs applied. <code className="font-mono text-neutral-600">{FATAL_CC_EMAIL}</code> is <strong>omitted</strong>.
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                Sambath S Excluded
              </span>
            </div>
          )}

          {/* Row 2: Date Range Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* From Date */}
            <div className="space-y-1.5">
              <label className="block font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                <span>From Date (Optional)</span>
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>

            {/* To Date */}
            <div className="space-y-1.5">
              <label className="block font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                <span>To Date (Optional)</span>
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-200 text-[11px]">
            <span className="text-neutral-500 font-semibold">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('all')}
              className={`px-3 py-1 rounded-md border font-medium cursor-pointer transition-colors ${
                !fromDate && !toDate
                  ? 'bg-black text-amber-400 border-black'
                  : 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200'
              }`}
            >
              All Recorded Dates
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('today')}
              className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md border border-neutral-200 font-medium cursor-pointer transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('7days')}
              className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md border border-neutral-200 font-medium cursor-pointer transition-colors"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickDatePreset('30days')}
              className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md border border-neutral-200 font-medium cursor-pointer transition-colors"
            >
              Last 30 Days
            </button>
          </div>

          {/* Row 3: Target Email, CC, and Subject */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-neutral-200">
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                Advisor Email Address (To) *
              </label>
              <input
                type={selectedAdvisor === 'ALL' ? 'text' : 'email'}
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                disabled={selectedAdvisor === 'ALL'}
                placeholder="advisor@fundsindia.com"
                className={`w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400 ${
                  selectedAdvisor === 'ALL' ? 'bg-neutral-100 text-neutral-600 cursor-not-allowed' : 'bg-neutral-50'
                }`}
                required
              />
              <span className="text-[11px] text-neutral-500 mt-0.5 block">
                {selectedAdvisor === 'ALL'
                  ? 'Auto-routes each scorecard to its respective advisor email address from the FundsIndia directory.'
                  : `Target recipient mailbox for ${selectedAdvisor}.`}
              </span>
            </div>

            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                CC Email Addresses (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="compliance@fundsindia.com"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400"
              />
              <span className="text-[11px] text-neutral-500 mt-0.5 block">
                Official supervisory managers from FundsIndia directory.
              </span>
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-neutral-800 mb-1">
                Email Subject Line *
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder={defaultSubject}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium text-neutral-900 focus:outline-hidden focus:border-amber-400"
              />
              <span className="text-[11px] text-neutral-500 mt-0.5 block">
                Subject: <span className="font-semibold text-neutral-900">{currentSubject}</span>
              </span>
            </div>
          </div>

          {/* Dispatch Engine: SMTP vs EmailJS Toggle */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-bold text-neutral-800 text-xs">Dispatch Delivery Mode:</span>
              <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 bg-white">
                <button
                  type="button"
                  onClick={() => setDispatchEngine('smtp')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    dispatchEngine === 'smtp' ? 'bg-black text-amber-400' : 'text-neutral-600 hover:text-black'
                  }`}
                >
                  High-Reliability SMTP
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchEngine('emailjs')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    dispatchEngine === 'emailjs' ? 'bg-black text-amber-400' : 'text-neutral-600 hover:text-black'
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
                className="text-[11px] text-neutral-700 hover:text-black font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-amber-500" />
                <span>{showEmailJsConfig ? 'Hide Config' : 'Configure EmailJS Keys'}</span>
              </button>
            )}
          </div>

          {dispatchEngine === 'emailjs' && showEmailJsConfig && (
            <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">EmailJS Service ID</label>
                <input
                  type="text"
                  value={emailJsServiceId}
                  onChange={(e) => setEmailJsServiceId(e.target.value)}
                  placeholder="service_xxx"
                  className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">EmailJS Template ID</label>
                <input
                  type="text"
                  value={emailJsTemplateId}
                  onChange={(e) => setEmailJsTemplateId(e.target.value)}
                  placeholder="template_xxx"
                  className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">EmailJS Public Key</label>
                <input
                  type="text"
                  value={emailJsPublicKey}
                  onChange={(e) => setEmailJsPublicKey(e.target.value)}
                  placeholder="Public Key"
                  className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* Live Filter Selection Summary Card */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Selected Scorecards Batch Overview</span>
              </h4>
              <div className="text-xs font-mono font-bold text-neutral-900">
                {totalCount} Call Scorecard(s) Matching Criteria
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
                <div className="text-[11px] text-neutral-500 font-medium">Selected Advisor</div>
                <div className="font-bold text-neutral-900 truncate mt-0.5">{selectedAdvisor || '—'}</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
                <div className="text-[11px] text-neutral-500 font-medium">Date Scope &amp; Marker</div>
                <div className="font-bold text-neutral-900 mt-0.5">
                  {markerFilter === 'all' ? 'All' : `${markerFilter} Marks`} · {fromDate || toDate ? `${fromDate || '—'} → ${toDate || '—'}` : 'All Dates'}
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-2xs">
                <div className="text-[11px] text-emerald-700 font-medium">Compliant Calls</div>
                <div className="font-bold text-emerald-900 text-sm mt-0.5">{passCount} / {totalCount}</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-rose-200 bg-rose-50/50 shadow-2xs">
                <div className="text-[11px] text-rose-700 font-medium">Fatal Violations</div>
                <div className="font-bold text-rose-900 text-sm mt-0.5">{fatalCount} ({avgScore} avg mark)</div>
              </div>
            </div>

            {/* List of included calls preview */}
            {matchedScorecards.length > 0 ? (
              <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg bg-white divide-y divide-neutral-100 text-[11px]">
                {matchedScorecards.map((sc) => (
                  <div key={sc.id} className="p-2.5 flex items-center justify-between hover:bg-neutral-50">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-600">#{sc.id}</span>
                      <span className="font-semibold text-neutral-900">{sc.client}</span>
                      <span className="text-neutral-500">· {sc.trade_date || sc.call_date || 'Today'}</span>
                      {sc.dealer && (
                        <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.2 rounded">
                          {sc.dealer}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      {sc.is_fatal || sc.score === 0 ? (
                        <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[10px]">
                          FATAL (0/5)
                        </span>
                      ) : sc.score === 5 ? (
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                          5/5 MARKS (PERFECT)
                        </span>
                      ) : (
                        <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                          {sc.score}/5 MARKS
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-neutral-400 bg-white rounded-lg border border-neutral-200">
                {selectedAdvisor === 'ALL'
                  ? `No scorecards found across all advisors with the current filter settings (${markerFilter === 'all' ? 'All Markers' : `Marker ${markerFilter}`}).`
                  : `No scorecards found for ${selectedAdvisor} with the current filter settings (${markerFilter === 'all' ? 'All Markers' : `Marker ${markerFilter}`}).`}
              </div>
            )}
          </div>

          {/* Action Trigger Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="text-[11px] text-neutral-500">
              Dispatches an encrypted HTML audit report containing complete 5-mark tables &amp; verbatim evidence.
            </div>

            <button
              type="submit"
              disabled={isSending || isLoading || totalCount === 0}
              className="w-full sm:w-auto px-7 py-3 bg-black hover:bg-neutral-900 disabled:opacity-50 text-amber-400 font-bold rounded-xl text-xs shadow-md transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-amber-400/30"
            >
              <Send className="w-4 h-4 text-amber-400" />
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
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Live SMTP Diagnostic & Dispatch Verification Card */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-100 text-black rounded-lg">
              <Server className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Real SMTP Transport &amp; Delivery Verification</h3>
              <p className="text-xs text-neutral-500">Test actual socket handshake or dispatch a live test email directly to any inbox.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SMTP Ready</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Destination Test Recipient Email
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="e.g. ashutosh.kumar@fundsindia.com"
              className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:border-amber-400 focus:outline-none font-mono"
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
              className="w-full text-xs font-semibold py-2 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-neutral-300 disabled:opacity-50 cursor-pointer"
            >
              {isTestingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
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
              className="w-full text-xs font-bold py-2 px-3 bg-black hover:bg-neutral-900 text-amber-400 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 border border-amber-400/30 cursor-pointer"
            >
              {isSendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
              <span>{isSendingTest ? 'Dispatching...' : 'Send Live Test Email'}</span>
            </button>
          </div>
        </div>

        {smtpResult && (
          <div
            className={`mt-3 p-3 rounded-lg border text-xs flex items-start gap-2 ${
              smtpResult.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {smtpResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-mono text-[11px] leading-relaxed">
              {smtpResult.message}
            </div>
          </div>
        )}
      </div>

      {/* Mail Delivery History Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Dispatched Mail History ({mailHistory.length})</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Immutable audit trail of all scorecard emails sent to advisors and CC recipients.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 text-amber-400">Sent Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Advisor</th>
                <th className="py-2.5 px-3 text-center">Scorecards</th>
                <th className="py-2.5 px-3">Recipient (To)</th>
                <th className="py-2.5 px-3">CC</th>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {mailHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No scorecard emails have been dispatched yet. Use the 1-Click dispatch panel above to send scorecards.
                  </td>
                </tr>
              ) : (
                mailHistory.map((m) => (
                  <tr key={m.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-neutral-500 text-[11px]">
                      {m.sent_at || m.created_at}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                        {m.mail_type || 'single'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-neutral-900">
                      {m.caller_name || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-neutral-900">
                      {m.scorecard_count}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-800">
                      {m.recipient_to}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-500 text-[11px]">
                      {m.recipient_cc || '—'}
                    </td>
                    <td className="py-2.5 px-3 max-w-[220px] truncate font-medium text-neutral-700" title={m.subject}>
                      {m.subject}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
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
