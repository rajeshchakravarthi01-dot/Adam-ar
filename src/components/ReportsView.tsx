import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Filter,
  Search,
  Award,
  Archive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  ShieldCheck,
  BarChart3,
  Users,
  Activity,
  ArrowUpRight,
  Info,
  RefreshCw,
  Clock,
  PieChart,
  Tag,
  AlertOctagon,
  FileCheck,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import type { ReportArchive } from '../types';
import { getStoredToken } from '../lib/api';

interface AnalyticsData {
  totalScorecards: number;
  avgScore: number;
  compliantCount: number;
  fatalCount: number;
  complianceRate: number;
  qStats: {
    q1: { pass: number; fail: number; review: number };
    q2: { pass: number; fail: number; review: number };
    q3: { pass: number; fail: number; review: number; cmpCount: number };
    q4: { pass: number; fail: number; review: number };
    q5: { pass: number; fail: number; review: number };
  };
  advisors: Array<{
    name: string;
    totalCalls: number;
    avgScore: number;
    passCount: number;
    fatalCount: number;
    complianceRate: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  dailyTrend: Array<{
    date: string;
    total: number;
    pass: number;
    fatal: number;
    avgScore: number;
  }>;
  callClassification?: {
    total: number;
    preOrder: number;
    regular: number;
    scrap: number;
    unclassified: number;
    preOrderPct: number;
    regularPct: number;
    scrapPct: number;
    avgDurationPreOrder: number;
    avgDurationRegular: number;
    avgDurationScrap: number;
  };
  parameterFailures?: Array<{
    parameter: string;
    fails: number;
    total: number;
    failRate: number;
    severity: string;
  }>;
}

interface ReportsViewProps {
  archives: ReportArchive[];
  isLoading: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ archives, isLoading }) => {
  const [period, setPeriod] = useState('');
  const [advisor, setAdvisor] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [advisorSearch, setAdvisorSearch] = useState('');

  const fetchAnalytics = async () => {
    setIsFetchingAnalytics(true);
    try {
      const token = getStoredToken();
      const res = await fetch('/api/reports/analytics', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsFetchingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (advisor) params.append('advisor', advisor);
      if (period) params.append('period', period);
      if (token) params.append('token', token);

      const url = `/api/reports/export?${params.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `auditeq-compliance-report-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert('Failed to generate export file. Please ensure scorecards exist.');
      }
    } catch (err: unknown) {
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive Summary
      const summaryData = [
        { Metric: 'Report Name', Value: 'AuditEQ Quality & Regulatory Compliance Audit' },
        { Metric: 'Generation Date', Value: new Date().toLocaleString() },
        { Metric: 'Audit Standard', Value: 'Pre-Order Confirmation Norms' },
        { Metric: 'Total Audited Orders', Value: analytics?.totalScorecards || 0 },
        { Metric: 'Overall Compliance Rate (%)', Value: `${analytics?.complianceRate || 0}%` },
        { Metric: 'Compliant Calls (Pass)', Value: analytics?.compliantCount || 0 },
        { Metric: 'Fatal Violations', Value: analytics?.fatalCount || 0 },
        { Metric: 'Average Audit Score', Value: analytics?.avgScore || 0 },
        { Metric: 'Pre-Order Identified Calls', Value: analytics?.callClassification?.preOrder || 0 },
        { Metric: 'Regular Market Calls', Value: analytics?.callClassification?.regular || 0 },
        { Metric: 'Scrap / Short Calls', Value: analytics?.callClassification?.scrap || 0 },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive_Summary');

      // Sheet 2: 5-Point Parameter Evaluation
      if (analytics?.parameterFailures) {
        const paramData = analytics.parameterFailures.map((p) => ({
          Parameter_Code: p.parameter,
          Question:
            p.parameter === 'Q1'
              ? 'Confirmation given in Registered / Authorised Number?'
              : p.parameter === 'Q2'
              ? 'Pre Order Confirmation is as per Regulatory Norms?'
              : p.parameter === 'Q3'
              ? 'Was not pre-order partial (Price / Qty confirmed)?'
              : p.parameter === 'Q4'
              ? 'Brokerage & Statutory Norms Disclosed'
              : 'Was not any Return Commitment or Guarantee given?',
          Severity: p.severity,
          Total_Audits: p.total,
          Failure_Count: p.fails,
          Failure_Rate_Pct: `${p.failRate}%`,
          Pass_Rate_Pct: `${100 - p.failRate}%`,
        }));
        const wsParams = XLSX.utils.json_to_sheet(paramData);
        XLSX.utils.book_append_sheet(wb, wsParams, 'Parameter_Norms');
      }

      // Sheet 3: Advisor Performance Matrix
      if (analytics?.advisors) {
        const advData = analytics.advisors.map((adv) => ({
          Advisor_Dealer_Name: adv.name,
          Total_Audited_Calls: adv.totalCalls,
          Average_Score: adv.avgScore,
          Compliant_Calls: adv.passCount,
          Fatal_Breaches: adv.fatalCount,
          Compliance_Rate_Pct: `${adv.complianceRate}%`,
          Risk_Category: adv.riskLevel,
        }));
        const wsAdv = XLSX.utils.json_to_sheet(advData);
        XLSX.utils.book_append_sheet(wb, wsAdv, 'Dealer_Scorecard');
      }

      // Sheet 4: Call Classification & Durations
      if (analytics?.callClassification) {
        const c = analytics.callClassification;
        const classData = [
          {
            Classification: 'Pre-Order Execution Call',
            Description: 'Stock name, UCC client code, price and quantity discussed/executed',
            Call_Count: c.preOrder,
            Pct_Distribution: `${c.preOrderPct}%`,
            Avg_Duration: formatSeconds(c.avgDurationPreOrder),
          },
          {
            Classification: 'Regular Advisory Call',
            Description: 'General market advisory, portfolio discussion, operations updates',
            Call_Count: c.regular,
            Pct_Distribution: `${c.regularPct}%`,
            Avg_Duration: formatSeconds(c.avgDurationRegular),
          },
          {
            Classification: 'Scrap / Unusable Call',
            Description: 'Duration < 6s, rings, automated IVR prompts, dead air',
            Call_Count: c.scrap,
            Pct_Distribution: `${c.scrapPct}%`,
            Avg_Duration: formatSeconds(c.avgDurationScrap),
          },
        ];
        const wsClass = XLSX.utils.json_to_sheet(classData);
        XLSX.utils.book_append_sheet(wb, wsClass, 'Call_Classification');
      }

      XLSX.writeFile(wb, `AuditEQ_Quality_Audit_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: unknown) {
      alert(`Excel export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPPT = async () => {
    setIsExporting(true);
    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      // Slide 1: Cover Slide
      const slide1 = pres.addSlide();
      slide1.background = { color: '0A0A0E' };
      slide1.addText('AuditEQ Voice Quality & Pre-Order Audit', {
        x: 0.8,
        y: 1.8,
        w: 8.5,
        fontSize: 28,
        bold: true,
        color: 'FBBF24',
        fontFace: 'Arial',
      });
      slide1.addText('Executive Quality & Regulatory Compliance Presentation', {
        x: 0.8,
        y: 2.8,
        w: 8.5,
        fontSize: 16,
        color: 'E5E5E5',
        fontFace: 'Arial',
      });
      slide1.addText(`Generated on: ${new Date().toLocaleDateString()} | Engine: ADAM-AR v1.1 Pro`, {
        x: 0.8,
        y: 3.6,
        w: 8.5,
        fontSize: 12,
        color: 'A3A3A3',
        fontFace: 'Arial',
      });

      // Slide 2: High Level KPI Metrics
      const slide2 = pres.addSlide();
      slide2.background = { color: 'FFFFFF' };
      slide2.addText('Executive Quality Summary', {
        x: 0.8,
        y: 0.6,
        fontSize: 22,
        bold: true,
        color: '0A0A0E',
      });
      slide2.addText('Key compliance metrics audited against trade execution logs', {
        x: 0.8,
        y: 1.1,
        fontSize: 12,
        color: '737373',
      });

      const kpiBoxes = [
        { title: 'Total Audited Orders', val: `${analytics?.totalScorecards || 0}`, sub: 'Calls cross-referenced' },
        { title: 'Overall Compliance Rate', val: `${analytics?.complianceRate || 0}%`, sub: 'SEBI Norms Adherence' },
        { title: 'Compliant Audits', val: `${analytics?.compliantCount || 0}`, sub: 'Zero Fatal Defects' },
        { title: 'Fatal Breaches', val: `${analytics?.fatalCount || 0}`, sub: 'Q1, Q2, Q5 Fatalities' },
      ];

      kpiBoxes.forEach((box, i) => {
        const xPos = 0.8 + i * 2.2;
        slide2.addShape(pres.ShapeType.rect, {
          x: xPos,
          y: 1.8,
          w: 2.0,
          h: 2.0,
          fill: { color: 'F8FAFC' },
          line: { color: 'E2E8F0', width: 1 },
        });
        slide2.addText(box.title, { x: xPos + 0.1, y: 2.0, w: 1.8, fontSize: 10, bold: true, color: '64748B' });
        slide2.addText(box.val, { x: xPos + 0.1, y: 2.5, w: 1.8, fontSize: 24, bold: true, color: '0F172A' });
        slide2.addText(box.sub, { x: xPos + 0.1, y: 3.2, w: 1.8, fontSize: 9, color: '94A3B8' });
      });

      // Slide 3: 5-Point Parameter Compliance
      const slide3 = pres.addSlide();
      slide3.background = { color: 'FFFFFF' };
      slide3.addText('5-Point Pre-Order Parameter Breakdown', {
        x: 0.8,
        y: 0.6,
        fontSize: 22,
        bold: true,
        color: '0A0A0E',
      });
      slide3.addText('Fatal & non-fatal question evaluation performance', {
        x: 0.8,
        y: 1.1,
        fontSize: 12,
        color: '737373',
      });

      const qRows: any[][] = [
        [
          { text: 'Code', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
          { text: 'Compliance Question', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
          { text: 'Norm Type', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
          { text: 'Fail Count', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
          { text: 'Pass Rate (%)', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
        ],
      ];

      (analytics?.parameterFailures || []).forEach((p) => {
        qRows.push([
          { text: p.parameter },
          {
            text:
              p.parameter === 'Q1'
                ? "Confirmation in Customer's Registered Number"
                : p.parameter === 'Q2'
                ? 'Pre-Order Confirmation as per Norms'
                : p.parameter === 'Q3'
                ? 'Pre-Order Partial (Price & Qty verification)'
                : p.parameter === 'Q4'
                ? 'Statutory Disclosures'
                : 'Zero Return Commitment or Guarantee',
          },
          { text: p.severity },
          { text: `${p.fails}` },
          { text: `${100 - p.failRate}%` },
        ]);
      });

      if (qRows.length > 1) {
        slide3.addTable(qRows, {
          x: 0.8,
          y: 1.7,
          w: 8.4,
          fontSize: 10,
          border: { pt: 0.5, color: 'E2E8F0' },
        });
      }

      // Slide 4: Call Category Distribution
      const slide4 = pres.addSlide();
      slide4.background = { color: 'FFFFFF' };
      slide4.addText('Call Categorization & Audio Efficiency', {
        x: 0.8,
        y: 0.6,
        fontSize: 22,
        bold: true,
        color: '0A0A0E',
      });
      slide4.addText('Classification across Pre-Order, Regular advisory, and Scrap calls', {
        x: 0.8,
        y: 1.1,
        fontSize: 12,
        color: '737373',
      });

      if (analytics?.callClassification) {
        const cc = analytics.callClassification;
        const catRows: any[][] = [
          [
            { text: 'Category', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
            { text: 'Volume', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
            { text: '% Distribution', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
            { text: 'Average Duration', options: { bold: true, fill: { color: '0A0A0E' }, color: 'FFFFFF' } },
          ],
          [{ text: 'Pre-Order Order Calls' }, { text: `${cc.preOrder}` }, { text: `${cc.preOrderPct}%` }, { text: formatSeconds(cc.avgDurationPreOrder) }],
          [{ text: 'Regular Advisory Calls' }, { text: `${cc.regular}` }, { text: `${cc.regularPct}%` }, { text: formatSeconds(cc.avgDurationRegular) }],
          [{ text: 'Scrap (<6s / IVR / Rings)' }, { text: `${cc.scrap}` }, { text: `${cc.scrapPct}%` }, { text: formatSeconds(cc.avgDurationScrap) }],
        ];
        slide4.addTable(catRows, {
          x: 0.8,
          y: 1.8,
          w: 8.4,
          fontSize: 11,
          border: { pt: 0.5, color: 'CBD5E1' },
        });
      }

      await pres.writeFile({ fileName: `AuditEQ_Compliance_Presentation_${new Date().toISOString().slice(0, 10)}.pptx` });
    } catch (err: unknown) {
      alert(`PowerPoint export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const total = analytics?.totalScorecards || 0;
  const qStats = analytics?.qStats;
  const classification = analytics?.callClassification;
  const paramFailures = analytics?.parameterFailures;

  const calculatePct = (val: number, tot: number) => {
    if (!tot || tot === 0) return 0;
    return Math.round((val / tot) * 100);
  };

  const filteredAdvisors = (analytics?.advisors || []).filter((adv) =>
    adv.name.toLowerCase().includes(advisorSearch.toLowerCase())
  );

  const formatSeconds = (sec?: number) => {
    if (!sec || sec <= 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Reports Header Banner - Liquid Glass */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <BarChart3 className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white tracking-tight">Executive Quality &amp; Call Analytics</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              SEBI Framework v1.1
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Statistical audit breakdown: distributions, parameter rates, risk matrix, and trajectory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={isFetchingAnalytics}
            className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-teal-500/20 transition-all cursor-pointer"
            title="Refresh analytics metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isFetchingAnalytics ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download formatted multi-sheet Excel report"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isExporting ? 'Generating...' : 'Excel (.XLSX)'}</span>
          </button>

          <button
            onClick={handleExportPPT}
            disabled={isExporting}
            className="px-3.5 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download executive PowerPoint presentation deck"
          >
            <FileText className="w-3.5 h-3.5 text-teal-300" />
            <span>{isExporting ? 'Generating...' : 'PPT (.PPTX)'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 text-teal-300 border border-teal-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Export raw CSV data"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Audits */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Audited Orders</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{total}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Reconciled against official trade books
          </div>
        </div>

        {/* Overall Compliance Rate */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Compliance Rate</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {analytics?.complianceRate ?? 0}%
          </div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            {analytics?.compliantCount || 0} compliant of {total}
          </div>
        </div>

        {/* Fatal Non-Compliance */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Fatal Violations</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {analytics?.fatalCount || 0}
          </div>
          <div className="text-[11px] text-rose-400 font-medium mt-1">
            {total > 0 ? Math.round(((analytics?.fatalCount || 0) / total) * 100) : 0}% failure rate
          </div>
        </div>

        {/* Average Audit Score */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Quality Rating</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-1">
            <span>{analytics?.avgScore ?? 0}</span>
            <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Regulatory target threshold &ge; 4.0
          </div>
        </div>
      </div>

      {/* Call Categorization & Ingestion Breakdown Card */}
      {classification && (
        <div className="glass-panel p-5 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-400" />
                <span>Call Volume &amp; Ingestion Spectrum</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Breakdown of {classification.total} imported recordings across order, advisory, and scrap calls
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-teal-300 bg-teal-950/80 px-3 py-1 rounded-full border border-teal-500/30">
              Total Ingested: {classification.total}
            </span>
          </div>

          {/* Categorization Visual Bar */}
          <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex border border-teal-500/20">
            <div
              style={{ width: `${classification.preOrderPct}%` }}
              className="bg-teal-400 transition-all shadow-[0_0_8px_rgba(45,212,191,0.5)]"
              title={`Pre-Order Calls: ${classification.preOrder} (${classification.preOrderPct}%)`}
            />
            <div
              style={{ width: `${classification.regularPct}%` }}
              className="bg-slate-600 transition-all"
              title={`Regular Advisory Calls: ${classification.regular} (${classification.regularPct}%)`}
            />
            <div
              style={{ width: `${classification.scrapPct}%` }}
              className="bg-rose-500 transition-all shadow-[0_0_8px_rgba(244,63,94,0.5)]"
              title={`Scrap Calls (<=6s): ${classification.scrap} (${classification.scrapPct}%)`}
            />
          </div>

          {/* 3 Detailed Categorization Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Pre-Order */}
            <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-950/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)]" />
                  <span>Pre-Order Calls</span>
                </span>
                <span className="text-xs font-extrabold text-teal-300 font-mono">
                  {classification.preOrder} ({classification.preOrderPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Audited for client identity, script name, quantity, and price confirmation.
              </p>
              <div className="text-[11px] text-teal-300 font-semibold flex items-center gap-1 pt-1 border-t border-teal-500/20">
                <Clock className="w-3 h-3 text-teal-400" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationPreOrder)}</span>
              </div>
            </div>

            {/* Regular */}
            <div className="p-3.5 rounded-xl border border-slate-700 bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span>Regular Advisory Calls</span>
                </span>
                <span className="text-xs font-extrabold text-slate-300 font-mono">
                  {classification.regular} ({classification.regularPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                General recommendations and portfolio discussions with no trade instruction.
              </p>
              <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 pt-1 border-t border-slate-700/60">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationRegular)}</span>
              </div>
            </div>

            {/* Scrap */}
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                  <span>Scrap Calls (&le; 6s)</span>
                </span>
                <span className="text-xs font-extrabold text-rose-300 font-mono">
                  {classification.scrap} ({classification.scrapPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Voicemails, ringing timeouts, and brief disconnects under 6 seconds.
              </p>
              <div className="text-[11px] text-rose-300 font-semibold flex items-center gap-1 pt-1 border-t border-rose-500/20">
                <Clock className="w-3 h-3 text-rose-400" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationScrap)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5-Point Parameter Failure Pareto Section */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-teal-400" />
            <span>Audit Standard 5-Point Parameter Evaluation</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Pass / fail audit breakdown across mandatory checkpoints
          </p>
        </div>

        {qStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Q1 */}
            <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Q1: CLI Match</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Mandate: Call received on registered client mobile number.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                <span className="text-emerald-400">Pass: {qStats.q1.pass} ({calculatePct(qStats.q1.pass, total)}%)</span>
                <span className="text-rose-400 font-bold">Fail: {qStats.q1.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q1.pass, total)}%` }} className="bg-emerald-400" />
                <div style={{ width: `${calculatePct(qStats.q1.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>

            {/* Q2 */}
            <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Q2: Client UCC</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Mandate: Unique Client Code explicitly confirmed before order.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                <span className="text-emerald-400">Pass: {qStats.q2.pass} ({calculatePct(qStats.q2.pass, total)}%)</span>
                <span className="text-rose-400 font-bold">Fail: {qStats.q2.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q2.pass, total)}%` }} className="bg-emerald-400" />
                <div style={{ width: `${calculatePct(qStats.q2.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>

            {/* Q3 */}
            <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Q3: Script / Qty / Price</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  1 PT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Stock name, quantity, and price/CMP confirmed.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                <span className="text-emerald-400">Pass: {qStats.q3.pass} ({calculatePct(qStats.q3.pass, total)}%)</span>
                <span className="text-teal-400 font-bold">Fail: {qStats.q3.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q3.pass, total)}%` }} className="bg-emerald-400" />
                <div style={{ width: `${calculatePct(qStats.q3.fail, total)}%` }} className="bg-teal-400" />
              </div>
            </div>

            {/* Q5 */}
            <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Q5: Conduct Standard</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Code of Conduct: No false promises or assured return guarantees.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                <span className="text-emerald-400">Pass: {qStats.q5.pass} ({calculatePct(qStats.q5.pass, total)}%)</span>
                <span className="text-rose-400 font-bold">Fail: {qStats.q5.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q5.pass, total)}%` }} className="bg-emerald-400" />
                <div style={{ width: `${calculatePct(qStats.q5.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advisor Performance & Risk Matrix */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              <span>Advisor Compliance &amp; Risk Ranking</span>
            </h3>
            <p className="text-xs text-slate-400">Rollup by advisor name with automated risk rating</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={advisorSearch}
              onChange={(e) => setAdvisorSearch(e.target.value)}
              placeholder="Filter advisors…"
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-hidden focus:border-teal-400 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 text-slate-300 font-semibold border-b border-teal-500/20 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5">Advisor / Caller</th>
                <th className="py-3 px-3.5 text-center">Audited Calls</th>
                <th className="py-3 px-3.5 text-center">Avg Rating (0-5)</th>
                <th className="py-3 px-3.5 text-center">Compliant</th>
                <th className="py-3 px-3.5 text-center">Violations</th>
                <th className="py-3 px-3.5 text-center">Compliance Rate</th>
                <th className="py-3 px-3.5 text-right">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-500/10 text-slate-300">
              {filteredAdvisors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No advisor audit data found.
                  </td>
                </tr>
              ) : (
                filteredAdvisors.map((adv) => (
                  <tr key={adv.name} className="hover:bg-teal-500/5 transition-colors">
                    <td className="py-3 px-3.5 font-semibold text-white">{adv.name}</td>
                    <td className="py-3 px-3.5 text-center font-mono">{adv.totalCalls}</td>
                    <td className="py-3 px-3.5 text-center font-bold">
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                          adv.avgScore >= 4.5
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : adv.avgScore >= 3.5
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {adv.avgScore} / 5
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono text-emerald-400 font-bold">{adv.passCount}</td>
                    <td className="py-3 px-3.5 text-center font-mono text-rose-400 font-bold">{adv.fatalCount}</td>
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-white">{adv.complianceRate}%</td>
                    <td className="py-3 px-3.5 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          adv.riskLevel === 'HIGH'
                            ? 'bg-rose-500 text-slate-950 font-black'
                            : adv.riskLevel === 'MEDIUM'
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : 'bg-emerald-500 text-slate-950 font-black'
                        }`}
                      >
                        {adv.riskLevel} RISK
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
