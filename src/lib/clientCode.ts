// =============================================================
// ADAM-AR Strict Client ID Normalization & Validation
//
// Mandate:
// Client ID can never be random strings.
// Allowed Prefixes: WIA, WIF, WIC, WID, WIG, WIE, FIA, PWD
// Canonical Output: Always strictly formatted without spaces or
// word-numbers (e.g. PWD12345, WIA12345, FIA12345, WIE12345).
// =============================================================

export const VALID_CLIENT_PREFIXES = [
  'WIA',
  'WIF',
  'WIC',
  'WID',
  'WIG',
  'WIE',
  'FIA',
  'PWD',
] as const;

export type ValidClientPrefix = typeof VALID_CLIENT_PREFIXES[number];

const SPOKEN_DIGITS_MAP: Record<string, string> = {
  zero: '0', shunya: '0',
  one: '1', ek: '1',
  two: '2', do: '2',
  three: '3', teen: '3',
  four: '4', char: '4', chaar: '4',
  five: '5', paanch: '5', panch: '5',
  six: '6', chhe: '6', che: '6',
  seven: '7', saat: '7',
  eight: '8', aath: '8',
  nine: '9', nau: '9',
};

/**
 * Normalizes any spoken, spaced, hyphenated, or phonetic transcription
 * of a client code into its exact canonical format (e.g. "PWD12345").
 *
 * Handles variants such as:
 * - "WIA12345", "WIA 12345", "W I A 12345", "double u I A 12345", "W I A one two three four five"
 * - "WIF12345", "double u I F 12345", "W I F one two three four five"
 * - "WIC12345", "W I C 12345", "double u I C 12345", "W I C one two three four five"
 * - "WID12345", "W I D 12345", "double u I D 12345", "W I D one two three four five"
 * - "WIG12345", "W I G 12345", "double u I G 12345", "W I G one two three four five"
 * - "WIE12345", "W I E 12345", "double u I E 12345", "W I E one two three four five"
 * - "FIA12345", "FIA 12345", "F I A 12345", "F I A one two three four five"
 * - "PWD12345", "PWD 12345", "P W D 12345", "P W D one two three four five"
 */
export function formatCleanClientCode(rawInput?: string | null): string {
  if (!rawInput) return '';
  let str = String(rawInput).trim().toLowerCase();
  if (!str) return '';

  // 1. Spoken letter normalization: double u / double-u / double you / dablu -> w
  str = str.replace(/\bdouble\s*[-_]?\s*u\b/gi, 'w');
  str = str.replace(/\bdouble\s*[-_]?\s*you\b/gi, 'w');
  str = str.replace(/\bdhablu\b/gi, 'w');
  str = str.replace(/\bdablu\b/gi, 'w');

  // 2. Spoken repeated digit qualifiers: "double five" -> "55", "triple five" -> "555"
  for (const [w, d] of Object.entries(SPOKEN_DIGITS_MAP)) {
    str = str.replace(new RegExp(`\\bdouble\\s+${w}\\b`, 'gi'), `${d}${d}`);
    str = str.replace(new RegExp(`\\btriple\\s+${w}\\b`, 'gi'), `${d}${d}${d}`);
  }

  // 3. Spoken individual digits: "one two three four five" -> "12345"
  for (const [w, d] of Object.entries(SPOKEN_DIGITS_MAP)) {
    str = str.replace(new RegExp(`\\b${w}\\b`, 'gi'), d);
  }

  // 4. Strip punctuation, whitespace, dashes, dots, underscores
  const squashed = str.replace(/[\s\-._:;,/]/g, '').toUpperCase();

  // 5. Canonical prefix matching with phonetic tolerance (e.g. VIA -> WIA, VIF -> WIF)
  const prefixMap: Array<{ pattern: RegExp; canonical: ValidClientPrefix }> = [
    { pattern: /^(?:WIA|VIA|W1A|V1A)/, canonical: 'WIA' },
    { pattern: /^(?:WIF|VIF|W1F|V1F)/, canonical: 'WIF' },
    { pattern: /^(?:WIC|VIC|W1C|V1C)/, canonical: 'WIC' },
    { pattern: /^(?:WID|VID|W1D|V1D)/, canonical: 'WID' },
    { pattern: /^(?:WIG|VIG|W1G|V1G)/, canonical: 'WIG' },
    { pattern: /^(?:WIE|VIE|W1E|V1E)/, canonical: 'WIE' },
    { pattern: /^(?:FIA)/, canonical: 'FIA' },
    { pattern: /^(?:PWD)/, canonical: 'PWD' },
  ];

  for (const item of prefixMap) {
    const match = squashed.match(item.pattern);
    if (match) {
      const remaining = squashed.slice(match[0].length);
      const digitMatch = remaining.match(/^(\d{2,10})/);
      if (digitMatch) {
        return `${item.canonical}${digitMatch[1]}`;
      }
    }
  }

  // Check if string already starts with valid prefix
  for (const p of VALID_CLIENT_PREFIXES) {
    if (squashed.startsWith(p)) {
      const digits = squashed.slice(p.length).replace(/\D/g, '');
      if (digits.length >= 2) {
        return `${p}${digits}`;
      }
    }
  }

  // Invalid or unrecognized client code
  return '';
}

/**
 * Returns true only if client code is strictly compliant with regulatory standards
 */
export function isStrictValidClientCode(code?: string | null): boolean {
  if (!code) return false;
  const clean = formatCleanClientCode(code);
  return /^(WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD)\d{2,10}$/.test(clean);
}

/**
 * Cleans advisor / dealer / caller names by stripping phone numbers in parentheses or brackets.
 * e.g., "Ajeet kumar pandey (+9042565871)" -> "Ajeet kumar pandey"
 *       "Ajeetkumar Bharthidasan (8106365245)" -> "Ajeetkumar Bharthidasan"
 */
export function cleanCallerName(name: string | null | undefined): string {
  if (!name) return '';
  const str = String(name).trim();
  const cleaned = str
    .replace(/\s*[\(\[]\s*\+?[\d\s-]{7,15}\s*[\)\]]\s*$/i, '')
    .replace(/\s*[\(\[]\s*ext\s*\d+\s*[\)\]]\s*$/i, '')
    .trim();
  return cleaned || str;
}
