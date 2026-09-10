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
        body: JSON.stringify({ username: username.trim(), password }),
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
    <div className="min-h-screen bg-[#0d0d10] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background Subtle Geometry */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#facc15_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
      
      {/* Classy Yellow Subtle Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[300px] bg-amber-400/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400 shadow-xl shadow-amber-400/20 ring-4 ring-amber-400/20 mb-4 text-black">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-amber-400/30 text-[11px] font-bold tracking-wider uppercase text-amber-400 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Pre-Order Quality Audit Portal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            ADAM-<span className="text-amber-400">AR</span> Engine
          </h1>
          <p className="mt-1 text-xs text-neutral-400 font-medium">
            Pre-Order Call Verification &amp; Quality Audit System
          </p>
        </div>

        {/* Card */}
        <div className="mt-7 bg-[#16161a] py-8 px-6 shadow-2xl rounded-2xl border border-neutral-800 sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Error Notification */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold">{error}</p>
                </div>
              </div>
            )}

            {/* Success Notification */}
            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Email / Username Field */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-neutral-300 mb-1.5">
                Authorized Email / Username
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter authorized email or username"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-[#0e0e11] border border-neutral-700 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-400 transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-bold text-neutral-300">
                  Password
                </label>
                <span className="text-[11px] text-neutral-400 font-medium">Confidential Access</span>
              </div>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
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
                  className="block w-full pl-10 pr-10 py-2.5 bg-[#0e0e11] border border-neutral-700 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-neutral-200 cursor-pointer"
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
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl shadow-lg shadow-amber-400/10 text-sm font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer border border-amber-400"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
        <div className="mt-6 text-center space-y-1.5 text-neutral-400 text-xs">
          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Restricted Access: Authorized Quality Audit Officers Only</span>
          </div>
          <p className="text-[10px] text-neutral-500">
            Standard Pre-Order Verbal Confirmation Recording &amp; Quality Audit Compliant
          </p>
          <p className="text-[11px] text-neutral-400 font-medium pt-1">
            Developed and designed by <span className="text-amber-400 font-bold">TAJ</span>
          </p>
        </div>
      </div>
    </div>
  );
};
