import React from 'react';
import {
  LayoutDashboard,
  PhoneCall,
  TrendingUp,
  GitCompare,
  CheckSquare,
  Activity,
  Award,
  Mail,
  MailCheck,
  FileText,
  Sliders,
  Cpu,
  ScrollText,
  Archive,
  Sparkles,
  Table,
  Radio,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import type { ActiveTab } from '../types';

export type { ActiveTab };

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  stats: {
    transcribed: number;
    calls: number;
    audits: number;
    scored: number;
    failed: number;
  } | null;
  isOpen?: boolean;
  onToggle?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  stats,
  isOpen = true,
  onToggle,
}) => {
  const navItems = [
    { id: 'dashboard' as ActiveTab, num: '1', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calls' as ActiveTab, num: '2', label: 'Calls', icon: PhoneCall, badge: stats ? `${stats.transcribed}/${stats.calls}` : undefined },
    { id: 'trades' as ActiveTab, num: '3', label: 'Trades', icon: TrendingUp },
    { id: 'matching' as ActiveTab, num: '4', label: 'Matching', icon: GitCompare },
    { id: 'audit' as ActiveTab, num: '5', label: 'Audit', icon: CheckSquare, badge: stats?.audits ? `${stats.audits}` : undefined },
    { id: 'master_table' as ActiveTab, num: '6', label: 'Audited Master Grid', icon: Table, badge: stats?.scored ? `${stats.scored}` : undefined, highlight: true },
    { id: 'manual_trade_audit' as ActiveTab, num: '6.5', label: 'Missing Call / Mail Audit', icon: MailCheck, highlight: true },
    { id: 'scorecards' as ActiveTab, num: '7', label: 'Scorecards', icon: Award },
    { id: 'mail' as ActiveTab, num: '8', label: 'Mail', icon: Mail },
    { id: 'reports' as ActiveTab, num: '9', label: 'Reports', icon: FileText },
    { id: 'integrations' as ActiveTab, num: '10', label: 'Integrations', icon: Sliders },
    { id: 'admin' as ActiveTab, num: '11', label: 'Admin', icon: ShieldCheck },
    { id: 'adambee' as ActiveTab, num: '12', label: 'AdamBee Ticket Auditor', icon: Sparkles, isBee: true },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside
        className={`${
          isOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:w-16 lg:translate-x-0'
        } bg-[#0a1220]/80 backdrop-blur-2xl text-slate-100 flex flex-col border-r border-teal-500/15 shrink-0 h-screen sticky top-0 z-40 transition-all duration-300 ease-in-out select-none overflow-hidden shadow-[4px_0_30px_rgba(0,0,0,0.5)]`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-teal-500/15 flex items-center justify-between bg-slate-950/40 min-w-[64px]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 flex items-center justify-center font-black text-slate-950 shadow-[0_0_20px_rgba(20,184,166,0.5)] tracking-wider shrink-0 border border-teal-300/40">
              AR
            </div>
            {isOpen && (
              <div className="truncate">
                <div className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-white">
                  ADAM-AR <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-400/15 text-teal-300 font-mono font-bold border border-teal-400/30">v1.1</span>
                </div>
                <div className="text-[11px] text-teal-200/60 truncate font-medium">FundsIndia Quality</div>
              </div>
            )}
          </div>

          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 text-slate-400 hover:text-teal-300 rounded-lg hover:bg-teal-500/10 transition-colors cursor-pointer hidden lg:block shrink-0 border border-transparent hover:border-teal-500/20"
              title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Automated Engine Status Strip */}
        {isOpen && (
          <div className="px-3.5 py-2 bg-slate-950/60 border-b border-teal-500/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-teal-400 font-semibold truncate">
              <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-pulse shrink-0" />
              <span className="truncate text-[11px] tracking-wide">Speech &amp; Audit Engine</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30 shrink-0">Active</span>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={!isOpen ? `${item.num}. ${item.label}` : undefined}
                className={`w-full flex items-center ${
                  isOpen ? 'justify-between px-3 py-2.5' : 'justify-center p-2.5'
                } rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-teal-500/25 via-teal-500/15 to-transparent text-teal-200 border-l-4 border-teal-400 shadow-[0_4px_20px_rgba(20,184,166,0.25)] font-bold backdrop-blur-md'
                    : 'text-slate-400 hover:bg-teal-500/10 hover:text-teal-200 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {item.isBee ? (
                    <span className="text-base shrink-0 filter drop-shadow">🐝</span>
                  ) : (
                    <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-teal-300 scale-110' : 'text-slate-400'}`} />
                  )}
                  {isOpen && (
                    <span className="truncate">
                      <span className="text-[10px] text-teal-500/70 font-mono mr-1.5">{item.num}.</span>
                      {item.label}
                    </span>
                  )}
                </div>

                {isOpen && item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold shrink-0 ${
                      isActive
                        ? 'bg-teal-400 text-slate-950 shadow-xs'
                        : item.highlight
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40'
                        : 'bg-slate-900/80 text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Info */}
        {isOpen && (
          <div className="p-3 border-t border-teal-500/15 text-[11px] text-slate-400 bg-slate-950/60">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-200">ADAM-AR v1.1</span>
              <span className="font-mono text-teal-300 text-[10px] font-bold bg-teal-500/15 px-1.5 py-0.5 rounded border border-teal-500/30">100% Deterministic</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Developed &amp; designed by <span className="text-teal-300 font-bold">TAJ</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

