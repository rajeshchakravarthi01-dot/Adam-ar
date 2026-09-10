// =============================================================
// AuditEQ — Standardized Matching & Normalization Module
// Single Source of Truth for Phone & Client-Code Normalization
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { KNOWN_BROKER_PREFIXES, PRICE_INDEX_CONTEXT_WORDS } from './constants';
import type { CallRecord, TradeRecord } from '../../src/types';

/**
 * Normalizes phone numbers to a canonical 10-digit format (Indian mobile/landline).
 * Rules:
 * - Strips any non-digit characters
 * - Strips country code 91 prefix (12 digits starting with 91 -> last 10 digits)
 * - Strips leading 0 (11 digits starting with 0 -> last 10 digits)
 * - Returns exactly 10 digits if valid, otherwise empty string.
 */
export function normalizeCanonicalPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes client codes to canonical uppercase alphanumeric string.
 * Rules:
 * - Strips all spaces, hyphens, dots, underscores
 * - Converts to uppercase
 */
export function normalizeCanonicalClientCode(clientCode?: string | null): string {
  if (!clientCode) return '';
  return String(clientCode).replace(/[\s\-_.]/g, '').toUpperCase();
}

/**
 * Computes Levenshtein distance between two strings
 */
export function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) row[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let prev = j;
    for (let i = 1; i <= a.length; i++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[i - 1];
      } else {
        val = Math.min(row[i - 1] + 1, prev + 1, row[i] + 1);
      }
      row[i - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }

  return row[a.length];
}

/**
 * Computes similarity ratio (0.0 to 1.0) between two strings
 */
export function computeSimilarityRatio(a: string, b: string): number {
  const normA = normalizeCanonicalClientCode(a);
  const normB = normalizeCanonicalClientCode(b);
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  const dist = computeLevenshteinDistance(normA, normB);
  return 1 - dist / maxLen;
}

/**
 * Retrieves valid broker prefixes from trade records in DB, supplemented by known broker prefixes.
 */
export function getValidBrokerPrefixes(db?: DatabaseSync): string[] {
  const prefixes = new Set<string>(KNOWN_BROKER_PREFIXES);
  if (db) {
    try {
      const rows = db.prepare('SELECT DISTINCT client FROM trades WHERE client IS NOT NULL').all() as { client: string }[];
      for (const r of rows) {
        if (!r.client) continue;
        const norm = normalizeCanonicalClientCode(r.client);
        const prefixMatch = norm.match(/^([A-Z]{2,4})/);
        if (prefixMatch) {
          prefixes.add(prefixMatch[1]);
        }
      }
    } catch {}
  }
  return Array.from(prefixes);
}

/**
 * Safely extracts client codes from text without falsely matching price / index levels.
 * Excludes matches immediately preceded by price / index words ("at", "cmp", "level", etc.).
 */
export function extractClientCodesFromText(
  text: string,
  validPrefixes?: string[]
): string[] {
  if (!text || !text.trim()) return [];

  const prefixes = validPrefixes && validPrefixes.length > 0 ? validPrefixes : Array.from(KNOWN_BROKER_PREFIXES);
  const prefixPattern = prefixes.join('|');
  // Match broker prefix followed by 3 to 7 digits
  const regex = new RegExp(`\\b(${prefixPattern})[\\s\\-_.]*([0-9]{3,7})\\b`, 'gi');

  const matches: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    const fullMatch = m[0];
    const matchIndex = m.index;
    const prefix = m[1].toUpperCase();
    const digits = m[2];

    // Check preceding text (up to 20 chars prior) to ensure it's not a price/index context
    const precedingText = text.slice(Math.max(0, matchIndex - 20), matchIndex).trim().toLowerCase();
    const lastWord = precedingText.split(/\s+/).pop() || '';

    const isPriceContext = PRICE_INDEX_CONTEXT_WORDS.includes(lastWord as any) ||
      /\b(?:at|to|touches|touch|level|levels|points|cmp|target|nifty|rate|bhav|pe|@)$/i.test(precedingText);

    if (isPriceContext) {
      // This is a price/index mention (e.g. "at 24400" or "level 24500"), not a client UCC
      continue;
    }

    matches.push(`${prefix}${digits}`);
  }

  return matches;
}

/**
 * Tolerant fuzzy matching against registered client code (~90% similarity).
 * ASR near-misses (e.g. WAI 1234, WAS1234 vs WIA1234) must PASS.
 * Only fail when code is genuinely different or conflicting.
 */
export function matchClientCodeFuzzy(
  spokenOrCandidate: string,
  registeredCode: string,
  threshold = 0.85
): { matched: boolean; similarity: number; reason: string } {
  const normSpoken = normalizeCanonicalClientCode(spokenOrCandidate);
  const normRegistered = normalizeCanonicalClientCode(registeredCode);

  if (!normRegistered) {
    return { matched: false, similarity: 0, reason: 'Registered client code is empty.' };
  }
  if (!normSpoken) {
    return { matched: false, similarity: 0, reason: 'Spoken client code candidate is empty.' };
  }

  // Exact match
  if (normSpoken === normRegistered) {
    return { matched: true, similarity: 1.0, reason: `Exact match: ${normRegistered}` };
  }

  const similarity = computeSimilarityRatio(normSpoken, normRegistered);
  const spokenDigits = normSpoken.replace(/\D/g, '');
  const regDigits = normRegistered.replace(/\D/g, '');

  // If numeric account digits match exactly and prefix is similar (>= 80% / 1 letter variation like WAS vs WAA), it's a pass
  if (spokenDigits && spokenDigits === regDigits && (similarity >= 0.80 || similarity >= threshold)) {
    return {
      matched: true,
      similarity,
      reason: `Tolerant match: spoken "${normSpoken}" matches registered "${normRegistered}" (${Math.round(similarity * 100)}% similarity).`,
    };
  }

  // General similarity check >= 85%
  if (similarity >= threshold) {
    return {
      matched: true,
      similarity,
      reason: `Fuzzy speech-tolerant match (${Math.round(similarity * 100)}% >= 85%).`,
    };
  }

  return {
    matched: false,
    similarity,
    reason: `Client code mismatch: "${normSpoken}" differs from registered "${normRegistered}" (${Math.round(similarity * 100)}% similarity).`,
  };
}

export interface TradeMatchCandidateResult {
  trade: TradeRecord;
  matchType: 'PHONE_EXACT' | 'CLIENT_CODE_EXACT' | 'PHONE_METADATA' | 'CLIENT_METADATA' | 'FUZZY_UCC';
  confidence: number;
  reason: string;
}

/**
 * Normalizes any date string (YYYY-MM-DD, DD/MM/YYYY, ISO) to YYYY-MM-DD.
 * Returns null if missing or invalid.
 */
export function normalizeDateToIso(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Validates trade date against call date within a ±1 calendar day window.
 */
export function checkTradeCallDateWindow(
  callDateRaw?: string | null,
  tradeDateRaw?: string | null
): { allowed: boolean; dateVerified: boolean; reasonTag?: string; diffDays?: number } {
  const normCall = normalizeDateToIso(callDateRaw);
  const normTrade = normalizeDateToIso(tradeDateRaw);

  if (!normCall || !normTrade) {
    return {
      allowed: true,
      dateVerified: false,
      reasonTag: 'MATCH_DATE_MISSING',
    };
  }

  const callTime = new Date(`${normCall}T00:00:00Z`).getTime();
  const tradeTime = new Date(`${normTrade}T00:00:00Z`).getTime();
  if (isNaN(callTime) || isNaN(tradeTime)) {
    return {
      allowed: true,
      dateVerified: false,
      reasonTag: 'MATCH_DATE_MISSING',
    };
  }

  const diffDays = Math.round(Math.abs(tradeTime - callTime) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) {
    return {
      allowed: true,
      dateVerified: true,
      diffDays,
    };
  }

  // Hard rule: outside ±1 calendar day window is strictly rejected
  return {
    allowed: false,
    dateVerified: false,
    diffDays,
  };
}

/**
 * Searches the trade database for an executed trade corresponding to this call.
 * Matches in strict priority order:
 * 1. Phone match (10-digit exact match)
 * 2. Client-code match (exact normalized UCC)
 * 3. Date correlation (trade date strictly within ±1 calendar day of call date)
 *
 * Hard rule: Any candidate outside the ±1 day date window is filtered out.
 * If callDate or tradeDate is missing entirely, candidate is down-ranked (confidence 0.60)
 * and tagged with MATCH_DATE_MISSING.
 */
export function findExecutedTradesForCall(
  db: DatabaseSync,
  call: CallRecord
): TradeMatchCandidateResult[] {
  const normCallingPhone = normalizeCanonicalPhone(call.calling_number || call.phone_number || (call as any).caller_id);
  const normClientCode = normalizeCanonicalClientCode(call.client_code || call.client);
  const callDate = (call.call_date || '').trim();

  const candidates: TradeMatchCandidateResult[] = [];

  // Priority 1: 10-digit Phone Match
  if (normCallingPhone) {
    const phoneTrades = db.prepare(`
      SELECT * FROM trades
      WHERE phone_number = ? OR client_number = ?
      ORDER BY id DESC
    `).all(normCallingPhone, normCallingPhone) as unknown as TradeRecord[];

    for (const t of phoneTrades) {
      const dateCheck = checkTradeCallDateWindow(callDate, t.trade_date);
      // Hard rule: Filter out trades outside allowed date window
      if (!dateCheck.allowed) {
        continue;
      }

      if (dateCheck.dateVerified) {
        candidates.push({
          trade: t,
          matchType: 'PHONE_EXACT',
          confidence: 0.98,
          reason: `10-digit phone match (${normCallingPhone}) against trade registered phone. Trade date verified (${t.trade_date || 'N/A'} within ±1 day of call date ${callDate}).`,
        });
      } else {
        // Missing date: down-rank candidate and log MATCH_DATE_MISSING
        candidates.push({
          trade: t,
          matchType: 'PHONE_EXACT',
          confidence: 0.60,
          reason: `10-digit phone match (${normCallingPhone}) against trade registered phone. [MATCH_DATE_MISSING: call date "${callDate || 'EMPTY'}" or trade date "${t.trade_date || 'EMPTY'}" missing. Down-ranked confidence].`,
        });
      }
    }
  }

  // Priority 2: Client Code Match
  if (normClientCode) {
    const uccTrades = db.prepare(`
      SELECT * FROM trades
      WHERE client = ?
      ORDER BY id DESC
    `).all(normClientCode) as unknown as TradeRecord[];

    for (const t of uccTrades) {
      // Avoid duplicate trade entries
      if (candidates.some((c) => c.trade.id === t.id)) continue;

      const dateCheck = checkTradeCallDateWindow(callDate, t.trade_date);
      // Hard rule: Filter out trades outside allowed date window
      if (!dateCheck.allowed) {
        continue;
      }

      if (dateCheck.dateVerified) {
        candidates.push({
          trade: t,
          matchType: 'CLIENT_CODE_EXACT',
          confidence: 0.95,
          reason: `Client code exact match (${normClientCode}). Trade date verified (${t.trade_date || 'N/A'} within ±1 day of call date ${callDate}).`,
        });
      } else {
        // Missing date: down-rank candidate and log MATCH_DATE_MISSING
        candidates.push({
          trade: t,
          matchType: 'CLIENT_CODE_EXACT',
          confidence: 0.60,
          reason: `Client code exact match (${normClientCode}). [MATCH_DATE_MISSING: call date "${callDate || 'EMPTY'}" or trade date "${t.trade_date || 'EMPTY'}" missing. Down-ranked confidence].`,
        });
      }
    }
  }

  // Sort candidates by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}
