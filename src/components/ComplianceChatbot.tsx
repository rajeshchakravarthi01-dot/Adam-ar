import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User,
  ChevronDown,
  RotateCcw,
  Loader2,
  Database,
  Globe,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, getStoredToken } from '../lib/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isReport?: boolean;
}

const INTERNAL_SUGGESTIONS = [
  'How many calls are audited so far?',
  'Which advisors have fatal violations?',
  'Download scorecards report',
  'Check system pipeline issues',
];

const GENERAL_SUGGESTIONS = [
  'SEBI pre-order voice recording rules',
  'What is the difference between limit order and market order?',
  'Explain STT on Indian equity trades',
  'Key compliance duties for stock brokers in India',
];

export const ComplianceChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'internal' | 'general'>('internal');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your **ADAM-AR Intelligence Assistant**.\n\nChoose **ADAM-AR Data Mode** to ask anything about your web app, call records, scorecards, issues, or request reports in downloadable format.\n\nChoose **Google & Web Knowledge Mode** for general web search and any market questions.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleDownloadDirectReport = async (reportType: 'csv' | 'excel' | 'fatal') => {
    setIsDownloading(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/reports/export?token=${token || ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error('Could not fetch report data from server.');
      }

      if (reportType === 'csv') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ADAM_AR_Compliance_Scorecards_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (reportType === 'excel') {
        const csvText = await res.text();
        const rows = csvText.split('\n').map((r) => r.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Audit_Scorecards');
        XLSX.writeFile(wb, `ADAM_AR_Audit_Master_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }

      // Add confirmation in chat
      const confirmMsg: ChatMessage = {
        id: `assistant-dl-${Date.now()}`,
        sender: 'assistant',
        text: `✅ **Download initiated:** Your requested ${reportType.toUpperCase()} report has been generated and saved to your device.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err: unknown) {
      alert(`Report download failed: ${(err as Error).message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTextAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    const isReportQuery =
      /report|download|export|csv|excel|spreadsheet|scorecard list/i.test(textToSend);

    try {
      const response = await api.sendChatMessage(textToSend, mode);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.answer || 'I could not retrieve an answer at this moment.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isReport: isReportQuery,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Error contacting compliance service: ${(err as Error).message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text:
          mode === 'internal'
            ? 'Conversation reset. Ask any question about ADAM-AR call recordings, trade matching, audit scorecards, or request reports in downloadable format.'
            : 'Conversation reset. Ask any question from the web, financial markets, SEBI regulations, or general knowledge.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const suggestions = mode === 'internal' ? INTERNAL_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <aside aria-label="ADAM-AR Compliance Assistant" className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Expanded Chat Window */}
      {isOpen && (
        <div className="w-[380px] sm:w-[460px] h-[600px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-neutral-950 text-white px-4 py-3 flex flex-col gap-2.5 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-white">ADAM-AR Assistant</h3>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    {mode === 'internal' ? 'Mode 1: App & Compliance Data (Reports & Issues)' : 'Mode 2: Google & Web Knowledge'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleClearHistory}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Reset conversation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Minimize chat"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mode Selector Pill Tabs */}
            <div className="grid grid-cols-2 p-1 bg-neutral-900 rounded-xl text-xs gap-1 border border-neutral-800">
              <button
                type="button"
                onClick={() => setMode('internal')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-all cursor-pointer ${
                  mode === 'internal'
                    ? 'bg-amber-400 text-black font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span className="text-[11px]">1: App &amp; Reports</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('general')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-all cursor-pointer ${
                  mode === 'general'
                    ? 'bg-sky-500 text-white font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="text-[11px]">2: Google &amp; Web</span>
              </button>
            </div>

            {/* Quick Report Download Bar (in Mode 1) */}
            {mode === 'internal' && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto text-[10px]">
                <span className="text-neutral-400 shrink-0 font-medium">Quick Export:</span>
                <button
                  onClick={() => handleDownloadDirectReport('csv')}
                  disabled={isDownloading}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 rounded border border-neutral-700 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Download className="w-2.5 h-2.5" />
                  <span>Scorecards (.CSV)</span>
                </button>
                <button
                  onClick={() => handleDownloadDirectReport('excel')}
                  disabled={isDownloading}
                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-300 rounded border border-neutral-700 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-2.5 h-2.5" />
                  <span>Master (.XLSX)</span>
                </button>
              </div>
            )}
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-neutral-50/60">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 text-xs ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-neutral-900 text-white rounded-br-none'
                      : 'bg-white text-neutral-800 border border-neutral-200/80 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.text.split('\n').map((line, idx) => {
                      const parts = line.split(/(\*\*.*?\*\*)/g);
                      return (
                        <div key={idx} className={line.startsWith('- ') ? 'ml-2 my-0.5' : 'my-0.5'}>
                          {parts.map((p, i) => {
                            if (p.startsWith('**') && p.endsWith('**')) {
                              return (
                                <strong key={i} className="font-semibold text-neutral-950">
                                  {p.slice(2, -2)}
                                </strong>
                              );
                            }
                            return p;
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* If assistant response contains report or tables, provide download actions */}
                  {msg.sender === 'assistant' && (msg.isReport || msg.text.includes('|') || msg.text.length > 300) && (
                    <div className="mt-2.5 pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => handleDownloadTextAsFile(msg.text, `ADAM_AR_Report_${Date.now()}.txt`)}
                        className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <FileText className="w-3 h-3 text-neutral-500" />
                        <span>Download Text</span>
                      </button>
                      <button
                        onClick={() => handleDownloadDirectReport('csv')}
                        className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Download className="w-3 h-3 text-amber-700" />
                        <span>Download CSV Data</span>
                      </button>
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-1 text-right ${
                      msg.sender === 'user' ? 'text-neutral-400' : 'text-neutral-400'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 text-xs justify-start items-center">
                <div className="w-6 h-6 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-neutral-200 rounded-2xl px-3.5 py-2 rounded-bl-none flex items-center gap-2 text-neutral-500 shadow-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  <span className="text-[11px]">
                    {mode === 'internal' ? 'Scanning ADAM-AR database & reports...' : 'Searching Google knowledge...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 bg-white border-t border-neutral-100 flex flex-wrap gap-1.5">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s)}
                  className="text-[10px] bg-neutral-100 hover:bg-amber-100 hover:text-amber-900 text-neutral-700 font-medium px-2 py-1 rounded-lg transition-colors text-left cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white border-t border-neutral-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                mode === 'internal'
                  ? 'Ask about web, issues, calls, or ask for downloadable report...'
                  : 'Search Google / Ask any general question...'
              }
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-neutral-100 border border-neutral-200 focus:bg-white focus:border-amber-400 rounded-xl text-xs text-neutral-900 focus:outline-hidden transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-black rounded-xl transition-colors cursor-pointer shadow-xs"
              title="Send question"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group px-4 py-2.5 bg-neutral-950 hover:bg-black text-white rounded-full shadow-xl border border-neutral-800 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95"
        title="Open ADAM-AR Assistant"
      >
        <div className="w-6 h-6 rounded-full bg-amber-400 text-black flex items-center justify-center font-bold">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-bold text-white tracking-wide">ADAM-AR Assistant</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </button>
    </aside>
  );
};
