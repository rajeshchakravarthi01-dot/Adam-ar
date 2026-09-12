// =============================================================
// AuditEQ — Dynamic Security Master & Stock Recognition Engine
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { SYMBOL_ALIASES } from './normalizer';

export interface SecurityEntry {
  symbol: string;
  aliases: string[];
  companyName?: string;
}

// Built-in comprehensive registry of Indian equities and common dealer spoken variants
const DEFAULT_SECURITIES: Record<string, string[]> = {
  DATAPATTNS: [
    'data pattern',
    'data patterns',
    'data patterns india',
    'datapat',
    'datapattns',
    'data pat',
    'data pattern buy',
    'data patterns ltd',
  ],
  DATAPAT: [
    'data pattern',
    'data patterns',
    'data patterns india',
    'datapat',
    'datapattns',
    'data pat',
  ],
  WELSPUNLIV: [
    'welspun',
    'welspun living',
    'welspunliv',
    'welspun liv',
    'wellspun',
    'wellspun living',
    'velspun',
  ],
  RELIANCE: [
    'reliance',
    'ril',
    'reliance industries',
    'reliance ind',
    'reliance ind.',
  ],
  TCS: [
    'tcs',
    'tata consultancy services',
    'tata consultancy',
    'tata consult',
  ],
  INFY: [
    'infy',
    'infosys',
    'infosys limited',
    'infosys ltd',
  ],
  HDFCBANK: [
    'hdfc bank',
    'hdfcbank',
    'hdfc',
    'housing development finance',
  ],
  ICICIBANK: [
    'icici bank',
    'icicibank',
    'icici',
  ],
  SBIN: [
    'sbin',
    'sbi',
    'state bank of india',
    'state bank',
  ],
  BHARTIARTL: [
    'bharti airtel',
    'airtel',
    'bhartiartl',
    'bharti',
  ],
  ITC: [
    'itc',
    'itc limited',
    'itc ltd',
  ],
  KOTAKBANK: [
    'kotak bank',
    'kotakbank',
    'kotak',
    'kotak mahindra bank',
  ],
  LT: [
    'l&t',
    'lt',
    'larsen & toubro',
    'larsen and toubro',
    'larsen',
    'l and t',
  ],
  AXISBANK: [
    'axis bank',
    'axisbank',
    'axis',
  ],
  TATAMOTORS: [
    'tata motors',
    'tatamotors',
    'tata motor',
  ],
  TATASTEEL: [
    'tata steel',
    'tatasteel',
  ],
  TATAPOWER: [
    'tata power',
    'tatapower',
  ],
  BAJFINANCE: [
    'bajaj finance',
    'bajfinance',
    'bajaj fin',
  ],
  BAJAJFINSV: [
    'bajaj finserv',
    'bajajfinsv',
    'finserv',
    'bajaj fin serv',
    'bajaj fin',
  ],
  'BAJAJ-AUTO': [
    'bajaj auto',
    'bajajauto',
  ],
  ZOMATO: [
    'zomato',
    'zomato limited',
  ],
  PAYTM: [
    'paytm',
    'one97',
    'one 97',
  ],
  SUZLON: [
    'suzlon',
    'suzlon energy',
  ],
  ADANIENT: [
    'adani enterprises',
    'adanient',
    'adani ent',
  ],
  ADANIPORTS: [
    'adani ports',
    'adaniport',
    'adani ports and sez',
  ],
  NIFTY: [
    'nifty',
    'nifty 50',
    'nifty fifty',
  ],
  BANKNIFTY: [
    'bank nifty',
    'banknifty',
    'nifty bank',
  ],
  WIPRO: [
    'wipro',
    'wipro limited',
  ],
  MARUTI: [
    'maruti',
    'maruti suzuki',
  ],
  SUNPHARMA: [
    'sun pharma',
    'sun pharmaceutical',
    'sunpharma',
  ],
  CIPLA: [
    'cipla',
  ],
  DRREDDY: [
    'dr reddy',
    'dr reddys',
    'dr reddy laboratories',
  ],
  VEDL: [
    'vedanta',
    'vedl',
  ],
  HINDALCO: [
    'hindalco',
  ],
  COALINDIA: [
    'coal india',
    'coalindia',
  ],
  NTPC: [
    'ntpc',
  ],
  ONGC: [
    'ongc',
  ],
  POWERGRID: [
    'powergrid',
    'power grid',
  ],
  TITAN: [
    'titan',
    'titan company',
  ],
};

let cachedSecurityMap: Map<string, string[]> | null = null;
let lastCacheUpdate = 0;

/**
 * Builds or refreshes the security master map, automatically indexing all stock symbols
 * and company names appearing in actual trade records from the database.
 */
export function getSecurityMaster(db?: DatabaseSync): Map<string, string[]> {
  const now = Date.now();
  if (cachedSecurityMap && (now - lastCacheUpdate) < 30000 && !db) {
    return cachedSecurityMap;
  }

  const map = new Map<string, string[]>();

  // 1. Seed with normalizer SYMBOL_ALIASES
  for (const [sym, aliases] of Object.entries(SYMBOL_ALIASES)) {
    const cleanSym = sym.toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
    const current = map.get(cleanSym) || [];
    map.set(cleanSym, Array.from(new Set([...current, ...aliases.map(a => a.toLowerCase())])));
  }

  // 2. Seed with DEFAULT_SECURITIES
  for (const [sym, aliases] of Object.entries(DEFAULT_SECURITIES)) {
    const cleanSym = sym.toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
    const current = map.get(cleanSym) || [];
    map.set(cleanSym, Array.from(new Set([...current, ...aliases.map(a => a.toLowerCase())])));
  }

  // 3. Dynamically index symbols and descriptions from actual trades table if db available
  if (db) {
    try {
      const tradeSymbols = db.prepare(`
        SELECT DISTINCT symbol, notes FROM trades WHERE symbol IS NOT NULL AND symbol != ''
      `).all() as Array<{ symbol: string; notes?: string }>;

      for (const row of tradeSymbols) {
        const raw = (row.symbol || '').trim().toUpperCase();
        if (!raw) continue;
        const clean = raw.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
        const current = map.get(clean) || [];

        const newAliases = new Set<string>(current);
        newAliases.add(clean.toLowerCase());
        newAliases.add(raw.toLowerCase());

        // Split camelCase or joined strings if applicable
        const spaced = clean.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        if (spaced !== clean.toLowerCase()) {
          newAliases.add(spaced);
        }

        // Add special word aliases for known stocks
        if (clean === 'DATAPATTNS' || clean === 'DATAPAT') {
          newAliases.add('data pattern');
          newAliases.add('data patterns');
          newAliases.add('datapat');
        }

        map.set(clean, Array.from(newAliases));
      }
    } catch {
      // Non-blocking fallback if trades table not ready
    }
  }

  cachedSecurityMap = map;
  lastCacheUpdate = now;
  return map;
}

/**
 * Searches text for any known security symbol or alias.
 * Returns the best matched security and the verbatim match snippet.
 */
export function detectSecurityInText(
  text: string,
  db?: DatabaseSync
): { matched: boolean; symbol: string; rawMatch: string; aliasMatched: string } {
  if (!text || !text.trim()) {
    return { matched: false, symbol: '', rawMatch: '', aliasMatched: '' };
  }

  const lowerText = text.toLowerCase();
  const master = getSecurityMaster(db);

  // Check multi-word aliases first (longer matches take precedence)
  const allAliases: Array<{ symbol: string; alias: string }> = [];
  for (const [sym, aliases] of master.entries()) {
    for (const alias of aliases) {
      allAliases.push({ symbol: sym, alias });
    }
  }

  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const { symbol, alias } of allAliases) {
    if (alias.length < 3) continue; // Skip too short 2-letter noise
    // Word boundary regex
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = lowerText.match(regex);
    if (match) {
      return {
        matched: true,
        symbol,
        rawMatch: match[0],
        aliasMatched: alias,
      };
    }
  }

  return { matched: false, symbol: '', rawMatch: '', aliasMatched: '' };
}
