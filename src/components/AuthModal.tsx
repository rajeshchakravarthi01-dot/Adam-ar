import React, { useState } from 'react';
import { Lock, Mail, Key, CheckCircle2, AlertCircle, X, Sparkles, Shield, Mic, Cpu } from 'lucide-react';
import type { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onSaveApiKey: (key: string) => Promise<boolean>;
  onSaveSarvamKey?: (key: string) => Promise<boolean>;
  groqConfigured: boolean;
  sarvamConfigured?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onSaveApiKey,
  onSaveSarvamKey,
  groqConfigured,
  sarvamConfigured,
}) => {
  const [mode, setMode] = useState<'account' | 'apikey'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [sarvamKeyInput, setSarvamKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiTesting, setApiTesting] = useState(false);
  const [sarvamTesting, setSarvamTesting] = useState(false);

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

  const handleTestAndSaveAuditKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!apiKeyInput.trim()) {
      setError('Please enter a valid Audit Engine / Groq API key.');
      return;
    }

    setApiTesting(true);
    try {
      const ok = await onSaveApiKey(apiKeyInput.trim());
      if (ok) {
        setSuccess('Audit Engine API Key verified and saved successfully!');
        setApiKeyInput('');
      } else {
        setError('Failed to verify API key. Pipeline will default to high-precision deterministic scoring.');
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setApiTesting(false);
    }
  };

  const handleTestAndSaveSarvamKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sarvamKeyInput.trim()) {
      setError('Please enter a valid Sarvam AI API subscription key.');
      return;
    }

    if (!onSaveSarvamKey) {
      setError('Sarvam save handler not configured.');
      return;
    }

    setSarvamTesting(true);
    try {
      const ok = await onSaveSarvamKey(sarvamKeyInput.trim());
      if (ok) {
        setSuccess('Sarvam AI Subscription Key verified and saved successfully! Saaras v3 active.');
        setSarvamKeyInput('');
      } else {
        setError('Sarvam AI verification failed. Please verify your api-subscription-key.');
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSarvamTesting(false);
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
            <div className="space-y-6">
              {/* Sarvam AI Subscription Key */}
              <form onSubmit={handleTestAndSaveSarvamKey} className="space-y-3 pb-5 border-b border-neutral-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                      <Mic className="w-3.5 h-3.5 text-amber-500" />
                      <span>Sarvam AI Key (Speech-to-Text &amp; Diarization)</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      {sarvamConfigured ? '✓ Active & Ready' : 'Key Required'}
                    </span>
                  </div>
                  <div className="relative">
                    <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="password"
                      value={sarvamKeyInput}
                      onChange={(e) => setSarvamKeyInput(e.target.value)}
                      placeholder={sarvamConfigured ? '•••••••••••••••• (Default Configured)' : 'sk_... (api-subscription-key)'}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:border-amber-400 focus:outline-hidden font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Saaras v3 Indian languages &amp; Hinglish diarized speech recognition (<a href="https://www.sarvam.ai/" target="_blank" rel="noreferrer" className="underline text-amber-600">sarvam.ai</a>).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={sarvamTesting || !sarvamKeyInput.trim()}
                  className="w-full py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-neutral-800"
                >
                  {sarvamTesting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <span>Testing Sarvam AI API...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-amber-400" />
                      <span>Save &amp; Test Sarvam AI Key</span>
                    </>
                  )}
                </button>
              </form>

              {/* Regulatory Compliance Audit Engine Key */}
              <form onSubmit={handleTestAndSaveAuditKey} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                      <Cpu className="w-3.5 h-3.5 text-amber-500" />
                      <span>Regulatory Audit Engine Key (GPT-OSS / Groq)</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      {groqConfigured ? '✓ Active & Ready' : 'Optional (Fallback Active)'}
                    </span>
                  </div>
                  <div className="relative">
                    <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={groqConfigured ? '•••••••••••••••• (Default Configured)' : 'gsk_...'}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:border-amber-400 focus:outline-hidden font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Powers GPT-OSS 120B SEBI regulatory compliance checking and non-negotiable verification.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={apiTesting || !apiKeyInput.trim()}
                  className="w-full py-2 bg-neutral-900 hover:bg-black text-amber-400 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-neutral-800"
                >
                  {apiTesting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <span>Testing Audit Engine API...</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="w-3.5 h-3.5 text-amber-400" />
                      <span>Save &amp; Test Audit Key</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
