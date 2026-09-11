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
        body: JSON.stringify({ username: username.trim(), password }),
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="bg-[#0f0f12] text-white px-6 py-5 flex items-center justify-between border-b border-neutral-800">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-amber-400">
              AuditEQ Enterprise Control
            </div>
            <h2 className="text-lg font-bold text-white">
              {mode === 'account' ? (currentUser ? 'User Profile' : 'Authorized Sign In') : 'Groq AI Key Management'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 bg-neutral-50 text-xs font-bold text-neutral-600">
          <button
            onClick={() => {
              setMode('account');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 ${
              mode === 'account' ? 'border-amber-400 text-black bg-white' : 'border-transparent hover:bg-neutral-100'
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
              mode === 'apikey' ? 'border-amber-400 text-black bg-white' : 'border-transparent hover:bg-neutral-100'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span>Groq AI Key</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {mode === 'account' && !currentUser && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
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
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-black hover:bg-neutral-900 text-amber-400 font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 border border-amber-400/30"
              >
                {loading ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </form>
          )}

          {mode === 'account' && currentUser && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Active Enterprise Session
                </div>
                <div className="text-base font-bold text-neutral-900">{currentUser.full_name || currentUser.username}</div>
                <div className="text-xs text-neutral-600">{currentUser.email || currentUser.username}</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <Shield className="w-3 h-3 text-amber-600" />
                    <span className="capitalize">{currentUser.role} Role</span>
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authenticated
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-black hover:bg-neutral-900 text-amber-400 font-bold text-xs rounded-xl transition-colors cursor-pointer border border-amber-400/30"
              >
                Done
              </button>
            </div>
          )}

          {mode === 'apikey' && (
            <form onSubmit={handleTestAndSaveApiKey} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-neutral-700">
                    Groq Cloud API Key
                  </label>
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    {groqConfigured ? '✓ Active & Ready' : 'Key Required'}
                  </span>
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="gsk_..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-xl focus:border-amber-400 focus:outline-hidden font-mono"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Used for Whisper Large v3 speech transcription and automated pre-order quality auditing.
                </p>
              </div>

              <button
                type="submit"
                disabled={apiTesting || !apiKeyInput.trim()}
                className="w-full py-2.5 bg-black hover:bg-neutral-900 text-amber-400 font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-amber-400/30"
              >
                {apiTesting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying with Groq Cloud...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-400" />
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
