import React, { useState } from 'react';
import {
  RefreshCw,
  Play,
  ShieldCheck,
  User,
  Key,
  LogOut,
  UserPlus,
  Database,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { UserProfile } from '../types';

interface HeaderProps {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onStartPipeline?: () => void;
  isLoading: boolean;
  pipelineRunning?: boolean;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  groqConfigured: boolean;
  onTriggerBee?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onRefresh,
  onStartPipeline,
  isLoading,
  pipelineRunning,
  currentUser,
  onOpenAuth,
  onLogout,
  groqConfigured,
  onTriggerBee,
  sidebarOpen = true,
  onToggleSidebar,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-slate-950/70 backdrop-blur-2xl border-b border-teal-500/15 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.45)] select-none">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-teal-300 border border-teal-500/20 hover:border-teal-500/40 transition-all cursor-pointer shadow-xs"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        )}
        <div>
          <div className="text-[11px] font-bold tracking-wider uppercase text-teal-400 mb-0.5 flex items-center gap-2">
            <span>AuditEQ Quality Assurance</span>
            <span className="text-[10px] px-2 py-0.5 bg-teal-950/70 text-teal-300 rounded-full font-mono border border-teal-500/30">
              ADAM-AR v1.1
            </span>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">{title}</h1>
          <p className="text-xs text-teal-100/60 mt-0.5 font-medium">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* AdamBee Top-Right Mascot Extension Icon */}
        {onTriggerBee && (
          <button
            onClick={onTriggerBee}
            className="relative group p-2 bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-500 hover:brightness-110 active:scale-95 text-slate-950 rounded-xl shadow-[0_4px_16px_rgba(20,184,166,0.4)] transition-all cursor-pointer flex items-center gap-1.5 border border-teal-300/60"
            title="AdamBee Ticket Auditor (Click to fly & scan screen)"
          >
            <span className="text-lg leading-none filter drop-shadow animate-pulse">🐝</span>
            <span className="hidden md:inline text-xs font-black tracking-tight">AdamBee</span>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
            </span>
          </button>
        )}

        {onStartPipeline && (
          <button
            onClick={onStartPipeline}
            disabled={isLoading || pipelineRunning}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-500 hover:brightness-110 active:scale-95 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-black shadow-[0_4px_18px_rgba(20,184,166,0.35)] transition-all cursor-pointer border border-teal-300/40"
          >
            <Play className={`w-3.5 h-3.5 fill-slate-950 text-slate-950 ${pipelineRunning ? 'animate-spin' : ''}`} />
            <span>{pipelineRunning ? 'Pipeline…' : 'Run Pipeline'}</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-teal-300 rounded-xl text-xs font-semibold border border-teal-500/20 hover:border-teal-500/40 transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {/* Engine Key Status Pill */}
        <button
          onClick={onOpenAuth}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs ${
            groqConfigured
              ? 'bg-teal-500/15 text-teal-300 border-teal-500/40 hover:bg-teal-500/25'
              : 'bg-slate-900 text-teal-400 border-teal-400 animate-pulse hover:bg-slate-800'
          }`}
          title="Click to manage processing engine API keys"
        >
          <Key className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden sm:inline">{groqConfigured ? 'Engine Active' : 'API Key'}</span>
        </button>

        <div className="h-6 w-px bg-teal-500/20" />

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 font-medium border border-teal-500/20 text-xs transition-colors cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 text-slate-950 font-black flex items-center justify-center text-[11px] shadow-xs">
              {(currentUser?.full_name || currentUser?.username || 'A')[0].toUpperCase()}
            </div>
            <div className="text-left hidden lg:block">
              <div className="font-bold text-slate-100 leading-tight">
                {currentUser?.full_name || currentUser?.username || 'Administrator'}
              </div>
              <div className="text-[10px] text-teal-300/80 capitalize leading-tight font-medium">
                {currentUser?.role || 'admin'}
              </div>
            </div>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 bg-slate-950/90 backdrop-blur-2xl border border-teal-500/25 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] py-1.5 text-xs text-slate-300 z-30 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="px-3.5 py-2 border-b border-teal-500/15">
                <div className="font-bold text-white">{currentUser?.full_name || currentUser?.username}</div>
                <div className="text-[11px] text-slate-400 font-mono">{currentUser?.email || currentUser?.username}</div>
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {currentUser?.role || 'admin'}
                </span>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-teal-500/15 hover:text-teal-200 flex items-center gap-2 text-slate-300 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>Account Profile &amp; Role</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-teal-500/15 hover:text-teal-200 flex items-center gap-2 text-slate-300 cursor-pointer transition-colors"
              >
                <Key className="w-4 h-4 text-teal-400" />
                <span>Processing Engine &amp; API Key Setup</span>
              </button>

              <div className="border-t border-teal-500/15 my-1" />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-rose-950/40 text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

