import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import type { UserProfile } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile, token: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your authorized email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

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
        throw new Error(data.error || 'Authentication failed. Please verify your email and password.');
      }

      localStorage.setItem('auditeq_auth_token', data.token);
      setSuccess(`Authenticated as ${data.user.full_name || data.user.email || data.user.username}`);
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
      }, 400);
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen ambient-mesh-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* 3D Liquid Light Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-teal-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[250px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 shadow-[0_0_30px_rgba(20,184,166,0.4)] border border-teal-300/40 mb-4 text-slate-950">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/70 border border-teal-500/30 text-[11px] font-bold tracking-wider uppercase text-teal-300 mb-2 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Quality Audit Portal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            ADAM-<span className="text-teal-400">AR</span> <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">v1.1</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 font-medium">
            Pre-Order Voice &amp; Regulatory Quality Audit Engine
          </p>
        </div>

        {/* Liquid Glass Card */}
        <div className="mt-7 glass-panel py-8 px-6 sm:px-10 rounded-3xl">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Error Notification */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold">{error}</p>
                </div>
              </div>
            )}

            {/* Success Notification */}
            {success && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Email / Username Field */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-slate-300 mb-1.5">
                Authorized Email / Username
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-teal-500/25 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-bold text-slate-300">
                  Password
                </label>
                <span className="text-[11px] text-teal-400/80 font-medium">Confidential</span>
              </div>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-teal-500/25 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-teal-300 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-[0_4px_20px_rgba(20,184,166,0.35)] text-sm font-black text-slate-950 bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-500 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer border border-teal-300/40"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to ADAM-AR</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Regulatory Notice */}
        <div className="mt-6 text-center space-y-1 text-slate-400 text-xs">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
            <span>Authorized Quality Audit Personnel Only</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium pt-1">
            Developed and designed by <span className="text-teal-300 font-bold">TAJ</span>
          </p>
        </div>
      </div>
    </div>
  );
};
