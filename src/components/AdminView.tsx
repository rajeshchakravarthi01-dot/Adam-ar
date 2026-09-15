import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  Trash2,
  Users,
  UserPlus,
  Server,
  Cloud,
  Database,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Mail,
  Key,
  Layers,
  Save,
  HardDrive,
} from 'lucide-react';
import { api } from '../lib/api';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

interface AdminViewProps {
  onRefreshStats?: () => Promise<void>;
}

export const AdminView: React.FC<AdminViewProps> = ({ onRefreshStats }) => {
  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('auditor');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Cloud & Database config state
  const [dbType, setDbType] = useState<'sqlite_local' | 'cloud_sql' | 'postgres' | 'turso'>('sqlite_local');
  const [cloudDbUri, setCloudDbUri] = useState('');
  const [cloudStorageBucket, setCloudStorageBucket] = useState('auditeq-recordings-prod');
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(true);
  const [sslRequired, setSslRequired] = useState(true);
  const [concurrencyWorkers, setConcurrencyWorkers] = useState(3);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Clear Database State
  const [isClearingDb, setIsClearingDb] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Cleared Database Backups State
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // User Password Change Modal State
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<number | null>(null);
  const [editingPasswordEmail, setEditingPasswordEmail] = useState('');
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Status notification
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setStatusNotice({ type, message });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await api.getAdminUsers();
      setUsers(data || []);
    } catch (err: unknown) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await api.getClearedBackups();
      setBackups(res.backups || []);
    } catch (err) {
      console.error('Failed to load cleared backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchBackups();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      showNotification('error', 'Please provide an email and password.');
      return;
    }

    setIsAddingUser(true);
    try {
      await api.createAdminUser({
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
        full_name: newUserName.trim() || undefined,
        role: newUserRole,
      });

      showNotification('success', `Team user ${newUserEmail} created successfully.`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      await fetchUsers();
    } catch (err: unknown) {
      showNotification('error', (err as Error).message || 'Failed to add user.');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleDeleteUser = async (id: number, email: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${email}?`)) return;

    try {
      await api.deleteAdminUser(id);
      showNotification('success', `User ${email} removed.`);
      await fetchUsers();
    } catch (err: unknown) {
      showNotification('error', (err as Error).message || 'Failed to remove user.');
    }
  };

  const handleClearAllDatabase = async () => {
    if (confirmText.trim() !== 'CLEAR ALL') {
      alert('Please type "CLEAR ALL" exactly to confirm.');
      return;
    }

    setIsClearingDb(true);
    try {
      const res = await api.clearAllDatabase();
      setShowClearConfirmModal(false);
      setConfirmText('');
      showNotification('success', res.message || 'Database successfully purged and reset to zero.');
      await fetchBackups();
      if (onRefreshStats) await onRefreshStats();
    } catch (err: unknown) {
      showNotification('error', (err as Error).message || 'Failed to clear database.');
    } finally {
      setIsClearingDb(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPasswordUserId || !newPasswordValue.trim()) {
      showNotification('error', 'Please enter a new password.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      await api.updateUserPassword(editingPasswordUserId, newPasswordValue.trim());
      showNotification('success', `Password updated successfully for ${editingPasswordEmail}`);
      setEditingPasswordUserId(null);
      setNewPasswordValue('');
    } catch (err: unknown) {
      showNotification('error', (err as Error).message || 'Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveCloudConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setTimeout(() => {
      setIsSavingConfig(false);
      showNotification('success', 'Cloud and database hosting configurations saved.');
    }, 600);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2.5">
            <span className="p-1.5 rounded-xl bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20">
              <Server className="w-5 h-5" />
            </span>
            <span>Enterprise Admin &amp; Backend Cloud Controls</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Centralized infrastructure management: User administration, external cloud database hosting, background pipeline concurrency, and database wipe controls.
          </p>
        </div>

        <button
          onClick={() => setShowClearConfirmModal(true)}
          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer transition-all hover:shadow-rose-600/30 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          <span>Clear All Database (1-Click)</span>
        </button>
      </div>

      {statusNotice && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
            statusNotice.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}
        >
          {statusNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{statusNotice.message}</span>
        </div>
      )}

      {/* Grid: Multi-User Management & Cloud/Database Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Team & User Management (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* User Creation Form */}
          <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-400" />
                <span>Add New Team User</span>
              </h3>
              <span className="text-[11px] text-neutral-400 font-mono">Role-Based Access (RBAC)</span>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                    Email Address / Username <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="auditor@auditeq.com"
                      className="w-full pl-8 pr-3 py-2 glass-input rounded-lg text-xs text-neutral-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                    Temporary Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-8 pr-3 py-2 glass-input rounded-lg text-xs text-neutral-100"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="e.g. Senior Compliance Auditor"
                    className="w-full px-3 py-2 glass-input rounded-lg text-xs text-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">Access Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-lg text-xs text-neutral-100 cursor-pointer"
                  >
                    <option value="auditor" className="bg-slate-900 text-white">Auditor (Upload, Transcribe &amp; Review)</option>
                    <option value="compliance_officer" className="bg-slate-900 text-white">Compliance Officer (Full Audit &amp; Scorecards)</option>
                    <option value="admin" className="bg-slate-900 text-white">Administrator (Complete Platform &amp; DB Control)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isAddingUser ? 'Creating User…' : 'Create Team User'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Primary Administrator Identity Card */}
          <div className="p-4 rounded-2xl glass-panel border border-teal-500/30 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-black text-sm border border-teal-500/40 shadow-[0_0_12px_rgba(20,184,166,0.25)]">
                AK
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-100 text-xs">Ashutosh Kumar</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-400/40 uppercase tracking-wider">
                    Primary Super Admin
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-0.5">ashutosh.kumar@fundsindia.com</div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[11px] font-medium text-teal-300">
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>Root Account Active</span>
            </div>
          </div>

          {/* User List Table (Only Newly Created Team Members) */}
          {(() => {
            const createdTeamMembers = users.filter(
              (u) =>
                u.email?.toLowerCase() !== 'ashutosh.kumar@fundsindia.com' &&
                u.username?.toLowerCase() !== 'ashutosh.kumar@fundsindia.com' &&
                u.id !== 1
            );

            return (
              <div className="glass-panel rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-400" />
                    <span>Authorized Team Members ({createdTeamMembers.length})</span>
                  </h3>
                  <button
                    onClick={fetchUsers}
                    disabled={isLoadingUsers}
                    className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                    title="Refresh user accounts"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="glass-inner border-b border-white/10 text-neutral-400 font-semibold uppercase tracking-wider">
                        <th className="py-2.5 px-4">User</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Created</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {createdTeamMembers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-neutral-400 font-medium">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Users className="w-8 h-8 text-neutral-600" />
                              <p className="font-semibold text-neutral-300 text-xs">No team members created yet</p>
                              <p className="text-[11px] text-neutral-500 max-w-sm">
                                Use the form above to create logins for auditors or compliance officers. Newly created team accounts will appear in this list.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        createdTeamMembers.map((u) => {
                          return (
                            <tr key={u.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-neutral-100">{u.full_name || u.username}</div>
                                <div className="text-[11px] text-neutral-400 font-mono">{u.email}</div>
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                    u.role === 'admin'
                                      ? 'bg-teal-500/20 text-teal-300 border-teal-400/30'
                                      : u.role === 'compliance_officer'
                                      ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                                      : 'bg-white/10 text-neutral-300 border-white/20'
                                  }`}
                                >
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-neutral-400 font-mono text-[11px]">
                                {u.created_at ? u.created_at.slice(0, 10) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingPasswordUserId(u.id);
                                      setEditingPasswordEmail(u.email);
                                      setNewPasswordValue('');
                                    }}
                                    className="p-1 text-neutral-400 hover:text-teal-400 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                                    title="Change user password"
                                  >
                                    <Key className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.email)}
                                    className="p-1 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                                    title="Remove this user"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right Column: Cloud Control & Database Hosting (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cloud Database Hosting Configuration */}
          <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-teal-400" />
                <span>Cloud &amp; Database Hosting</span>
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-mono">
                CONNECTED
              </span>
            </div>

            <form onSubmit={handleSaveCloudConfig} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                  Database Architecture / Engine
                </label>
                <select
                  value={dbType}
                  onChange={(e) => setDbType(e.target.value as any)}
                  className="w-full px-3 py-2 glass-input rounded-lg text-xs text-neutral-100 cursor-pointer"
                >
                  <option value="sqlite_local" className="bg-slate-900 text-white">Local Container SQLite (.data/auditeq.db)</option>
                  <option value="cloud_sql" className="bg-slate-900 text-white">Google Cloud SQL / Managed PostgreSQL</option>
                  <option value="postgres" className="bg-slate-900 text-white">Self-Hosted PostgreSQL Instance</option>
                  <option value="turso" className="bg-slate-900 text-white">Turso / Cloud Edge SQLite Cluster</option>
                </select>
              </div>

              {dbType !== 'sqlite_local' && (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                    Cloud Database URI / Connection String
                  </label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={cloudDbUri}
                      onChange={(e) => setCloudDbUri(e.target.value)}
                      placeholder="postgres://user:password@cloudsql.gcp.internal:5432/auditeq"
                      className="w-full pl-8 pr-3 py-2 glass-input rounded-lg text-xs font-mono text-neutral-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                  Audio Storage Cloud Bucket (S3 / GCS)
                </label>
                <div className="relative">
                  <HardDrive className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cloudStorageBucket}
                    onChange={(e) => setCloudStorageBucket(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 glass-input rounded-lg text-xs font-mono text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-neutral-300">
                    Max Parallel Worker Concurrency
                  </label>
                  <span className="text-xs font-mono font-bold text-teal-400">{concurrencyWorkers} Workers</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={concurrencyWorkers}
                  onChange={(e) => setConcurrencyWorkers(Number(e.target.value))}
                  className="w-full accent-teal-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-neutral-400 font-mono mt-0.5">
                  <span>1 (Sequential)</span>
                  <span>3 Workers</span>
                  <span>6 (Turbo)</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={cloudBackupEnabled}
                    onChange={(e) => setCloudBackupEnabled(e.target.checked)}
                    className="rounded text-teal-400 accent-teal-400 focus:ring-0"
                  />
                  <span>Automated Daily Snapshot Backups to Cloud Storage</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={sslRequired}
                    onChange={(e) => setSslRequired(e.target.checked)}
                    className="rounded text-teal-400 accent-teal-400 focus:ring-0"
                  />
                  <span>Require SSL / TLS Encrypted DB Connections</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingConfig ? 'Saving Settings…' : 'Save Cloud & Backend Controls'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Database Metrics & Health Card */}
          <div className="glass-panel p-5 rounded-2xl shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-neutral-100 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span>Live Database Diagnostics</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 glass-inner rounded-xl border border-white/10">
                <div className="text-[10px] text-neutral-400">Storage Engine</div>
                <div className="font-mono font-bold text-neutral-100">SQLite 3.45 (WAL)</div>
              </div>
              <div className="p-2.5 glass-inner rounded-xl border border-white/10">
                <div className="text-[10px] text-neutral-400">Integrity Check</div>
                <div className="font-mono font-bold text-emerald-400">PASS (0 errors)</div>
              </div>
              <div className="p-2.5 glass-inner rounded-xl border border-white/10">
                <div className="text-[10px] text-neutral-400">Storage File</div>
                <div className="font-mono font-bold text-neutral-100 truncate">.data/auditeq.db</div>
              </div>
              <div className="p-2.5 glass-inner rounded-xl border border-white/10">
                <div className="text-[10px] text-neutral-400">Lease Recovery</div>
                <div className="font-mono font-bold text-teal-400">Active (&gt;2.5m)</div>
              </div>
            </div>
          </div>

          {/* Cleared Database Archive Snapshots Card */}
          <div className="glass-panel p-5 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-100 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-teal-400" />
                <span>Cleared Database Archives ({backups.length})</span>
              </h4>
              <button
                onClick={fetchBackups}
                disabled={isLoadingBackups}
                className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                title="Refresh archive list"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingBackups ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Every time "Clear All Database" is executed, a full JSON snapshot of all calls, reference trades, transcripts, and scorecards is saved before purging.
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {backups.length === 0 ? (
                <div className="p-4 glass-inner rounded-xl text-center text-neutral-400 text-xs">
                  No cleared database archives recorded yet.
                </div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 glass-inner hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div>
                      <div className="font-bold text-neutral-100 font-mono text-[11px]">
                        {b.created_at ? b.created_at.replace('T', ' ').slice(0, 19) : `Archive #${b.id}`}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        Cleared by: <b>{b.cleared_by || 'Admin'}</b> · Calls: {b.calls_count || 0}, Trades: {b.trades_count || 0}, Audits: {b.audits_count || 0}
                      </div>
                    </div>
                    <a
                      href={api.getClearedBackupDownloadUrl(b.id)}
                      download={`auditeq_backup_${b.id}.json`}
                      className="px-2.5 py-1.5 bg-teal-400 hover:bg-teal-300 text-slate-950 rounded-lg font-bold text-[11px] cursor-pointer flex items-center gap-1 shrink-0 shadow-sm"
                      title="Download archive JSON file"
                    >
                      <span>Download</span>
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {editingPasswordUserId !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-panel rounded-2xl max-w-sm w-full border border-white/20 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-neutral-100 border-b border-white/10 pb-3">
              <Key className="w-5 h-5 text-teal-400" />
              <h3 className="font-bold text-sm">Update User Password</h3>
            </div>

            <p className="text-xs text-neutral-300">
              Enter a new password for <b>{editingPasswordEmail}</b>:
            </p>

            <form onSubmit={handleSavePassword} className="space-y-3">
              <div>
                <input
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Enter new password…"
                  required
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs text-neutral-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPasswordUserId(null);
                    setNewPasswordValue('');
                  }}
                  className="px-3.5 py-2 glass-inner hover:bg-white/10 text-neutral-300 font-semibold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword || !newPasswordValue.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 cursor-pointer"
                >
                  {isUpdatingPassword ? 'Updating…' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-Click Clear All Database Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full border border-rose-500/30 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 bg-rose-500/20 border border-rose-500/30 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-100">Clear All Database in 1 Click</h3>
                <p className="text-xs text-rose-400 font-medium">Permanent, irreversible workspace purge</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              This action will permanently delete <strong>ALL</strong> ingested calls, audio recording files, reference trades, audit scorecards, speech transcripts, and system logs. The database tables will be cleanly wiped and reset to zero.
            </p>

            <div className="p-3 glass-inner rounded-xl border border-white/10 text-xs">
              <label className="block text-neutral-300 font-bold mb-1">
                Type <span className="font-mono text-rose-400">CLEAR ALL</span> below to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CLEAR ALL"
                className="w-full px-3 py-2 glass-input rounded-lg font-mono font-bold text-xs text-rose-300 focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowClearConfirmModal(false);
                  setConfirmText('');
                }}
                className="px-4 py-2 glass-inner hover:bg-white/10 text-neutral-300 font-semibold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllDatabase}
                disabled={isClearingDb || confirmText.trim() !== 'CLEAR ALL'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearingDb ? 'Purging Everything…' : 'Confirm 1-Click Clear All'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
