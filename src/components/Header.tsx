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
    <header className="bg-[#0d0d0d] border-b border-neutral-800 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-md select-none">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 border border-neutral-800 transition-colors cursor-pointer"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        )}
        <div>
          <div className="text-[11px] font-black tracking-wider uppercase text-amber-400 mb-0.5 flex items-center gap-2">
            <span>FundsIndia Quality Control</span>
            <span className="text-[10px] px-2 py-0.5 bg-neutral-900 text-amber-400/90 rounded-md font-mono border border-amber-400/30">
              Pre-Order Quality Audit
            </span>
          </div>
          <h1 className="text-xl font-black text-neutral-100 tracking-tight">{title}</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* AdamBee Top-Right Mascot Extension Icon */}
        {onTriggerBee && (
          <button
            onClick={onTriggerBee}
            className="relative group p-2 bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-black rounded-xl shadow-[0_4px_14px_rgba(251,191,36,0.35)] transition-all cursor-pointer flex items-center gap-1.5 border border-amber-300"
            title="AdamBee Ticket Auditor (Click to fly & scan screen)"
          >
            <span className="text-lg leading-none filter drop-shadow-xs animate-pulse">🐝</span>
            <span className="hidden md:inline text-xs font-black tracking-tight">AdamBee</span>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-600"></span>
            </span>
          </button>
        )}

        {onStartPipeline && (
          <button
            onClick={onStartPipeline}
            disabled={isLoading || pipelineRunning}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 disabled:opacity-50 text-black rounded-xl text-xs font-bold shadow-[0_4px_14px_rgba(251,191,36,0.3)] transition-all cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${pipelineRunning ? 'animate-spin' : ''}`} />
            <span>{pipelineRunning ? 'Pipeline…' : 'Run Pipeline'}</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 active:translate-y-0.5 text-neutral-200 hover:text-amber-400 rounded-xl text-xs font-semibold border border-neutral-700 transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {/* API Key Status Pill */}
        <button
          onClick={onOpenAuth}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs ${
            groqConfigured
              ? 'bg-amber-400/15 text-amber-400 border-amber-400/40 hover:bg-amber-400/25'
              : 'bg-neutral-900 text-amber-400 border-amber-400 animate-pulse hover:bg-neutral-800'
          }`}
          title="Click to manage custom AI API keys"
        >
          <Key className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">{groqConfigured ? 'Groq Active' : 'API Key'}</span>
        </button>

        <div className="h-6 w-px bg-neutral-800" />

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 text-neutral-200 font-medium border border-neutral-800 text-xs transition-colors cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-400 text-black font-black flex items-center justify-center text-[11px] shadow-xs">
              {(currentUser?.full_name || currentUser?.username || 'A')[0].toUpperCase()}
            </div>
            <div className="text-left hidden lg:block">
              <div className="font-bold text-neutral-200 leading-tight">
                {currentUser?.full_name || currentUser?.username || 'Administrator'}
              </div>
              <div className="text-[10px] text-amber-400/80 capitalize leading-tight font-medium">
                {currentUser?.role || 'admin'}
              </div>
            </div>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl py-1.5 text-xs text-neutral-300 z-30 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="px-3.5 py-2 border-b border-neutral-800">
                <div className="font-bold text-neutral-100">{currentUser?.full_name || currentUser?.username}</div>
                <div className="text-[11px] text-neutral-400 font-mono">{currentUser?.email || currentUser?.username}</div>
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-400 border border-amber-400/30">
                  {currentUser?.role || 'admin'}
                </span>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-900 hover:text-amber-400 flex items-center gap-2 text-neutral-300 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <span>Account Profile &amp; Role</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-900 hover:text-amber-400 flex items-center gap-2 text-neutral-300 cursor-pointer transition-colors"
              >
                <Key className="w-4 h-4 text-amber-500" />
                <span>AI Model &amp; API Key Setup</span>
              </button>

              <div className="border-t border-neutral-800 my-1" />

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

