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
        { Metric: 'Report Name', Value: 'FundsIndia Quality & Regulatory Compliance Audit' },
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
            Description: 'Duration < 8s, rings, automated IVR prompts, dead air',
            Call_Count: c.scrap,
            Pct_Distribution: `${c.scrapPct}%`,
            Avg_Duration: formatSeconds(c.avgDurationScrap),
          },
        ];
        const wsClass = XLSX.utils.json_to_sheet(classData);
        XLSX.utils.book_append_sheet(wb, wsClass, 'Call_Classification');
      }

      XLSX.writeFile(wb, `FundsIndia_Quality_Audit_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      slide1.addText('FundsIndia Voice Quality & Pre-Order Audit', {
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
      slide1.addText(`Generated on: ${new Date().toLocaleDateString()} | Engine: ADAM-AR v4.3 Pro`, {
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
          [{ text: 'Scrap (<8s / IVR / Rings)' }, { text: `${cc.scrap}` }, { text: `${cc.scrapPct}%` }, { text: formatSeconds(cc.avgDurationScrap) }],
        ];
        slide4.addTable(catRows, {
          x: 0.8,
          y: 1.8,
          w: 8.4,
          fontSize: 11,
          border: { pt: 0.5, color: 'CBD5E1' },
        });
      }

      await pres.writeFile({ fileName: `FundsIndia_Compliance_Presentation_${new Date().toISOString().slice(0, 10)}.pptx` });
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
      {/* Reports Header Banner - Classy Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-black">
              <BarChart3 className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-neutral-900">Executive Quality &amp; Call Analytics</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 border border-neutral-200">
              Audit Standard Norms
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Deep statistical audit breakdown: Call categorization distributions, 5-point parameter failure rates, dealer risk matrix, and daily quality trajectory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={isFetchingAnalytics}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-neutral-200 transition-colors cursor-pointer"
            title="Refresh analytics metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingAnalytics ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Download formatted multi-sheet Excel report"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span>{isExporting ? 'Generating...' : 'Export Excel (.XLSX)'}</span>
          </button>

          <button
            onClick={handleExportPPT}
            disabled={isExporting}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-amber-400 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border border-neutral-700"
            title="Download executive PowerPoint presentation deck"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>{isExporting ? 'Generating...' : 'Export PPT (.PPTX)'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Export raw CSV data"
          >
            <Download className="w-3.5 h-3.5 text-black" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Audits */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span className="font-semibold text-neutral-700">Total Audited Orders</span>
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-neutral-900">{total}</div>
          <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
            <span>Pre-order calls audited against trade books</span>
          </div>
        </div>

        {/* Overall Compliance Rate */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span className="font-semibold text-neutral-700">Audit Compliance Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900">
            {analytics?.complianceRate ?? 0}%
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">
            {analytics?.compliantCount || 0} compliant out of {total}
          </div>
        </div>

        {/* Fatal Non-Compliance */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span className="font-semibold text-neutral-700">Fatal Violations</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900">
            {analytics?.fatalCount || 0}
          </div>
          <div className="text-[11px] text-rose-700 font-medium mt-1">
            {total > 0 ? Math.round(((analytics?.fatalCount || 0) / total) * 100) : 0}% of all audited orders
          </div>
        </div>

        {/* Average Audit Score */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span className="font-semibold text-neutral-700">Average Quality Rating</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-neutral-900 flex items-baseline gap-1">
            <span>{analytics?.avgScore ?? 0}</span>
            <span className="text-xs text-neutral-400 font-normal">/ 5.0 pts</span>
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Regulatory standard threshold &ge; 4.0
          </div>
        </div>
      </div>

      {/* Call Categorization & Ingestion Breakdown Card */}
      {classification && (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-500" />
                <span>Call Categorization &amp; Volume Pipeline</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Distribution of all {classification.total} imported recordings across Pre-Order, Regular Advisory, and Short Scrap Calls
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-neutral-800 bg-neutral-100 px-3 py-1 rounded-lg border border-neutral-200">
              Total Ingested: {classification.total}
            </span>
          </div>

          {/* Categorization Visual Bar */}
          <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${classification.preOrderPct}%` }}
              className="bg-amber-400 transition-all"
              title={`Pre-Order Calls: ${classification.preOrder} (${classification.preOrderPct}%)`}
            />
            <div
              style={{ width: `${classification.regularPct}%` }}
              className="bg-neutral-700 transition-all"
              title={`Regular Advisory Calls: ${classification.regular} (${classification.regularPct}%)`}
            />
            <div
              style={{ width: `${classification.scrapPct}%` }}
              className="bg-rose-500 transition-all"
              title={`Scrap Calls (<=6s): ${classification.scrap} (${classification.scrapPct}%)`}
            />
          </div>

          {/* 3 Detailed Categorization Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Pre-Order */}
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Pre-Order Calls (Audited)</span>
                </span>
                <span className="text-xs font-extrabold text-amber-900 font-mono">
                  {classification.preOrder} ({classification.preOrderPct}%)
                </span>
              </div>
              <p className="text-[11px] text-neutral-600">
                Advisor talking about buying or selling stock. Evaluated for client identity, script name, quantity, and price.
              </p>
              <div className="text-[11px] text-amber-900 font-semibold flex items-center gap-1 pt-1 border-t border-amber-200/60">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationPreOrder)}</span>
              </div>
            </div>

            {/* Regular */}
            <div className="p-3.5 rounded-xl border border-neutral-300 bg-neutral-50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
                  <span>Regular Advisory Calls</span>
                </span>
                <span className="text-xs font-extrabold text-neutral-900 font-mono">
                  {classification.regular} ({classification.regularPct}%)
                </span>
              </div>
              <p className="text-[11px] text-neutral-600">
                General stock recommendations, market commentary, portfolio review, or query resolution with no trade confirmation.
              </p>
              <div className="text-[11px] text-neutral-700 font-semibold flex items-center gap-1 pt-1 border-t border-neutral-200">
                <Clock className="w-3 h-3 text-neutral-500" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationRegular)}</span>
              </div>
            </div>

            {/* Scrap */}
            <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>Scrap Calls (&le; 6s)</span>
                </span>
                <span className="text-xs font-extrabold text-rose-900 font-mono">
                  {classification.scrap} ({classification.scrapPct}%)
                </span>
              </div>
              <p className="text-[11px] text-neutral-600">
                Voicemails, ringing timeouts, and immediate disconnects under 5 to 6 seconds duration. Automatically filtered out.
              </p>
              <div className="text-[11px] text-rose-900 font-semibold flex items-center gap-1 pt-1 border-t border-rose-200/60">
                <Clock className="w-3 h-3 text-rose-500" />
                <span>Avg Duration: {formatSeconds(classification.avgDurationScrap)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5-Point Parameter Failure Pareto Section */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-500" />
            <span>Audit Standard 5-Point Parameter Evaluation</span>
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Detailed pass / fail audit breakdown across all mandatory quality checkpoints
          </p>
        </div>

        {qStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Q1 */}
            <div className="p-3 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">Q1: CLI Registered Match</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-tight">
                Mandate: Pre-order call MUST be received on registered client mobile number.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100 font-medium">
                <span className="text-emerald-700">Pass: {qStats.q1.pass} ({calculatePct(qStats.q1.pass, total)}%)</span>
                <span className="text-rose-700 font-bold">Fail: {qStats.q1.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q1.pass, total)}%` }} className="bg-emerald-500" />
                <div style={{ width: `${calculatePct(qStats.q1.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>

            {/* Q2 */}
            <div className="p-3 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">Q2: Client UCC Stated</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-tight">
                Mandate: Client Unique Client Code (UCC) explicitly verified before order placement.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100 font-medium">
                <span className="text-emerald-700">Pass: {qStats.q2.pass} ({calculatePct(qStats.q2.pass, total)}%)</span>
                <span className="text-rose-700 font-bold">Fail: {qStats.q2.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q2.pass, total)}%` }} className="bg-emerald-500" />
                <div style={{ width: `${calculatePct(qStats.q2.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>

            {/* Q3 */}
            <div className="p-3 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">Q3: Script / Qty / Price</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  1 PT
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-tight">
                Stock name, buy/sell quantity, and price/CMP clearly stated &amp; confirmed.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100 font-medium">
                <span className="text-emerald-700">Pass: {qStats.q3.pass} ({calculatePct(qStats.q3.pass, total)}%)</span>
                <span className="text-amber-700 font-bold">Fail: {qStats.q3.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q3.pass, total)}%` }} className="bg-emerald-500" />
                <div style={{ width: `${calculatePct(qStats.q3.fail, total)}%` }} className="bg-amber-500" />
              </div>
            </div>

            {/* Q5 */}
            <div className="p-3 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">Q5: No Assured Guarantees</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  FATAL
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-tight">
                Code of Conduct: No false promises, assured returns, or misleading profit guarantees.
              </p>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100 font-medium">
                <span className="text-emerald-700">Pass: {qStats.q5.pass} ({calculatePct(qStats.q5.pass, total)}%)</span>
                <span className="text-rose-700 font-bold">Fail: {qStats.q5.fail}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${calculatePct(qStats.q5.pass, total)}%` }} className="bg-emerald-500" />
                <div style={{ width: `${calculatePct(qStats.q5.fail, total)}%` }} className="bg-rose-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advisor Performance & Risk Matrix */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              <span>Advisor Compliance &amp; Risk Ranking Matrix</span>
            </h3>
            <p className="text-xs text-neutral-500">Rollup by advisor name / dealer ID with automated risk categorization</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={advisorSearch}
              onChange={(e) => setAdvisorSearch(e.target.value)}
              placeholder="Filter advisors…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Advisor / Caller Name</th>
                <th className="py-2.5 px-3 text-center">Total Audited Calls</th>
                <th className="py-2.5 px-3 text-center">Avg Rating (0-5)</th>
                <th className="py-2.5 px-3 text-center">Compliant (Score 4-5)</th>
                <th className="py-2.5 px-3 text-center">Fatal Violations</th>
                <th className="py-2.5 px-3 text-center">Compliance Rate</th>
                <th className="py-2.5 px-3 text-right">Risk Disposition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredAdvisors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400">
                    No advisor audit data found.
                  </td>
                </tr>
              ) : (
                filteredAdvisors.map((adv) => (
                  <tr key={adv.name} className="hover:bg-amber-50/20 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">{adv.name}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{adv.totalCalls}</td>
                    <td className="py-2.5 px-3 text-center font-bold">
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          adv.avgScore >= 4.5
                            ? 'bg-emerald-100 text-emerald-900'
                            : adv.avgScore >= 3.5
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}
                      >
                        {adv.avgScore} / 5
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">{adv.passCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-rose-700 font-bold">{adv.fatalCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">{adv.complianceRate}%</td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          adv.riskLevel === 'HIGH'
                            ? 'bg-rose-600 text-white'
                            : adv.riskLevel === 'MEDIUM'
                            ? 'bg-amber-400 text-black'
                            : 'bg-emerald-600 text-white'
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

      {/* Compliance Officer RCA Guidance Section */}
      <div className="bg-neutral-950 text-neutral-200 p-5 rounded-2xl border border-neutral-800 space-y-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
          <ShieldCheck className="w-4 h-4" />
          <span>Quality Audit Action Protocol (Root Cause Analysis)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-neutral-300">
          <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-1">
            <div className="font-bold text-white">CLI Discrepancies (Q1 Failures)</div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              When calls arrive from unregistered customer numbers, advisor must halt trade execution until client sends confirmation via authenticated mobile app or registered email.
            </p>
          </div>
          <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-1">
            <div className="font-bold text-white">Missing UCC / Trade Pricing (Q2/Q3)</div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Ensure all advisors repeat exact script, quantity, and limit/market price before sending orders to trading terminal. Automated scorecards notify team leads on score &lt; 4.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
