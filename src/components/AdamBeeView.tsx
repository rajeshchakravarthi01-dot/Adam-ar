import React, { useState } from 'react';
import {
  Bug,
  Sparkles,
  Search,
  Download,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Code,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Eye,
  Globe,
  Archive,
  Layers,
} from 'lucide-react';
import type { AdamBeeTicketRecord } from '../types';

interface AdamBeeViewProps {
  tickets: AdamBeeTicketRecord[];
  onTriggerBee: () => void;
  onClearTickets: () => void;
  onAddTicket: (ticket: AdamBeeTicketRecord) => void;
  onRefresh?: () => void;
}

export const AdamBeeView: React.FC<AdamBeeViewProps> = ({
  tickets,
  onTriggerBee,
  onClearTickets,
  onAddTicket,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'COMPLIANT' | 'FLAGGED' | 'FATAL'>('ALL');
  const [filterProfile, setFilterProfile] = useState<string>('ALL');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<AdamBeeTicketRecord | null>(null);

  // Manual ticket form state
  const [manualTicketText, setManualTicketText] = useState('');
  const [manualTicketId, setManualTicketId] = useState('');
  const [manualClient, setManualClient] = useState('');
  const [manualAdvisor, setManualAdvisor] = useState('');
  const [manualProfile, setManualProfile] = useState('FundsIndia CRM');

  const filteredTickets = tickets.filter((t) => {
    if (filterStatus !== 'ALL' && t.complianceStatus !== filterStatus) return false;
    if (filterProfile !== 'ALL' && (t.siteProfile || 'Generic') !== filterProfile) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const inId = (t.ticketId || '').toLowerCase().includes(q);
      const inClient = (t.clientId || '').toLowerCase().includes(q);
      const inAdv = (t.advisorName || '').toLowerCase().includes(q);
      const inFind = (t.findings || '').toLowerCase().includes(q);
      const inProfile = (t.siteProfile || '').toLowerCase().includes(q);
      return inId || inClient || inAdv || inFind || inProfile;
    }
    return true;
  });

  const bookmarkletCode = `javascript:(function(){
    var title = document.title || '';
    var url = window.location.href;
    var bodyText = document.body.innerText || '';
    var ticketMatch = bodyText.match(/\\b(?:ticket|case|req|incident)[\\s#:-]*([A-Z0-9-]{4,15})\\b/i);
    var clientMatch = bodyText.match(/\\b(?:client|ucc|acc)[\\s#:-]*([A-Z0-9]{4,12})\\b/i);
    var phoneMatch = bodyText.match(/\\b(?:\\+?91)?[6-9]\\d{9}\\b/);
    var beeData = {
      id: 'bee-ext-' + Date.now(),
      sourceUrl: url,
      pageTitle: title,
      extractedAt: new Date().toISOString(),
      ticketId: ticketMatch ? ticketMatch[1] : ('TKT-' + Math.floor(Math.random()*90000+10000)),
      clientId: clientMatch ? clientMatch[1].toUpperCase() : 'EXT-CLIENT',
      advisorName: 'CRM Web Agent',
      phoneNumber: phoneMatch ? phoneMatch[0] : '',
      complianceStatus: 'PENDING',
      riskScore: 2,
      findings: 'Harvested externally from ' + url,
      rawSnippets: [bodyText.slice(0, 500)]
    };
    alert('🐝 AdamBee harvested ticket ' + beeData.ticketId + '! Sending to AuditEQ workspace...');
    window.open('${window.location.origin}/#adambee?data=' + encodeURIComponent(JSON.stringify(beeData)), '_blank');
  })();`;

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTicketText.trim()) return;

    const phoneMatch = manualTicketText.match(/\b(?:\+?91)?[6-9]\d{9}\b/);
    const hasGuarantee = /\b(?:guarantee|definitely|fixed return|pakka|100%)\b/i.test(manualTicketText);
    const hasCancellation = /\b(?:cancel|dispute|unauthorized|refund)\b/i.test(manualTicketText);

    const newTicket: AdamBeeTicketRecord = {
      id: `manual-${Date.now()}`,
      sourceUrl: `Manual CRM (${manualProfile})`,
      pageTitle: `CRM Ticket #${manualTicketId || 'NEW'}`,
      extractedAt: new Date().toISOString(),
      ticketId: manualTicketId.trim() || `TKT-${Math.floor(10000 + Math.random() * 90000)}`,
      clientId: manualClient.trim() || 'INP-CLIENT',
      advisorName: manualAdvisor.trim() || 'Advisor',
      phoneNumber: phoneMatch ? phoneMatch[0] : undefined,
      siteProfile: manualProfile,
      complianceStatus: hasGuarantee ? 'FATAL' : hasCancellation ? 'FLAGGED' : 'COMPLIANT',
      riskScore: hasGuarantee ? 5 : hasCancellation ? 3 : 1,
      rawSnippets: [manualTicketText.slice(0, 500)],
      findings: hasGuarantee
        ? 'High compliance risk: Prohibited return commitment or guarantee keyword identified in ticket logs.'
        : hasCancellation
        ? 'Customer dispute or unauthorized execution reported in ticket body.'
        : 'Pre-order confirmation parameters verified standard.',
    };

    onAddTicket(newTicket);
    setManualTicketText('');
    setManualTicketId('');
    setManualClient('');
    setManualAdvisor('');
    setShowManualModal(false);
  };

  const handleExportCSV = () => {
    if (tickets.length === 0) return;
    const headers = ['Ticket ID', 'Client ID', 'Advisor', 'Phone', 'Profile', 'Risk Score', 'Compliance Status', 'Source URL', 'Findings', 'Extracted At'];
    const rows = tickets.map((t) => [
      t.ticketId || '',
      t.clientId || '',
      t.advisorName || '',
      t.phoneNumber || '',
      t.siteProfile || 'Generic',
      t.riskScore,
      t.complianceStatus,
      `"${(t.sourceUrl || '').replace(/"/g, '""')}"`,
      `"${(t.findings || '').replace(/"/g, '""')}"`,
      t.extractedAt,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adambee-tickets-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-[#0b0b0e] text-white p-6 rounded-2xl border border-neutral-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-1">
              <span className="text-lg">🐝</span>
              <span>AdamBee Autonomous Web &amp; Screen Extractor</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Screen Crawler &amp; CRM Ticket Compliance Auditor
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
              Autonomous crawler and browser extension auditor: Harvest full-page DOM elements, CRM support tickets, UCC codes, and advisor communications to detect SEBI compliance infractions in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={onTriggerBee}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
              title="Launch AdamBee to crawl this screen"
            >
              <span className="text-base">🐝</span>
              <span>Release AdamBee (Screen Crawl)</span>
            </button>

            <a
              href="/api/adambee/download-extension"
              download="adambee-extension.zip"
              className="px-3.5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download standalone Chrome/Edge extension ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Extension (ZIP)</span>
            </a>

            <button
              onClick={() => setShowManualModal(true)}
              className="px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-amber-400 text-xs font-bold rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Import Ticket</span>
            </button>

            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-neutral-700 cursor-pointer"
                title="Refresh Tickets from Backend"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Extension Integration & Ingestion Info */}
        <div className="mt-5 pt-4 border-t border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-400" />
            <span>
              <b>Site-Specific Profiles:</b> FundsIndia CRM, Freshdesk, Zendesk, Salesforce &amp; Tata Smartflo portals.
            </span>
          </div>
          <button
            onClick={handleCopyBookmarklet}
            className="px-3 py-1.5 bg-neutral-850 hover:bg-neutral-800 text-amber-400 border border-amber-400/30 rounded-lg font-mono text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Bookmarklet Copied!' : 'Copy AdamBee Bookmarklet'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-neutral-500">Harvested Tickets</div>
          <div className="text-2xl font-black text-neutral-900 mt-1">{tickets.length}</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Persisted in SQLite database</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-emerald-600">Compliant Tickets</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {tickets.filter((t) => t.complianceStatus === 'COMPLIANT').length}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Norms verified</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-amber-600">Flagged for Review</div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {tickets.filter((t) => t.complianceStatus === 'FLAGGED').length}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Risk cues detected</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-rose-600">Fatal Risk Detected</div>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {tickets.filter((t) => t.complianceStatus === 'FATAL').length}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Immediate auditor action</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Ticket ID, Client, Advisor, findings..."
              className="w-full pl-8 pr-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl text-xs">
            {(['ALL', 'COMPLIANT', 'FLAGGED', 'FATAL'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  filterStatus === st
                    ? 'bg-white text-black shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl text-xs">
            {['ALL', 'FundsIndia CRM', 'Freshdesk', 'Zendesk', 'Salesforce', 'Generic'].map((prof) => (
              <button
                key={prof}
                onClick={() => setFilterProfile(prof)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold text-[10px] transition-all cursor-pointer ${
                  filterProfile === prof
                    ? 'bg-amber-400 text-black shadow-xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {prof}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tickets.length > 0 && (
            <>
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={onClearTickets}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Clear all extracted tickets"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Ticket Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <span className="text-base">🐝</span>
            <span>Harvested Tickets &amp; Audit Trail ({filteredTickets.length})</span>
          </h3>
          <span className="text-[11px] font-mono text-neutral-400">Click any row to view full capture</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-3">Profile</th>
                <th className="py-3 px-3">Client Code</th>
                <th className="py-3 px-3">Advisor</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4">Audit Findings &amp; Risk Cues</th>
                <th className="py-3 px-3">Harvested At</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400 space-y-2">
                    <div className="text-3xl">🐝</div>
                    <div className="text-sm font-bold text-neutral-700">No tickets matching filters</div>
                    <p className="text-xs max-w-sm mx-auto text-neutral-500">
                      Release AdamBee, download the browser extension, or use &ldquo;Import Ticket&rdquo; to analyze CRM data.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((t) => {
                  const isFatal = t.complianceStatus === 'FATAL';
                  const isFlagged = t.complianceStatus === 'FLAGGED';

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className="hover:bg-neutral-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>{t.ticketId || 'TKT-AUTO'}</span>
                        </div>
                        <div className="text-[10px] text-neutral-400 truncate max-w-[140px]">{t.pageTitle}</div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded text-[10px]">
                          {t.siteProfile || 'CRM'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded">
                          {t.clientId || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-neutral-800">{t.advisorName || 'CRM Agent'}</div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isFatal
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : isFlagged
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {isFatal ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : isFlagged ? (
                            <ShieldAlert className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          <span>{t.complianceStatus}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-md">
                        <div className="text-neutral-800 text-xs font-medium leading-relaxed">
                          {t.findings}
                        </div>
                        {t.rawSnippets && t.rawSnippets.length > 0 && (
                          <div className="text-[10px] text-neutral-500 font-mono mt-1 line-clamp-1 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">
                            &ldquo;{t.rawSnippets[0]}&rdquo;
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[11px] font-mono text-neutral-500 whitespace-nowrap">
                        {t.extractedAt ? t.extractedAt.slice(0, 16).replace('T', ' ') : '—'}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicket(t);
                          }}
                          className="p-1.5 hover:bg-neutral-200 rounded-lg text-neutral-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-neutral-300 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🐝</span>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Ticket Audit Inspection: #{selectedTicket.ticketId}
                  </h3>
                  <p className="text-[11px] text-neutral-500">{selectedTicket.pageTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-neutral-400 hover:text-black font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Status</span>
                <span className="font-bold text-neutral-900">{selectedTicket.complianceStatus}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Risk Score</span>
                <span className="font-bold text-neutral-900">{selectedTicket.riskScore} / 5</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Client (UCC)</span>
                <span className="font-bold text-neutral-900">{selectedTicket.clientId || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Site Profile</span>
                <span className="font-bold text-neutral-900">{selectedTicket.siteProfile || 'CRM'}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-neutral-900 mb-1">Audit Findings &amp; Regulatory Analysis</h4>
              <p className="text-xs text-neutral-700 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 leading-relaxed">
                {selectedTicket.findings}
              </p>
            </div>

            {selectedTicket.sourceUrl && (
              <div>
                <h4 className="text-xs font-bold text-neutral-900 mb-1">Source Origin</h4>
                <div className="text-xs font-mono text-neutral-600 bg-neutral-100 p-2.5 rounded-lg break-all">
                  {selectedTicket.sourceUrl}
                </div>
              </div>
            )}

            {selectedTicket.rawSnippets && selectedTicket.rawSnippets.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-neutral-900 mb-1">Extracted Text Snippets</h4>
                <div className="space-y-2">
                  {selectedTicket.rawSnippets.map((snippet, idx) => (
                    <pre
                      key={idx}
                      className="text-[11px] font-mono bg-neutral-950 text-neutral-200 p-3 rounded-xl whitespace-pre-wrap max-h-48 overflow-y-auto"
                    >
                      {snippet}
                    </pre>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 bg-neutral-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual CRM Ticket Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-300 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <span className="text-base">🐝</span>
                <span>Ingest CRM Ticket for Compliance Audit</span>
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-neutral-400 hover:text-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Ticket ID / Ref</label>
                  <input
                    type="text"
                    value={manualTicketId}
                    onChange={(e) => setManualTicketId(e.target.value)}
                    placeholder="e.g. TKT-98124"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Client Code (UCC)</label>
                  <input
                    type="text"
                    value={manualClient}
                    onChange={(e) => setManualClient(e.target.value)}
                    placeholder="e.g. FI99182"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Advisor / Agent Name</label>
                  <input
                    type="text"
                    value={manualAdvisor}
                    onChange={(e) => setManualAdvisor(e.target.value)}
                    placeholder="e.g. Ajeetkumar"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Site Profile</label>
                  <select
                    value={manualProfile}
                    onChange={(e) => setManualProfile(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
                  >
                    <option value="FundsIndia CRM">FundsIndia CRM</option>
                    <option value="Freshdesk">Freshdesk</option>
                    <option value="Zendesk">Zendesk</option>
                    <option value="Salesforce">Salesforce</option>
                    <option value="Zoho Desk">Zoho Desk</option>
                    <option value="Generic">Generic Web Portal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Ticket Content / Dialogue / Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={manualTicketText}
                  onChange={(e) => setManualTicketText(e.target.value)}
                  placeholder="Paste ticket conversation, client request, or advisor notes here..."
                  className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-lg text-xs focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Audit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
