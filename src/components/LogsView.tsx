import React, { useState } from 'react';
import { ScrollText, Search, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { LogEntry } from '../types';

interface LogsViewProps {
  logs: LogEntry[];
  isLoading: boolean;
}

export const LogsView: React.FC<LogsViewProps> = ({ logs, isLoading }) => {
  const [filterLevel, setFilterLevel] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = logs.filter((l) => {
    if (filterLevel !== 'all' && l.level !== filterLevel) return false;
    const q = search.toLowerCase();
    return l.event.toLowerCase().includes(q) || l.message.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header - Classy Black & Yellow */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span className="p-1 rounded-lg bg-black text-amber-400">
              <ScrollText className="w-4 h-4" />
            </span>
            <span>AuditEQ Backend &amp; Worker Event Logs</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time execution log of ingestion, Groq Whisper calls, deterministic matching passes, and scoring events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-700 focus:border-amber-400 focus:outline-none"
          >
            <option value="all">All Levels ({logs.length})</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event logs…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 font-sans text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-44 text-amber-400">Timestamp</th>
                <th className="py-2.5 px-3 w-24">Level</th>
                <th className="py-2.5 px-3 w-48">Event</th>
                <th className="py-2.5 px-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800 text-[11px]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-400 font-sans">
                    No log entries match the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-2 px-3 text-neutral-500">{l.created_at}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          l.level === 'error'
                            ? 'bg-rose-100 text-rose-800'
                            : l.level === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {l.level}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-neutral-900">{l.event}</td>
                    <td className="py-2 px-3 text-neutral-700 font-sans">{l.message}</td>
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
