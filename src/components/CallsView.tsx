import React, { useState, useMemo } from 'react';
import {
  Upload,
  PhoneCall,
  Play,
  FileAudio,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Volume2,
  X,
  ShieldCheck,
  Sparkles,
  Link,
  Layers,
  Download,
  Filter,
  RefreshCw,
  Tag,
  CheckSquare,
  Square,
  Check,
  Edit2,
  Trash2,
} from 'lucide-react';
import { getStoredToken, api } from '../lib/api';
import type { CallRecord } from '../types';
import { TranscriptHighlighter } from './TranscriptHighlighter';

interface CallsViewProps {
  calls: CallRecord[];
  onUploadCalls: (formData: FormData) => Promise<void>;
  onForceAudit: (callId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
}

type CallCategoryFilter = 'all' | 'pre_order' | 'regular' | 'scrap' | 'review';

export const CallsView: React.FC<CallsViewProps> = ({
  calls,
  onUploadCalls,
  onForceAudit,
  onRefresh,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CallCategoryFilter>('all');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [playingCall, setPlayingCall] = useState<CallRecord | null>(null);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploadMeta, setUploadMeta] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Review Workflow Resolution
  const [reviewNotes, setReviewNotes] = useState('');
  const [resolvedClassification, setResolvedClassification] = useState<'PRE_ORDER' | 'REGULAR' | 'SCRAP'>('PRE_ORDER');
  const [isResolvingReview, setIsResolvingReview] = useState(false);

  // Row selection for selective ZIP download
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());

  // Editing category manually
  const [editingCallId, setEditingCallId] = useState<number | null>(null);
  const [editCategoryVal, setEditCategoryVal] = useState<string>('pre_order');

  const handleOpenCallDetail = async (call: CallRecord) => {
    setSelectedCall(call);
    setReviewNotes('');
    setResolvedClassification('PRE_ORDER');
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/calls/${call.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const fullCall = await res.json();
        setSelectedCall(fullCall);
      }
    } catch {}
  };

  const handleResolveReview = async (callId: number, action: 'CONTINUE' | 'REJECT') => {
    setIsResolvingReview(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/calls/${callId}/resolve-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          resolved_classification: resolvedClassification,
          notes: reviewNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resolve review');
      }
      setActionNotice(`Call #${callId} review resolved: ${action === 'CONTINUE' ? 'Approved for audit' : 'Rejected'}.`);
      setTimeout(() => setActionNotice(null), 3500);

      // Refresh call detail
      if (selectedCall?.id === callId) {
        const refreshed = await fetch(`/api/calls/${callId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (refreshed.ok) {
          const fullCall = await refreshed.json();
          setSelectedCall(fullCall);
        }
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      alert(`Error resolving review: ${err.message}`);
    } finally {
      setIsResolvingReview(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) return;

    const fd = new FormData();
    for (let i = 0; i < uploadFiles.length; i++) {
      fd.append('files[]', uploadFiles[i], uploadFiles[i].name);
    }
    if (uploadMeta) {
      fd.append('metadata', uploadMeta, uploadMeta.name);
    }

    setIsUploading(true);
    setUploadStatus('Uploading recordings, extracting Caller ID from filenames, resolving metadata & trades...');
    try {
      await onUploadCalls(fd);
      setUploadStatus(`Upload completed successfully! Ingested calls and resolved metadata automatically.`);
      setUploadFiles(null);
      setUploadMeta(null);
      if (onRefresh) await onRefresh();
    } catch (err: unknown) {
      setUploadStatus(`Upload error: ${(err as Error).message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Re-classify all existing recordings
  const handleReclassifyAll = async () => {
    setIsReclassifying(true);
    try {
      const res = await api.reclassifyAllCalls();
      setActionNotice(res.message || `Reclassified ${res.updated} call(s).`);
      if (onRefresh) await onRefresh();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: unknown) {
      alert(`Re-classification failed: ${(err as Error).message}`);
    } finally {
      setIsReclassifying(false);
    }
  };

  // Trigger Filtered ZIP Download
  const handleDownloadZip = async (type: CallCategoryFilter = categoryFilter) => {
    setIsDownloadingZip(true);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (type !== 'all') params.append('type', type);
      if (search) params.append('search', search);

      // If user selected specific calls, pass their IDs
      if (selectedCallIds.size > 0) {
        params.append('ids', Array.from(selectedCallIds).join(','));
      }
      if (token) params.append('token', token);

      const url = `/api/calls/download-zip?${params.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'No recordings found for download.');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const catLabel = type === 'all' ? 'All' : type === 'pre_order' ? 'PreOrder' : type === 'regular' ? 'Regular' : 'Scrap';
      a.download = `AuditEQ_${catLabel}_Calls_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setActionNotice(`Downloaded ${catLabel} calls ZIP archive successfully.`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: unknown) {
      alert(`Download error: ${(err as Error).message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleUpdateCategory = async (callId: number) => {
    try {
      await api.updateCall(callId, { call_type: editCategoryVal as any });
      setEditingCallId(null);
      if (onRefresh) await onRefresh();
      setActionNotice(`Call #${callId} re-assigned to ${editCategoryVal.toUpperCase()}.`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: unknown) {
      alert(`Failed to update category: ${(err as Error).message}`);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteCall = async (callId: number, name: string) => {
    if (!window.confirm(`Delete call recording "${name}"? This removes its transcript, matches, and audit scorecard.`)) return;
    setIsDeleting(true);
    try {
      await api.deleteCall(callId);
      setActionNotice(`Call #${callId} deleted successfully.`);
      if (selectedCallIds.has(callId)) {
        selectedCallIds.delete(callId);
        setSelectedCallIds(new Set(selectedCallIds));
      }
      if (onRefresh) await onRefresh();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: unknown) {
      alert(`Failed to delete call: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCallIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedCallIds.size} selected call recording(s)?`)) return;
    setIsDeleting(true);
    try {
      const res = await api.bulkDeleteCalls({ ids: Array.from(selectedCallIds) });
      setSelectedCallIds(new Set());
      setActionNotice(res.message || `Deleted ${res.count} recording(s).`);
      if (onRefresh) await onRefresh();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: unknown) {
      alert(`Bulk delete failed: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllScrap = async () => {
    if (!window.confirm(`Delete all ${counts.scrap} short/scrap calls (< 6 seconds)?`)) return;
    setIsDeleting(true);
    try {
      const res = await api.bulkDeleteCalls({ type: 'scrap' });
      setActionNotice(res.message || 'Deleted all scrap calls.');
      if (onRefresh) await onRefresh();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: unknown) {
      alert(`Failed to delete scrap calls: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Categorization Counts
  const counts = useMemo(() => {
    let preOrder = 0;
    let regular = 0;
    let scrap = 0;
    let review = 0;

    calls.forEach((c) => {
      const dur = c.duration_seconds || 0;
      const isScrap = c.call_type === 'scrap' || (dur > 0 && dur < 6);
      const isReview = c.classification === 'REVIEW' || c.status === 'review' || c.pipeline_stage === 'REVIEW_PENDING';
      if (isScrap) {
        scrap++;
      } else if (isReview) {
        review++;
      } else if (c.call_type === 'pre_order') {
        preOrder++;
      } else {
        regular++;
      }
    });

    return { all: calls.length, preOrder, regular, scrap, review };
  }, [calls]);

  // Filtering
  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      // Category filter
      const dur = c.duration_seconds || 0;
      const isScrap = c.call_type === 'scrap' || (dur > 0 && dur < 6);
      const isReview = c.classification === 'REVIEW' || c.status === 'review' || c.pipeline_stage === 'REVIEW_PENDING';
      const isPreOrder = c.call_type === 'pre_order' && !isScrap && !isReview;
      const isRegular = !isScrap && !isPreOrder && !isReview;

      if (categoryFilter === 'review' && !isReview) return false;
      if (categoryFilter === 'pre_order' && !isPreOrder) return false;
      if (categoryFilter === 'regular' && !isRegular) return false;
      if (categoryFilter === 'scrap' && !isScrap) return false;

      // Text search
      if (search) {
        const q = search.toLowerCase();
        const matchesName = (c.recording_name || '').toLowerCase().includes(q);
        const matchesCaller = (c.caller_name || '').toLowerCase().includes(q);
        const matchesClient = (c.client || '').toLowerCase().includes(q);
        const matchesPhone = (c.calling_number || '').includes(q);
        const matchesTranscript = (c.transcript || '').toLowerCase().includes(q);
        const matchesEvidence = (c.preorder_evidence || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCaller && !matchesClient && !matchesPhone && !matchesTranscript && !matchesEvidence) {
          return false;
        }
      }

      return true;
    });
  }, [calls, categoryFilter, search]);

  const toggleSelectCall = (id: number) => {
    setSelectedCallIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCallIds.size === filteredCalls.length) {
      setSelectedCallIds(new Set());
    } else {
      setSelectedCallIds(new Set(filteredCalls.map((c) => c.id)));
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {actionNotice && (
        <div className="bg-amber-400 text-black px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Card - Classy Black & Yellow / Amber Theme */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-400 text-black">
                <Upload className="w-4 h-4" />
              </span>
              <span>Import Call Recordings &amp; Automated Categorization</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Upload bulk call audio (or ZIP archive where files are named by Caller ID) + metadata sheet. System classifies calls into Pre-Order, Regular, and Scrap (&le;6s) and correlates client trade details.
            </p>
          </div>
          <span className="text-[11px] font-semibold bg-amber-400/10 text-amber-900 px-3 py-1 rounded-full border border-amber-400/30 flex items-center gap-1.5 shrink-0 self-start">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>3-Category Ingestion Pipeline</span>
          </span>
        </div>

        {/* 3 Call Types Guidance Banner */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3.5 bg-neutral-950 text-neutral-200 rounded-xl border border-neutral-800 text-xs">
          <div className="border-l-2 border-amber-400 pl-3">
            <div className="font-bold text-amber-400 text-[11px] flex items-center gap-1">
              <span>1. Pre-Order Calls</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Advisor buying/selling stock. Audited against 5-point standard rubric.
            </p>
          </div>
          <div className="border-l-2 border-neutral-500 pl-3">
            <div className="font-bold text-neutral-200 text-[11px] flex items-center gap-1">
              <span>2. Regular Calls</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Market trends, portfolio advisory, general discussions, or issue resolution without trade execution.
            </p>
          </div>
          <div className="border-l-2 border-rose-500 pl-3">
            <div className="font-bold text-rose-400 text-[11px] flex items-center gap-1">
              <span>3. Scrap Calls (&le; 6s)</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Voicemails, ringing timeouts, and quick disconnects under 5-6 seconds duration.
            </p>
          </div>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl text-xs text-neutral-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>
                <strong>Automated Metadata &amp; Trade Resolution:</strong> Caller ID is derived from filenames. Advisor Name, Dealer ID, Team, Client Code/UCC, and Call Date are resolved automatically from metadata and trade records.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Audio Files Input */}
            <div className="p-4 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl hover:border-amber-400 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <FileAudio className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-neutral-900">Audio Files or Bulk ZIP Archive *</span>
              </div>
              <input
                type="file"
                accept=".zip,.mp3,.wav,.ogg,.m4a,.flac"
                multiple
                onChange={(e) => setUploadFiles(e.target.files)}
                className="w-full text-xs text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-black file:cursor-pointer cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400 mt-1.5">
                Upload raw audio files or a single .ZIP package. Filenames act as Caller IDs.
              </p>
            </div>

            {/* Companion Metadata Input */}
            <div className="p-4 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl hover:border-amber-400 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-neutral-900">Companion Metadata Spreadsheet (Optional)</span>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setUploadMeta(e.target.files?.[0] || null)}
                className="w-full text-xs text-neutral-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-black file:cursor-pointer cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400 mt-1.5">
                Contains Caller ID &rarr; Registered Client Number &rarr; Date &rarr; Duration correlation.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-neutral-500">
              {uploadFiles && uploadFiles.length > 0 ? (
                <span className="text-emerald-700 font-medium">
                  Ready to ingest {uploadFiles.length} file(s)
                  {uploadMeta ? ` + metadata (${uploadMeta.name})` : ''}
                </span>
              ) : (
                'Select audio recordings or ZIP archive to begin ingestion'
              )}
            </div>

            <button
              type="submit"
              disabled={isUploading || !uploadFiles || uploadFiles.length === 0}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Ingesting & Categorizing...' : 'Upload & Process Calls'}</span>
            </button>
          </div>

          {uploadStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-medium ${
                uploadStatus.includes('error') || uploadStatus.includes('Error')
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {uploadStatus}
            </div>
          )}
        </form>
      </div>

      {/* Audio Listening Bar */}
      {playingCall && (
        <div className="bg-neutral-900 text-white p-4 rounded-2xl border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold">
              <Volume2 className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Listening: {playingCall.recording_name}</span>
                <span className="text-[10px] font-mono text-amber-400">#{playingCall.id}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-amber-300 font-bold">
                  {playingCall.call_type === 'pre_order' ? 'Pre-Order' : playingCall.call_type === 'scrap' ? 'Scrap' : 'Regular'}
                </span>
              </div>
              <div className="text-[11px] text-neutral-400">
                Client ID: <span className="text-amber-400 font-mono font-bold">{playingCall.client || '—'}</span> · Advisor: {playingCall.caller_name || '—'} · Duration: {formatDuration(playingCall.duration_seconds)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <audio controls autoPlay src={getAudioUrl(playingCall.id)} className="h-9 w-full sm:w-80 rounded-md" />
            <button
              onClick={() => setPlayingCall(null)}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer"
              title="Close player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Categorization & Download Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-4">
        {/* Category Pills Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'all'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <span>All Recordings</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${categoryFilter === 'all' ? 'bg-neutral-700 text-neutral-200' : 'bg-neutral-200 text-neutral-700'}`}>
                {counts.all}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('pre_order')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'pre_order'
                  ? 'bg-amber-400 text-black shadow-xs'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Pre-Order Calls (Orders)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${categoryFilter === 'pre_order' ? 'bg-amber-500 text-black' : 'bg-amber-200 text-amber-900'}`}>
                {counts.preOrder}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('regular')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'regular'
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <span>Regular Calls (Advisory)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${categoryFilter === 'regular' ? 'bg-neutral-600 text-neutral-200' : 'bg-neutral-200 text-neutral-700'}`}>
                {counts.regular}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('scrap')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'scrap'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <span>Scrap Calls (&lt; 6s)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${categoryFilter === 'scrap' ? 'bg-rose-800 text-rose-100' : 'bg-rose-200 text-rose-800'}`}>
                {counts.scrap}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('review')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'review'
                  ? 'bg-amber-500 text-black shadow-xs'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review Required</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${categoryFilter === 'review' ? 'bg-black text-white' : 'bg-amber-200 text-amber-900'}`}>
                {counts.review}
              </span>
            </button>
          </div>

          {/* Action Buttons: ZIP Download & Re-classify */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleDownloadZip(categoryFilter)}
              disabled={isDownloadingZip || filteredCalls.length === 0}
              className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
              title="Download currently filtered recordings as a ZIP file"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {isDownloadingZip
                  ? 'Packaging ZIP...'
                  : selectedCallIds.size > 0
                  ? `Download Selected (${selectedCallIds.size}) in ZIP`
                  : `Download ${categoryFilter === 'all' ? 'All' : categoryFilter === 'pre_order' ? 'Pre-Order' : categoryFilter === 'regular' ? 'Regular' : 'Scrap'} in ZIP`}
              </span>
            </button>

            {selectedCallIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-rose-200 cursor-pointer transition-colors"
                title="Delete selected recordings from database and storage"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Selected ({selectedCallIds.size})</span>
              </button>
            )}

            {counts.scrap > 0 && (
              <button
                onClick={handleDeleteAllScrap}
                disabled={isDeleting}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-amber-300 cursor-pointer transition-colors"
                title="Purge all short scrap recordings (< 6 seconds)"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Purge Scrap ({counts.scrap})</span>
              </button>
            )}

            <button
              onClick={handleReclassifyAll}
              disabled={isReclassifying || calls.length === 0}
              className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-neutral-200 cursor-pointer disabled:opacity-40"
              title="Re-run categorization engine across all recordings"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-neutral-600 ${isReclassifying ? 'animate-spin' : ''}`} />
              <span>Re-classify All</span>
            </button>
          </div>
        </div>

        {/* Search Input & Select All Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-neutral-700 hover:text-black flex items-center gap-1.5 cursor-pointer"
            >
              {selectedCallIds.size > 0 && selectedCallIds.size === filteredCalls.length ? (
                <CheckSquare className="w-4 h-4 text-amber-500" />
              ) : (
                <Square className="w-4 h-4 text-neutral-400" />
              )}
              <span>Select All Filtered ({filteredCalls.length})</span>
            </button>
            {selectedCallIds.size > 0 && (
              <span className="text-[11px] font-mono text-amber-600 font-bold">
                {selectedCallIds.size} Selected
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recordings, transcripts, clients…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#111115] text-neutral-200 font-semibold border-b border-neutral-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-8">
                  <span className="sr-only">Select</span>
                </th>
                <th className="py-2.5 px-3 text-amber-400">ID</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Recording Name</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Caller / Advisor</th>
                <th className="py-2.5 px-3">Client Code</th>
                <th className="py-2.5 px-3">Phone Number</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Classification Reason</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-neutral-400">
                    No recordings found matching "{categoryFilter.toUpperCase()}". Upload files above or adjust filters.
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => {
                  const isSelected = selectedCallIds.has(call.id);
                  const dur = call.duration_seconds || 0;
                  const isShortScrap = call.call_type === 'scrap' || (dur > 0 && dur < 6);
                  const isPreOrder = call.call_type === 'pre_order';
                  const isEditingThis = editingCallId === call.id;

                  return (
                    <tr
                      key={call.id}
                      className={`transition-colors ${isSelected ? 'bg-amber-50/60' : 'hover:bg-neutral-50/50'}`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => toggleSelectCall(call.id)}
                          className="text-neutral-400 hover:text-black cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* ID & Listen */}
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-700 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPlayingCall(call)}
                            className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-200 rounded-sm cursor-pointer"
                            title="Play call recording"
                          >
                            <Play className="w-3.5 h-3.5 fill-current text-amber-500" />
                          </button>
                          <span>#{call.id}</span>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={editCategoryVal}
                              onChange={(e) => setEditCategoryVal(e.target.value)}
                              className="text-xs font-bold px-1.5 py-0.5 border rounded-sm bg-white"
                            >
                              <option value="pre_order">Pre-Order</option>
                              <option value="regular">Regular</option>
                              <option value="scrap">Scrap</option>
                            </select>
                            <button
                              onClick={() => handleUpdateCategory(call.id)}
                              className="p-1 bg-amber-400 text-black rounded-sm cursor-pointer"
                              title="Save category"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingCallId(null)}
                              className="p-1 text-neutral-500 hover:text-black cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {call.classification === 'REVIEW' || call.status === 'review' || call.pipeline_stage === 'REVIEW_PENDING' ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-400">
                                Review Required
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                  isPreOrder
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : isShortScrap
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                                }`}
                              >
                                {isPreOrder ? 'Pre-Order' : isShortScrap ? 'Scrap Call' : 'Regular Call'}
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setEditingCallId(call.id);
                                setEditCategoryVal(call.call_type || 'regular');
                              }}
                              className="text-neutral-400 hover:text-black p-0.5 cursor-pointer opacity-40 hover:opacity-100"
                              title="Change call category"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Recording Name */}
                      <td className="py-2.5 px-3 font-medium text-neutral-900 max-w-[200px] truncate" title={call.recording_name}>
                        {call.recording_name}
                      </td>

                      {/* Duration */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`font-mono text-xs ${
                            isShortScrap ? 'text-rose-600 font-bold' : 'text-neutral-700'
                          }`}
                        >
                          {formatDuration(call.duration_seconds)}
                          {isShortScrap && <span className="ml-1 text-[10px] text-rose-500 font-sans">(&le;6s)</span>}
                        </span>
                      </td>

                      {/* Caller */}
                      <td className="py-2.5 px-3 text-neutral-800 whitespace-nowrap">
                        {call.caller_name || '—'}
                      </td>

                      {/* Client Code */}
                      <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 whitespace-nowrap">
                        {call.client || '—'}
                      </td>

                      {/* Phone Number */}
                      <td className="py-2.5 px-3 font-mono text-neutral-700 whitespace-nowrap">
                        {call.calling_number || call.phone_number || '—'}
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-3 text-neutral-600 whitespace-nowrap">
                        {call.call_date || (call.created_at ? call.created_at.slice(0, 10) : '—')}
                      </td>

                      {/* Classification Evidence / Reason */}
                      <td className="py-2.5 px-3 max-w-[240px] truncate text-neutral-600" title={call.preorder_evidence || ''}>
                        {call.preorder_evidence || (isPreOrder ? 'Order confirmation detected' : isShortScrap ? 'Duration < 6s' : 'Advisory / Market discussion')}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {(call.classification === 'REVIEW' || call.status === 'review' || call.pipeline_stage === 'REVIEW_PENDING') && (
                            <button
                              onClick={() => handleOpenCallDetail(call)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-[11px] rounded-md transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Resolve compliance review"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>Resolve</span>
                            </button>
                          )}
                          {isPreOrder && (
                            <button
                              onClick={() => onForceAudit(call.id)}
                              className="px-2 py-1 bg-amber-400 hover:bg-amber-500 text-black font-bold text-[11px] rounded-md transition-colors cursor-pointer"
                              title="Run immediate pre-order quality audit"
                            >
                              Audit
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenCallDetail(call)}
                            className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-200 rounded-md cursor-pointer"
                            title="View speech transcript and detail"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCall(call.id, call.recording_name)}
                            className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                            title="Delete this call recording"
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

      {/* Detail Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-neutral-300 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <span className="p-1 rounded-md bg-amber-400 text-black">
                    <PhoneCall className="w-4 h-4" />
                  </span>
                  <span>Recording #{selectedCall.id} Detail</span>
                </h3>
                <p className="text-xs text-neutral-500">{selectedCall.recording_name}</p>
              </div>
              <button
                onClick={() => setSelectedCall(null)}
                className="p-1.5 text-neutral-400 hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
              <div>
                <span className="text-neutral-500">Category:</span>
                <span className="font-bold text-neutral-900 ml-1.5 uppercase">
                  {selectedCall.call_type || 'Regular'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Duration:</span>
                <span className="font-mono font-bold text-neutral-900 ml-1.5">
                  {formatDuration(selectedCall.duration_seconds)}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Advisor:</span>
                <span className="font-medium text-neutral-900 ml-1.5">{selectedCall.caller_name || '—'}</span>
              </div>
              <div>
                <span className="text-neutral-500">Client Code:</span>
                <span className="font-mono font-bold text-neutral-900 ml-1.5">{selectedCall.client || '—'}</span>
              </div>
              <div>
                <span className="text-neutral-500">Calling CLI:</span>
                <span className="font-mono text-neutral-900 ml-1.5">{selectedCall.calling_number || '—'}</span>
              </div>
              <div>
                <span className="text-neutral-500">Registered No:</span>
                <span className="font-mono text-neutral-900 ml-1.5">{selectedCall.registered_number || '—'}</span>
              </div>
            </div>

            {/* Pipeline Stage, Gate & Diagnostics */}
            <div className="p-3 bg-neutral-900 text-white rounded-xl border border-neutral-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                  Pipeline Stage &amp; Diagnostic Telemetry
                </span>
                <span className="px-2 py-0.5 rounded bg-neutral-800 font-mono text-[10px] text-neutral-300">
                  Gate: {selectedCall.current_gate || 'N/A'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-neutral-400 block text-[10px]">Stage:</span>
                  <span className="font-mono font-semibold text-neutral-100">{selectedCall.pipeline_stage || 'IN_PROGRESS'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Audit Status:</span>
                  <span className="font-mono font-semibold text-neutral-100">{selectedCall.audit_status || 'PENDING'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Processing:</span>
                  <span className="font-mono font-semibold text-neutral-100">{selectedCall.processing_status || 'IDLE'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Retry Count:</span>
                  <span className="font-mono font-semibold text-neutral-100">{selectedCall.retry_count || 0}</span>
                </div>
              </div>
              {(selectedCall.gate_reason || selectedCall.failure_reason) && (
                <div className="pt-1 border-t border-neutral-800 text-[11px] text-neutral-300">
                  <span className="text-neutral-400">Gate Reason: </span>
                  <span>{selectedCall.gate_reason || selectedCall.failure_reason}</span>
                </div>
              )}
            </div>

            {/* Human-in-the-Loop Review Resolution Workflow */}
            {(selectedCall.classification === 'REVIEW' || selectedCall.status === 'review' || selectedCall.pipeline_stage === 'REVIEW_PENDING') && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Compliance Review Required (REVIEW_PENDING)
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-bold rounded-full">
                    Awaiting Officer Decision
                  </span>
                </div>

                <p className="text-xs text-amber-900">
                  Order intent was marked ambiguous during automatic intent classification. Review the transcript below and specify resolution.
                </p>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-800">Target Category:</label>
                    <select
                      value={resolvedClassification}
                      onChange={(e) => setResolvedClassification(e.target.value as any)}
                      className="text-xs font-bold px-2 py-1 border border-neutral-300 rounded-md bg-white"
                    >
                      <option value="PRE_ORDER">PRE_ORDER (Spoken order instruction)</option>
                      <option value="REGULAR">REGULAR (Advisory / Query only)</option>
                      <option value="SCRAP">SCRAP (Non-actionable / noise)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-800 block mb-1">Compliance Notes:</label>
                    <input
                      type="text"
                      placeholder="e.g., Confirmed client instructed buy order at 01:23; proceeding to audit."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 border border-neutral-300 rounded-lg bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleResolveReview(selectedCall.id, 'CONTINUE')}
                      disabled={isResolvingReview}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isResolvingReview ? 'Resolving...' : 'Approve & Continue Audit'}</span>
                    </button>
                    <button
                      onClick={() => handleResolveReview(selectedCall.id, 'REJECT')}
                      disabled={isResolvingReview}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <X className="w-4 h-4" />
                      <span>{isResolvingReview ? 'Resolving...' : 'Reject & Exclude'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Previous Review Resolution History */}
            {selectedCall.review_resolution && (
              <div className="p-3 bg-neutral-100 border border-neutral-300 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800">Human Resolution History:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedCall.review_resolution === 'CONTINUED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {selectedCall.review_resolution}
                  </span>
                </div>
                {selectedCall.review_resolution_notes && (
                  <p className="text-neutral-700 text-[11px]">Notes: "{selectedCall.review_resolution_notes}"</p>
                )}
                {selectedCall.review_resolved_at && (
                  <p className="text-neutral-400 text-[10px]">Resolved at: {selectedCall.review_resolved_at}</p>
                )}
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1.5">
                Classification Reason
              </h4>
              <p className="text-xs p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800">
                {selectedCall.preorder_evidence || 'Standard advisory discussion detected.'}
              </p>
            </div>

            {/* SEBI Hierarchical Correlation: Orders & Executions */}
            {selectedCall.orders && selectedCall.orders.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center justify-between">
                  <span>Extracted Call Orders ({selectedCall.orders.length})</span>
                  <span className="text-[10px] font-normal text-neutral-500">
                    1 Call → Multiple Orders &amp; Executions
                  </span>
                </h4>
                <div className="space-y-2">
                  {selectedCall.orders.map((order, idx) => {
                    const orderExecs = (selectedCall.executions || []).filter((e) => e.order_id === order.id);
                    const totalFilled = orderExecs.reduce((acc, curr) => acc + curr.matched_quantity, 0);
                    const isFullyFilled = order.quantity != null && totalFilled >= order.quantity;
                    return (
                      <div key={order.id || idx} className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.intent_type === 'SELL' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {order.intent_type}
                            </span>
                            <span className="font-bold text-neutral-900">{order.symbol || 'Stock'}</span>
                            <span className="text-neutral-500">Qty: {order.quantity || '—'}</span>
                            <span className="text-neutral-500">Price: {order.price_type === 'CMP' ? 'CMP' : (order.limit_price ? `₹${order.limit_price}` : 'Market')}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isFullyFilled ? 'bg-emerald-100 text-emerald-800' : totalFilled > 0 ? 'bg-amber-100 text-amber-800' : 'bg-neutral-200 text-neutral-700'
                          }`}>
                            {isFullyFilled ? 'FULLY EXECUTED' : totalFilled > 0 ? `PARTIAL (${totalFilled}/${order.quantity || '?'})` : 'UNMATCHED'}
                          </span>
                        </div>

                        {orderExecs.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1">
                            <div className="text-[10px] font-bold text-neutral-600">
                              Linked Executions ({orderExecs.length}):
                            </div>
                            {orderExecs.map((exec, eIdx) => (
                              <div key={exec.id || eIdx} className="flex items-center justify-between text-[11px] bg-white p-2 rounded border border-neutral-200">
                                <span className="font-mono text-neutral-700">
                                  Trade #{exec.trade_id}: {exec.matched_quantity} shares @ ₹{exec.trade_price || '—'}
                                </span>
                                <span className="text-neutral-500">
                                  {exec.trade_time ? `${exec.trade_date || ''} ${exec.trade_time}` : 'Executed'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1.5">
                Spoken Speech Transcript &amp; Speaker Diarization
              </h4>
              <div className="p-3 bg-neutral-950 text-neutral-200 text-xs rounded-xl border border-neutral-800">
                <TranscriptHighlighter
                  transcript={selectedCall.transcript || ''}
                  clientCode={selectedCall.client}
                  advisorName={selectedCall.caller_name || selectedCall.dealer}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCall(null)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-900 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
