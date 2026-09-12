// =============================================================
// ASR-Aware UCC & Number Resolution Engine
//
// Core Principle:
// Whisper/ASR transcription of UCCs, stock names, quantities,
// and prices cannot be treated as exact text.
// Example: Real UCC is WIA12345. ASR may produce:
// WIA12345, WIS 12345, WAI 12345, WIA 12 345, VIA12345, etc.
//
// Mandates:
// 1. ASR output is an observation, not ground truth.
// 2. Never use loose fuzzy matching that risks identifying the wrong client.
// 3. Resolve ASR variants using AUTHORITATIVE client data (trades / client master).
// 4. If multiple client UCCs could match (collision/ambiguity) -> REVIEW.
// 5. If no authoritative match found -> UNRESOLVED / REVIEW.
// 6. Never alter the raw transcript text.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { normalizeSpokenNumbers, levenshteinDistance } from '../normalizer';

export interface UccResolutionResult {
  status: 'RESOLVED' | 'AMBIGUOUS' | 'UNRESOLVED';
  resolvedUcc: string | null;
  rawSpokenUcc: string | null;
  confidence: number;
  matchingCandidates: string[];
  notes: string;
}

// Common phonetic and OCR-like letter confusions observed in Indian financial ASR:
// W <-> V, S <-> C, B <-> P, M <-> N, D <-> T
const PREFIX_VARIANTS: Record<string, string[]> = {
  WIA: ['VIA', 'WAS', 'WAA', 'WAI', 'WIS', 'W1A', 'WYA', 'V.I.A.', 'W.I.A.'],
  VIA: ['WIA', 'WAS', 'WAA', 'V1A', 'VYA'],
  WAS: ['WIA', 'VIA', 'WAA'],
  WAA: ['WIA', 'VIA', 'WAS'],
  WIS: ['WIA', 'VIA', 'WAI'],
  WAI: ['WIA', 'VIA', 'WIS'],
  W1A: ['WIA', 'VIA'],
};

/**
 * Normalizes raw spoken token into candidate UCC patterns
 */
export function generateAsrUccVariants(rawSpoken: string): string[] {
  if (!rawSpoken) return [];

  const variants = new Set<string>();

  // 1. Direct squashed uppercase
  const cleaned = rawSpoken.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length >= 3) {
    variants.add(cleaned);
  }

  // 2. Normalize spoken numbers ("one two three four five" -> 12345)
  const numberNormalized = normalizeSpokenNumbers(rawSpoken).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (numberNormalized.length >= 3) {
    variants.add(numberNormalized);
  }

  // 3. Handle letter phonetic prefixes (e.g. VIA12345 -> WIA12345)
  for (const v of Array.from(variants)) {
    const prefixMatch = v.match(/^([A-Z]{2,4})(\d{3,8})$/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const digits = prefixMatch[2];

      // Check known prefix substitutions
      const knownSubstitutes = PREFIX_VARIANTS[prefix] || [];
      for (const sub of knownSubstitutes) {
        variants.add(`${sub}${digits}`);
      }

      // V <-> W substitution
      if (prefix.startsWith('V')) {
        variants.add(`W${prefix.slice(1)}${digits}`);
      } else if (prefix.startsWith('W')) {
        variants.add(`V${prefix.slice(1)}${digits}`);
      }
    }
  }

  return Array.from(variants);
}

/**
 * Extracts candidate UCC phrases from transcript using contextual acoustic cues.
 * Looks for patterns like "account number WIA 12345", "client code 12345", "WIA 45678", etc.
 */
export function extractSpokenUccCandidates(transcript: string): Array<{ rawText: string; cleanCandidate: string }> {
  if (!transcript) return [];

  const candidates: Array<{ rawText: string; cleanCandidate: string }> = [];
  const normalizedSpoken = normalizeSpokenNumbers(transcript);

  // Pattern 1: Explicit account context + alphanumeric code
  // e.g., "account number WIA 12345", "code is 12345", "UCC WIA12345"
  const contextPatterns = [
    /\b(?:ucc|client\s+code|client\s+id|account\s+number|account\s+no|a\/c\s+no|client\s+no)\s*(?:is|hai|number|#|:)?\s*([a-zA-Z0-9\s\-._]{3,16})/gi,
    /\b([a-zA-Z]{2,4}[\s\-._]*\d{3,8})\b/gi,
  ];

  for (const pat of contextPatterns) {
    let match;
    while ((match = pat.exec(normalizedSpoken)) !== null) {
      const rawText = match[0];
      const cleanCandidate = match[1] || match[0];
      const squashed = cleanCandidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (squashed.length >= 4) {
        candidates.push({ rawText, cleanCandidate: squashed });
      }
    }
  }

  // Also extract bare standard UCC patterns (e.g. WIA12345 or VIA12345) from raw transcript
  const directUccMatch = transcript.match(/\b([A-Z]{2,4}[\s\-._]*\d{3,8})\b/gi);
  if (directUccMatch) {
    for (const m of directUccMatch) {
      const squashed = m.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (squashed.length >= 4 && !candidates.some((c) => c.cleanCandidate === squashed)) {
        candidates.push({ rawText: m, cleanCandidate: squashed });
      }
    }
  }

  return candidates;
}

/**
 * Resolves spoken UCC candidate against the authoritative client directory/trades.
 *
 * Algorithm:
 * 1. Fetch authoritative known client UCCs from trades.
 * 2. Check if expectedUcc (from metadata/trade) matches candidate via ASR variant rules.
 * 3. If exact or known ASR variant matches authoritative client -> RESOLVED.
 * 4. If candidate matches multiple distinct authoritative clients -> AMBIGUOUS (REVIEW).
 * 5. If no match -> UNRESOLVED.
 */
export function resolveUccWithAuthoritativeData(
  db: DatabaseSync,
  candidateText: string,
  expectedUcc?: string | null,
  callerPhone?: string | null
): UccResolutionResult {
  // Get all authoritative distinct UCCs from database
  let authoritativeUccs: string[] = [];
  try {
    const masterRows = db.prepare(`
      SELECT DISTINCT client_code as client FROM clients WHERE client_code IS NOT NULL AND length(trim(client_code)) > 0
    `).all() as Array<{ client: string }>;
    if (masterRows.length > 0) {
      authoritativeUccs = masterRows.map((r) => r.client.trim().toUpperCase());
    }
  } catch {}

  if (authoritativeUccs.length === 0) {
    try {
      const rows = db.prepare(`
        SELECT DISTINCT client FROM trades WHERE client IS NOT NULL AND length(trim(client)) > 0
        UNION
        SELECT DISTINCT client_number FROM trades WHERE client_number IS NOT NULL AND length(trim(client_number)) > 0 AND client_number GLOB '*[A-Za-z]*'
      `).all() as Array<{ client: string }>;
      authoritativeUccs = rows.map((r) => r.client.trim().toUpperCase());
    } catch {
      authoritativeUccs = [];
    }
  }

  // If no master or trade records exist, use expectedUcc strictly as sole reference
  if (authoritativeUccs.length === 0 && expectedUcc) {
    authoritativeUccs.push(expectedUcc.trim().toUpperCase());
  }

  if (authoritativeUccs.length === 0) {
    return {
      status: 'UNRESOLVED',
      resolvedUcc: null,
      rawSpokenUcc: candidateText,
      confidence: 0,
      matchingCandidates: [],
      notes: 'No authoritative client records available in database.',
    };
  }

  const variants = generateAsrUccVariants(candidateText);
  const matchedAuthoritative = new Set<string>();

  for (const authUcc of authoritativeUccs) {
    const authNorm = authUcc.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const authDigits = authNorm.replace(/\D/g, '');
    const authPrefix = authNorm.replace(/\d/g, '');

    // 1. Direct match with any ASR variant
    for (const v of variants) {
      if (v === authNorm) {
        matchedAuthoritative.add(authUcc);
        break;
      }

      // Check prefix substitution + exact numeric suffix
      const vDigits = v.replace(/\D/g, '');
      const vPrefix = v.replace(/\d/g, '');
      if (vDigits === authDigits && authDigits.length >= 3) {
        // Same digits! Check if prefix is known substitution or 1-edit distance
        const knownSubs = PREFIX_VARIANTS[vPrefix] || [];
        if (knownSubs.includes(authPrefix) || levenshteinDistance(vPrefix, authPrefix) <= 1) {
          matchedAuthoritative.add(authUcc);
          break;
        }
      }
    }
  }

  // Disambiguate if callerPhone is available
  if (matchedAuthoritative.size > 1 && callerPhone) {
    try {
      const phoneUccs = db.prepare(`
        SELECT DISTINCT client FROM trades WHERE phone_number = ? OR client_number = ?
      `).all(callerPhone, callerPhone) as Array<{ client: string }>;
      const phoneUccSet = new Set(phoneUccs.map((p) => p.client.toUpperCase()));

      const filtered = Array.from(matchedAuthoritative).filter((ucc) => phoneUccSet.has(ucc));
      if (filtered.length === 1) {
        return {
          status: 'RESOLVED',
          resolvedUcc: filtered[0],
          rawSpokenUcc: candidateText,
          confidence: 0.95,
          matchingCandidates: filtered,
          notes: `ASR-resolved "${candidateText}" to authoritative client ${filtered[0]} disambiguated by caller phone ${callerPhone}.`,
        };
      }
    } catch {}
  }

  const matches = Array.from(matchedAuthoritative);

  if (matches.length === 1) {
    return {
      status: 'RESOLVED',
      resolvedUcc: matches[0],
      rawSpokenUcc: candidateText,
      confidence: 0.95,
      matchingCandidates: matches,
      notes: `ASR-resolved "${candidateText}" to single authoritative client ${matches[0]}.`,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      resolvedUcc: null,
      rawSpokenUcc: candidateText,
      confidence: 0.50,
      matchingCandidates: matches,
      notes: `Ambiguous ASR UCC: spoken candidate "${candidateText}" matched multiple authoritative clients (${matches.join(', ')}). Routed to REVIEW.`,
    };
  }

  return {
    status: 'UNRESOLVED',
    resolvedUcc: null,
    rawSpokenUcc: candidateText,
    confidence: 0,
    matchingCandidates: [],
    notes: `Spoken candidate "${candidateText}" could not be resolved against authoritative client records.`,
  };
}
