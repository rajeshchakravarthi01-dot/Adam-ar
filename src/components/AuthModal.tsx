import React, { useState } from 'react';
import { Lock, Mail, Key, CheckCircle2, AlertCircle, X, Sparkles, Shield } from 'lucide-react';
import type { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onSaveApiKey: (key: string) => Promise<boolean>;
  groqConfigured: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onSaveApiKey,
  groqConfigured,
}) => {
  const [mode, setMode] = useState<'account' | 'apikey'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiTesting, setApiTesting] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      localStorage.setItem('auditeq_auth_token', data.token);
      onLoginSuccess(data.user, data.token);
      setSuccess(`Signed in as ${data.user.full_name || data.user.username}`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestAndSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!apiKeyInput.trim()) {
      setError('Please enter a valid Groq API key.');
      return;
    }

    setApiTesting(true);
    try {
      const ok = await onSaveApiKey(apiKeyInput.trim());
      if (ok) {
        setSuccess('Groq API Key verified and saved successfully!');
        setApiKeyInput('');
      } else {
        setError('Failed to verify API key. Please verify with Groq.');
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setApiTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-white/20">
        {/* Top Header */}
        <div className="glass-inner-subtle px-6 py-5 flex items-center justify-between border-b border-white/10">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-teal-400">
              AuditEQ Enterprise Control
            </div>
            <h2 className="text-lg font-bold text-neutral-100">
              {mode === 'account' ? (currentUser ? 'User Profile' : 'Authorized Sign In') : 'Processing Engine Key'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 glass-inner text-xs font-bold">
          <button
            onClick={() => {
              setMode('account');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 ${
              mode === 'account' ? 'border-teal-400 text-teal-300 bg-white/5' : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {currentUser ? 'User Profile' : 'Sign In'}
          </button>
          <button
            onClick={() => {
              setMode('apikey');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center gap-1.5 ${
              mode === 'apikey' ? 'border-teal-400 text-teal-300 bg-white/5' : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-teal-400" />
            <span>Engine Key</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {mode === 'account' && !currentUser && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Authorized Email / Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter authorized email or username"
                    className="w-full pl-9 pr-3 py-2 text-sm glass-input rounded-xl text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm glass-input rounded-xl text-neutral-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </form>
          )}

          {mode === 'account' && currentUser && (
            <div className="space-y-4">
              <div className="p-4 glass-inner border border-white/10 rounded-xl">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Active Enterprise Session
                </div>
                <div className="text-base font-bold text-neutral-100">{currentUser.full_name || currentUser.username}</div>
                <div className="text-xs text-neutral-400 font-mono">{currentUser.email || currentUser.username}</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                    <Shield className="w-3 h-3 text-teal-400" />
                    <span className="capitalize">{currentUser.role} Role</span>
                  </span>
                  <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Authenticated
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg shadow-teal-500/20"
              >
                Done
              </button>
            </div>
          )}

          {mode === 'apikey' && (
            <form onSubmit={handleTestAndSaveApiKey} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-neutral-300">
                    Processing Engine API Key
                  </label>
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    {groqConfigured ? '✓ Active & Ready' : 'Key Required'}
                  </span>
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter API key…"
                    className="w-full pl-9 pr-3 py-2 text-sm glass-input rounded-xl text-neutral-100 font-mono"
                  />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Used for acoustic speech transcription and automated pre-order quality auditing.
                </p>
              </div>

              <button
                type="submit"
                disabled={apiTesting || !apiKeyInput.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {apiTesting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Verifying with Groq Cloud...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-black" />
                    <span>Test &amp; Save API Key</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
