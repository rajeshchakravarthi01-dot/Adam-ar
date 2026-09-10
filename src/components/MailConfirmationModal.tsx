import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  FileCode,
  Layers,
  ArrowRight,
  RefreshCw,
  FileCheck,
  Info,
} from 'lucide-react';
import { api } from '../lib/api';
import type { MissingCallTrade } from '../types';

interface MailConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchesCompleted: (results: any[], summary: any) => void;
  pendingTradesCount: number;
  candidateTrades: MissingCallTrade[];
}

export const MailConfirmationModal: React.FC<MailConfirmationModalProps> = ({
  isOpen,
  onClose,
  onMatchesCompleted,
  pendingTradesCount,
  candidateTrades,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedMails, setPastedMails] = useState<Array<{ fileName: string; content: string }>>([]);
  const [pasteInput, setPasteInput] = useState('');
  const [pasteFileName, setPasteFileName] = useState('');
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<{
    total_files: number;
    matched_count: number;
    unmatched_count: number;
    remaining_unconfirmed_count: number;
    results: any[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setErrorMessage(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...droppedFiles]);
      setErrorMessage(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddPastedMail = () => {
    if (!pasteInput.trim()) return;
    const name = pasteFileName.trim() || `email_conversation_${pastedMails.length + 1}.txt`;
    setPastedMails((prev) => [...prev, { fileName: name, content: pasteInput }]);
    setPasteInput('');
    setPasteFileName('');
    setErrorMessage(null);
  };

  const removePastedMail = (index: number) => {
    setPastedMails((prev) => prev.filter((_, i) => i !== index));
  };

  const totalFilesCount = selectedFiles.length + pastedMails.length;

  const handleStartMatching = async () => {
    if (totalFilesCount === 0) {
      setErrorMessage('Please select or paste at least one mail confirmation file.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // If we have selected files, read them into memory or send via FormData
      const mailObjects: Array<{ fileName: string; content: string }> = [...pastedMails];

      for (const file of selectedFiles) {
        const text = await file.text();
        mailObjects.push({
          fileName: file.name,
          content: text,
        });
      }

      const res = await api.matchMailConfirmationFiles({ mails: mailObjects });

      if (res.ok) {
        setResultsData({
          total_files: res.total_files,
          matched_count: res.matched_count,
          unmatched_count: res.unmatched_count,
          remaining_unconfirmed_count: res.remaining_unconfirmed_count,
          results: res.results || [],
        });
        onMatchesCompleted(res.results || [], {
          total_files: res.total_files,
          matched_count: res.matched_count,
          unmatched_count: res.unmatched_count,
          remaining_unconfirmed_count: res.remaining_unconfirmed_count,
        });
      } else {
        setErrorMessage(res.message || 'Matching failed. Please check files and try again.');
      }
    } catch (err: any) {
      console.error('Mail confirmation matching error:', err);
      setErrorMessage(err.message || 'Failed to process mail confirmations.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinish = () => {
    setResultsData(null);
    setSelectedFiles([]);
    setPastedMails([]);
    onClose();
  };

  return (
    <div
      id="mail-confirmation-modal-overlay"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        id="mail-confirmation-modal-container"
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400 text-black">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Batch Mail Confirmation Matching
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Stringent Audit Engine
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Upload client-advisor mail conversations. The system strictly matches Stock, Quantity, and Price (ignores price if CMP is specified).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* If Results are ready, show Results Summary */}
          {resultsData ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">
                    Audit Verification & Matching Complete!
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    <strong>{resultsData.matched_count}</strong> trade confirmations successfully matched and audited with regulatory 5/5 scorecards.
                    These trades have been <strong>automatically removed</strong> from your pending missing list.
                  </p>
                </div>
              </div>

              {/* KPI metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-center">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase">Mails Processed</div>
                  <div className="text-lg font-bold text-neutral-900 mt-0.5">{resultsData.total_files}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center">
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase">Matched & Audited</div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{resultsData.matched_count}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-center">
                  <div className="text-[10px] font-semibold text-amber-700 uppercase">Unmatched Mails</div>
                  <div className="text-lg font-bold text-amber-700 mt-0.5">{resultsData.unmatched_count}</div>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-center">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase">Remaining Pending</div>
                  <div className="text-lg font-bold text-neutral-900 mt-0.5">{resultsData.remaining_unconfirmed_count}</div>
                </div>
              </div>

              {/* Detailed Matching Cards */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Verification Breakdown per Mail File
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {resultsData.results.map((r, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border transition-all ${
                        r.matched
                          ? 'bg-emerald-50/50 border-emerald-300'
                          : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1.5 rounded-lg ${
                              r.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </span>
                          <span className="font-mono text-xs font-bold text-neutral-900">{r.fileName}</span>
                        </div>

                        {r.matched ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                              ✓ Matched Trade #{r.tradeId}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-neutral-900 text-amber-400">
                              Scorecard #{r.scorecardId}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                            Unmatched (No Trade Found)
                          </span>
                        )}
                      </div>

                      {r.matched && r.trade && (
                        <div className="mt-2.5 pt-2.5 border-t border-emerald-200 text-xs text-neutral-800 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 font-mono">
                            <span className="px-1.5 py-0.5 bg-neutral-200 rounded text-[11px] font-bold text-neutral-900">
                              {r.trade.symbol}
                            </span>
                            <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[11px] text-neutral-800">
                              Qty: {r.trade.quantity}
                            </span>
                            <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[11px] text-neutral-800">
                              Price: {r.evidence?.price?.isCMP ? 'CMP (Current Market Price)' : `₹${r.trade.price}`}
                            </span>
                            <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[11px] text-neutral-700">
                              Client: {r.trade.client}
                            </span>
                            <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[11px] text-neutral-700">
                              Advisor: {r.trade.advisor_name || r.trade.dealer}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 text-[11px]">
                            <div className="bg-white/80 p-1.5 rounded border border-emerald-200 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">Stock: {r.evidence?.stock?.symbol}</span>
                            </div>
                            <div className="bg-white/80 p-1.5 rounded border border-emerald-200 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">Quantity: {r.evidence?.quantity?.quantity}</span>
                            </div>
                            <div className="bg-white/80 p-1.5 rounded border border-emerald-200 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">
                                {r.evidence?.price?.isCMP ? 'Price: CMP Ignored ✓' : `Price: ₹${r.evidence?.price?.price}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {!r.matched && (
                        <div className="mt-2 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          {r.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Upload & Configuration View */
            <div className="space-y-4">
              {/* Stringent Rule Specification Banner */}
              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-neutral-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Stringent Verification Criteria (SEBI Circular Compliant)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="bg-white p-2 rounded-lg border border-neutral-200">
                    <span className="font-bold text-neutral-900 block">1. Stock Name / Symbol</span>
                    <span className="text-[11px] text-neutral-500">
                      Matches security ticker or recognized company alias.
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-neutral-200">
                    <span className="font-bold text-neutral-900 block">2. Exact Quantity</span>
                    <span className="text-[11px] text-neutral-500">
                      Matches exact executed shares count with trade context.
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-neutral-200">
                    <span className="font-bold text-neutral-900 block">3. Price / CMP Rule</span>
                    <span className="text-[11px] text-neutral-500">
                      Matches execution price, or <strong>ignored if CMP is mentioned</strong>.
                    </span>
                  </div>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center justify-between">
                <div className="inline-flex p-1 bg-neutral-100 rounded-xl">
                  <button
                    onClick={() => setMode('upload')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      mode === 'upload' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Upload Multiple Files ({selectedFiles.length})
                  </button>
                  <button
                    onClick={() => setMode('paste')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      mode === 'paste' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Paste Conversation ({pastedMails.length})
                  </button>
                </div>
              </div>

              {/* Upload Mode View */}
              {mode === 'upload' && (
                <div className="space-y-3">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-amber-500 bg-amber-50/50'
                        : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50/50 hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.eml,.msg,.html,.log,.csv,text/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-white shadow-xs border border-neutral-200 flex items-center justify-center text-neutral-600 mb-3">
                      <Upload className="w-5 h-5 text-neutral-700" />
                    </div>
                    <div className="font-bold text-sm text-neutral-900">
                      Click to browse or drag & drop multiple mail confirmation files
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Supports plain text (.txt), email exports (.eml, .msg), chat logs, and conversation threads.
                    </p>
                  </div>

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      <div className="text-xs font-bold text-neutral-700">
                        Selected Files ({selectedFiles.length}):
                      </div>
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCode className="w-4 h-4 text-neutral-500 shrink-0" />
                            <span className="font-mono text-neutral-800 truncate">{file.name}</span>
                            <span className="text-neutral-400 text-[11px]">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(idx);
                            }}
                            className="text-neutral-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Paste Mode View */}
              {mode === 'paste' && (
                <div className="space-y-3">
                  <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={pasteFileName}
                        onChange={(e) => setPasteFileName(e.target.value)}
                        placeholder="File / Email Label (e.g. client_mail_infy.txt)"
                        className="flex-1 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>
                    <textarea
                      rows={5}
                      value={pasteInput}
                      onChange={(e) => setPasteInput(e.target.value)}
                      placeholder="Paste email conversation text here (e.g. 'Please buy 100 shares of INFY at CMP for client account CL9021...')"
                      className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-amber-400"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddPastedMail}
                        disabled={!pasteInput.trim()}
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                      >
                        + Add This Conversation to Batch
                      </button>
                    </div>
                  </div>

                  {/* Pasted Mails Queue */}
                  {pastedMails.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      <div className="text-xs font-bold text-neutral-700">
                        Queued Conversations ({pastedMails.length}):
                      </div>
                      {pastedMails.map((mail, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="font-mono text-neutral-800 truncate">{mail.fileName}</span>
                            <span className="text-neutral-400 text-[11px]">
                              ({mail.content.length} chars)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePastedMail(idx)}
                            className="text-neutral-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Status Summary Banner */}
              <div className="flex items-center justify-between text-xs text-neutral-600 bg-neutral-50 px-3.5 py-2.5 rounded-xl border border-neutral-200">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-neutral-500" />
                  <span>
                    Pending unconfirmed trades in queue:{' '}
                    <strong className="text-neutral-900">{pendingTradesCount}</strong>
                  </span>
                </div>
                <div>
                  Total mail files to match: <strong className="text-amber-700">{totalFilesCount}</strong>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          {resultsData ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-neutral-500">
                Matched trades were removed from the pending missing list.
              </span>
              <button
                type="button"
                onClick={handleFinish}
                className="px-5 py-2.5 bg-neutral-900 hover:bg-black text-amber-400 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Done & View Remaining Trades
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleStartMatching}
                disabled={isProcessing || totalFilesCount === 0}
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-black font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Matching Stock, Qty & Price/CMP...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 text-black" />
                    <span>Analyze & Match {totalFilesCount > 0 ? `(${totalFilesCount} Files)` : ''}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
