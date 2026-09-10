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
        } bg-[#0a0a0a] text-neutral-100 flex flex-col border-r border-neutral-800 shrink-0 h-screen sticky top-0 z-40 transition-all duration-300 ease-in-out select-none overflow-hidden`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-950 min-w-[64px]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center font-black text-black shadow-[0_4px_16px_rgba(251,191,36,0.4)] tracking-wider shrink-0">
              AR
            </div>
            {isOpen && (
              <div className="truncate">
                <div className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-neutral-100">
                  ADAM-AR <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-mono font-semibold border border-amber-400/30">v4.3</span>
                </div>
                <div className="text-[11px] text-neutral-400 truncate">FundsIndia Quality</div>
              </div>
            )}
          </div>

          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1 text-neutral-400 hover:text-amber-400 rounded-lg hover:bg-neutral-900 transition-colors cursor-pointer hidden lg:block shrink-0"
              title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* AI Engine Status Strip */}
        {isOpen && (
          <div className="px-3.5 py-2 bg-black border-b border-neutral-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold truncate">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
              <span className="truncate">Groq Whisper + GPT-OSS</span>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono shrink-0">Active</span>
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
                    ? 'bg-amber-400 text-black shadow-[0_4px_14px_rgba(251,191,36,0.35)] font-bold scale-[1.02]'
                    : 'text-neutral-300 hover:bg-neutral-900 hover:text-amber-400'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {item.isBee ? (
                    <span className="text-base shrink-0">🐝</span>
                  ) : (
                    <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-black scale-110' : 'text-neutral-400'}`} />
                  )}
                  {isOpen && (
                    <span className="truncate">
                      <span className="text-[10px] text-neutral-500 font-mono mr-1.5">{item.num}.</span>
                      {item.label}
                    </span>
                  )}
                </div>

                {isOpen && item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold shrink-0 ${
                      isActive
                        ? 'bg-black text-amber-400'
                        : item.highlight
                        ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                        : 'bg-neutral-800 text-neutral-400'
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
          <div className="p-3 border-t border-neutral-800 text-[11px] text-neutral-400 bg-neutral-950">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-neutral-200">ADAM-AR</span>
              <span className="font-mono text-amber-400 text-[10px] font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">100% Deterministic</span>
            </div>
            <div className="text-[10px] text-neutral-400">
              Developed &amp; designed by <span className="text-amber-400 font-bold">TAJ</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

