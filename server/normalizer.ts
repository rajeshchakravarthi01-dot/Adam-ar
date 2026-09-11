// =============================================================
// AuditEQ v17.0.28 — SEBI High-Precision Speech & Data Normalizer
// =============================================================

/**
 * Computes Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
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
 * Computes fuzzy string similarity (0.0 to 1.0) based on Levenshtein distance
 */
export function fuzzySimilarity(a: string, b: string): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}

// Symbol and Company Name Aliases for NSE/BSE Equity & Derivatives
export const SYMBOL_ALIASES: Record<string, string[]> = {
  RELIANCE: ['reliance', 'ril', 'reliance industries', 'reliance ind', 'reliance ind.'],
  TCS: ['tcs', 'tata consultancy services', 'tata consultancy', 'tata consult'],
  INFY: ['infy', 'infosys', 'infosys limited', 'infosys ltd'],
  HDFCBANK: ['hdfc bank', 'hdfcbank', 'hdfc', 'housing development finance'],
  ICICIBANK: ['icici bank', 'icicibank', 'icici'],
  SBIN: ['sbin', 'sbi', 'state bank of india', 'state bank'],
  BHARTIARTL: ['bharti airtel', 'airtel', 'bhartiartl', 'bharti'],
  ITC: ['itc', 'itc limited', 'itc ltd'],
  KOTAKBANK: ['kotak bank', 'kotakbank', 'kotak', 'kotak mahindra bank'],
  LT: ['l&t', 'lt', 'larsen & toubro', 'larsen and toubro', 'larsen', 'l and t'],
  AXISBANK: ['axis bank', 'axisbank', 'axis'],
  TATAMOTORS: ['tata motors', 'tatamotors', 'tata motor', 'tata'],
  TATASTEEL: ['tata steel', 'tatasteel', 'tata'],
  TATAPOWER: ['tata power', 'tatapower'],
  BAJFINANCE: ['bajaj finance', 'bajfinance', 'bajaj fin', 'bajaj'],
  BAJAJFINSV: ['bajaj finserv', 'bajajfinsv', 'finserv', 'bajaj fin serv', 'bajaj fin', 'bajaj'],
  'BAJAJ-AUTO': ['bajaj auto', 'bajajauto', 'bajaj'],
  WELSPUNLIV: ['welspun', 'welspun living', 'welspunliv', 'welspun liv', 'wellspun', 'wellspun living', 'velspun'],
  WELSPUN: ['welspun', 'welspun living', 'welspunliv', 'welspun liv', 'wellspun', 'wellspun living', 'velspun'],
  KAJARIA: ['kajaria', 'kajaria ceramics', 'kajariacer', 'kajarria', 'kajarirya', 'kajariya'],
  KAJARIACER: ['kajaria', 'kajaria ceramics', 'kajariacer', 'kajarria', 'kajarirya', 'kajariya'],
  MM: ['mahindra', 'm&m', 'm and m', 'mahindra and mahindra', 'mnm', 'm & m'],
  'M&M': ['mahindra', 'm&m', 'm and m', 'mahindra and mahindra', 'mnm', 'm & m'],
  MARUTI: ['maruti', 'maruti suzuki', 'marutisuzuki'],
  SUNPHARMA: ['sun pharma', 'sunpharma', 'sun pharmaceuticals'],
  WIPRO: ['wipro', 'wipro limited'],
  ASIANPAINT: ['asian paints', 'asianpaint', 'asian paint'],
  HCLTECH: ['hcl tech', 'hcltech', 'hcl technologies'],
  COALINDIA: ['coal india', 'coal'],
  NTPC: ['ntpc'],
  POWERGRID: ['power grid', 'powergrid'],
  ONGC: ['ongc'],
  BPCL: ['bpcl', 'bharat petroleum'],
  IOC: ['ioc', 'indian oil'],
  HEROMOTOCO: ['hero', 'hero motocorp', 'hero honda'],
  EICHERMOT: ['eicher', 'eicher motors', 'royal enfield'],
  CIPLA: ['cipla'],
  DRREDDY: ['dr reddy', 'dr reddys', 'reddy'],
  DIVISLAB: ['divis', 'divis laboratories'],
  APOLLOHOSP: ['apollo', 'apollo hospitals'],
  ULTRACEMCO: ['ultratech', 'ultratech cement', 'ultratech cement limited'],
  GRASIM: ['grasim'],
  JSWSTEEL: ['jsw', 'jsw steel'],
  HINDALCO: ['hindalco'],
  VEDL: ['vedanta', 'vedl'],
  TECHM: ['tech mahindra', 'techm'],
  BEL: ['bel', 'bharat electronics'],
  HAL: ['hal', 'hindustan aeronautics'],
  BHEL: ['bhel', 'bharat heavy electricals'],
  IRCTC: ['irctc'],
  ZOMATO: ['zomato'],
  PAYTM: ['paytm', 'one97'],
  NYKAA: ['nykaa', 'fsn'],
  NETWEB: ['netweb', 'net web', 'netweb tech', 'netweb technologies', 'netweb technology'],
  IKS: ['iks', 'i k s', 'i.k.s.', 'ics', 'iks health', 'iks healthcare', 'iks technologies', 'iks-eq'],
  IKSL: ['iks', 'i k s', 'i.k.s.', 'ics', 'iks health', 'iks healthcare', 'iks technologies', 'iks-eq'],
  SUZLON: ['suzlon', 'suzlon energy'],
  YESBANK: ['yes bank', 'yesbank'],
  IDFCFIRSTB: ['idfc first', 'idfc first bank', 'idfc', 'idfc bank'],
  FEDERALBNK: ['federal bank', 'federalbank', 'federal'],
  ANGELONE: ['angel one', 'angelone', 'angel broking'],
  TRENT: ['trent', 'trent limited', 'westside', 'zudio'],
  RVNL: ['rvnl', 'rail vikas nigam', 'rail vikas'],
  IREDA: ['ireda'],
  BSE: ['bse', 'bombay stock exchange'],
  CDSL: ['cdsl'],
  MCX: ['mcx', 'multi commodity exchange'],
  HUDCO: ['hudco'],
  NBCC: ['nbcc'],
  TITAN: ['titan', 'titan company', 'tanishq', 'fastrack'],
  HAVELLS: ['havells', 'havells india'],
  POLYCAB: ['polycab', 'polycab india'],
  DIXON: ['dixon', 'dixon tech', 'dixon technologies'],
  KAYNES: ['kaynes', 'kaynes tech', 'kaynes technology'],
  AMBER: ['amber', 'amber enterprises'],
  NESTLEIND: ['nestle', 'nestle india', 'maggi'],
  BRITANNIA: ['britannia', 'britannia industries'],
  DABUR: ['dabur', 'dabur india'],
  MARICO: ['marico', 'parachute', 'saffola'],
  GODREJCP: ['godrej consumer', 'godrej', 'godrej cp'],
  DLF: ['dlf', 'dlf limited'],
  LODHA: ['lodha', 'macrotech', 'macrotech developers'],
  PRESTIGE: ['prestige', 'prestige estates'],
  OBEROIRLTY: ['oberoi', 'oberoi realty'],
  MUTHOOTFIN: ['muthoot', 'muthoot finance'],
  MANAPPURAM: ['manappuram', 'manappuram finance'],
  SBICARD: ['sbi card', 'sbi cards', 'sbicard'],
  SBILIFE: ['sbi life', 'sbilife'],
  HDFCLIFE: ['hdfc life', 'hdfclife'],
  ICICIPRULI: ['icici prudential', 'icici pru', 'icicipru'],
  ICICIGI: ['icici lombard', 'icicigi'],
  IRFC: ['irfc', 'indian railway finance', 'i r f c'],
  SJVN: ['sjvn', 's j v n'],
  NHPC: ['nhpc', 'n h p c'],
  SAIL: ['sail', 'steel authority', 'steel authority of india'],
  NMDC: ['nmdc', 'national mineral development'],
  REC: ['rec', 'rec limited', 'rural electrification'],
  PFC: ['pfc', 'power finance corporation', 'power finance'],
  CAMS: ['cams', 'computer age management'],
  MOTILALOFS: ['motilal oswal', 'motilal', 'mfl'],
  MAZDOCK: ['mazagon dock', 'mazdock', 'mazagon'],
  COCHINSHIP: ['cochin shipyard', 'cochin ship'],
  GRSE: ['garden reach', 'grse'],
  BHARATFORG: ['bharat forge', 'bharatforge'],
  CUMMINSIND: ['cummins', 'cummins india'],
  SIEMENS: ['siemens', 'siemens india'],
  ABB: ['abb', 'abb india', 'a b b'],
  DMART: ['dmart', 'd-mart', 'avenue supermarts', 'avenue supermart'],
  VBL: ['varun beverages', 'vbl', 'varun'],
  TATACONSUM: ['tata consumer', 'tata consumer products', 'tata tea', 'tata salt'],
  IDEA: ['idea', 'vodafone idea', 'vodafone', 'vi'],
  BANKBARODA: ['bank of baroda', 'bob', 'baroda bank', 'bank baroda'],
  PNB: ['pnb', 'punjab national bank', 'punjab national'],
  CANBK: ['canara bank', 'canara', 'canbk'],
  UNIONBANK: ['union bank', 'union bank of india', 'unionbank'],
  INDUSINDBK: ['indusind bank', 'indusind', 'indus ind'],
  AUBANK: ['au small finance', 'au bank', 'aubank'],
  BANDHANBNK: ['bandhan bank', 'bandhan'],
  ADANIENT: ['adani enterprises', 'adani ent', 'adani'],
  ADANIPORTS: ['adani ports', 'adani port', 'sez', 'adani'],
  NIFTY: ['nifty', 'nifty 50', 'nifty fifty', 'nifty50'],
  BANKNIFTY: ['bank nifty', 'banknifty', 'nifty bank'],
  FINNIFTY: ['fin nifty', 'finnifty', 'nifty financial services'],
};

// Spoken number words mapping to digits
const WORD_TO_DIGIT: Record<string, string> = {
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
  double: '2x',
  triple: '3x',
};

// Comprehensive English and Hindi number maps
const NUMBER_WORDS_MAP: Record<string, number> = {
  zero: 0, shunya: 0, sunya: 0,
  one: 1, ek: 1,
  two: 2, do: 2,
  three: 3, teen: 3,
  four: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6,
  seven: 7, saat: 7,
  eight: 8, aath: 8,
  nine: 9, nau: 9,
  ten: 10, das: 10,
  eleven: 11, gyarah: 11,
  twelve: 12, barah: 12,
  thirteen: 13, terah: 13,
  fourteen: 14, chaudah: 14,
  fifteen: 15, pandrah: 15,
  sixteen: 16, solah: 16,
  seventeen: 17, satrah: 17,
  eighteen: 18, atharah: 18,
  nineteen: 19, unnees: 19,
  twenty: 20, bees: 20,
  twentyone: 21, ikkees: 21,
  twentytwo: 22, baaees: 22,
  twentythree: 23, teyees: 23,
  twentyfour: 24, chaubees: 24,
  twentyfive: 25, pachis: 25, pachhees: 25,
  twentysix: 26, chhabbees: 26,
  twentyseven: 27, sattaees: 27,
  twentyeight: 28, atthaees: 28,
  twentynine: 29, untees: 29,
  thirty: 30, tees: 30,
  thirtyfive: 35, paithees: 35,
  forty: 40, chalis: 40, chaalees: 40,
  fortyfive: 45, paintalees: 45,
  fifty: 50, pachaas: 50, pachas: 50,
  fiftyfive: 55, pachpan: 55,
  sixty: 60, saath: 60, sath: 60,
  sixtyfive: 65, painsath: 65,
  seventy: 70, sattar: 70,
  seventyfive: 75, pachattar: 75,
  eighty: 80, assi: 80,
  eightyfive: 85, pachasi: 85,
  ninety: 90, nabbe: 90,
  ninetyfive: 95, pachaanve: 95,
  hundred: 100, sau: 100,
  thousand: 1000, hazaar: 1000, hazar: 1000,
  lakh: 100000, lac: 100000,
  crore: 10000000,
  // Special Hindi compounds
  dedh: 1.5,
  dhai: 2.5,
  sawa: 1.25,
  paune: 0.75,
};

/**
 * Parses spoken number expressions (Hindi, English, Hinglish, numeric)
 * Handles:
 *  - "one eighty point fifty" -> 180.50
 *  - "180 point 50" -> 180.50
 *  - "one hundred eighty five" -> 185
 *  - "do sau pachaas" -> 250
 *  - "pachaas" -> 50
 *  - "five hundred" -> 500
 *  - "500" -> 500
 *  - "dedh sau" -> 150
 *  - "dhai sau" -> 250
 *  - "do hazaar" -> 2000
 */
// Map of spoken words strictly representing individual digits (English and Hindi)
const SINGLE_DIGIT_WORDS: Record<string, string> = {
  zero: '0', shunya: '0', sunya: '0',
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

export function parseSpokenNumberPhrase(phrase: string): number | null {
  if (!phrase) return null;
  const cleaned = phrase.trim().toLowerCase().replace(/[\s-]+/g, ' ');

  // Direct numeric or currency match
  const directClean = cleaned.replace(/[^0-9.]/g, '');
  if (/^\d+(?:\.\d+)?$/.test(directClean) && !cleaned.includes('point') && !cleaned.includes('sau') && !cleaned.includes('hundred')) {
    const n = parseFloat(directClean);
    return isNaN(n) ? null : n;
  }

  // Check if phrase is a sequence of spoken single digits (e.g. "nine seven six seven" or "four six eight eight four")
  const rawTokens = cleaned.split(/\s+/);
  let isAllSingleDigits = rawTokens.length >= 2;
  let digitStr = '';
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t === 'double' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
      digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(2);
      i++;
    } else if (t === 'triple' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
      digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(3);
      i++;
    } else if (SINGLE_DIGIT_WORDS[t] !== undefined) {
      digitStr += SINGLE_DIGIT_WORDS[t];
    } else if (/^\d$/.test(t)) {
      digitStr += t;
    } else {
      isAllSingleDigits = false;
      break;
    }
  }
  if (isAllSingleDigits && digitStr.length >= 2) {
    const n = parseFloat(digitStr);
    return isNaN(n) ? null : n;
  }

  // Handle "X point Y" or "X dashamlav Y" (e.g. "one eighty point fifty", "180 point 50")
  if (cleaned.includes('point') || cleaned.includes('dashamlav') || cleaned.includes('dot')) {
    const parts = cleaned.split(/\b(?:point|dashamlav|dot)\b/);
    if (parts.length === 2) {
      const wholePart = parseSpokenNumberPhrase(parts[0].trim());
      const decimalPartStr = parts[1].trim();
      let decimalValue: number | null = null;

      // Check if decimal part is words or digits
      const decTokens = decimalPartStr.split(/\s+/);
      let decDigits = '';
      for (const t of decTokens) {
        if (/^\d+$/.test(t)) {
          decDigits += t;
        } else if (NUMBER_WORDS_MAP[t] !== undefined) {
          decDigits += String(NUMBER_WORDS_MAP[t]);
        }
      }

      if (decDigits) {
        decimalValue = parseFloat(`0.${decDigits}`);
      } else {
        const parsedDec = parseSpokenNumberPhrase(decimalPartStr);
        if (parsedDec !== null) {
          decimalValue = parsedDec < 1 ? parsedDec : parsedDec / Math.pow(10, String(Math.floor(parsedDec)).length);
        }
      }

      if (wholePart !== null && decimalValue !== null) {
        return Math.round((wholePart + decimalValue) * 10000) / 10000;
      }
    }
  }

  // Handle compound spoken words (e.g., "one hundred eighty five", "do sau pachaas", "dedh sau")
  const tokens = cleaned.split(/\s+/);
  let total = 0;
  let currentGroup = 0;
  let recognizedAny = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Check special multipliers like "dedh sau" (150) or "dhai sau" (250)
    if (t === 'dedh' && (tokens[i + 1] === 'sau' || tokens[i + 1] === 'hundred')) {
      currentGroup += 150;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dhai' && (tokens[i + 1] === 'sau' || tokens[i + 1] === 'hundred')) {
      currentGroup += 250;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dedh' && (tokens[i + 1] === 'hazaar' || tokens[i + 1] === 'hazar' || tokens[i + 1] === 'thousand')) {
      total += 1500;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dhai' && (tokens[i + 1] === 'hazaar' || tokens[i + 1] === 'hazar' || tokens[i + 1] === 'thousand')) {
      total += 2500;
      i++;
      recognizedAny = true;
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(t)) {
      currentGroup += parseFloat(t);
      recognizedAny = true;
      continue;
    }

    const val = NUMBER_WORDS_MAP[t];
    if (val !== undefined) {
      recognizedAny = true;
      if (val === 100) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * 100;
      } else if (val === 1000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 1000;
        currentGroup = 0;
      } else if (val === 100000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 100000;
        currentGroup = 0;
      } else if (val === 10000000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 10000000;
        currentGroup = 0;
      } else {
        currentGroup += val;
      }
    }
  }

  total += currentGroup;
  return recognizedAny ? total : null;
}

/**
 * Normalizes all spoken number phrases in a text into Arabic digits.
 */
export function normalizeSpokenNumbers(text: string): string {
  if (!text) return '';
  return text.replace(
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|sau|hazaar|hazar|lakh|dedh|dhai|pachaas|bees|tees|chalis|saath|sattar|assi|nabbe|zero|shunya|sunya|double|triple)\b(?:\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|sau|hazaar|hazar|lakh|pachaas|bees|tees|chalis|zero|shunya|sunya|double|triple|ek|do|teen|char|paanch|chhe|saat|aath|nau|das))*/gi,
    (match) => {
      const cleaned = match.trim().toLowerCase();
      const rawTokens = cleaned.split(/\s+/);
      let isAllSingleDigits = rawTokens.length >= 2;
      let digitStr = '';
      for (let i = 0; i < rawTokens.length; i++) {
        const t = rawTokens[i];
        if (t === 'double' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
          digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(2);
          i++;
        } else if (t === 'triple' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
          digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(3);
          i++;
        } else if (SINGLE_DIGIT_WORDS[t] !== undefined) {
          digitStr += SINGLE_DIGIT_WORDS[t];
        } else if (/^\d$/.test(t)) {
          digitStr += t;
        } else {
          isAllSingleDigits = false;
          break;
        }
      }
      if (isAllSingleDigits && digitStr.length >= 2) {
        return digitStr;
      }

      const parsed = parseSpokenNumberPhrase(match);
      return parsed !== null ? String(parsed) : match;
    }
  );
}

/**
 * Normalizes phone numbers to standard 10-digit format (Indian mobile/landline)
 * User Rule: "match the number given in meta data nad trade data ignore the first 2 digit, if meta data have 12 digit number."
 */
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  // If metadata has 12-digit number (e.g. 919904706239), ignore the first 2 digits to get 10-digit number (9904706239)
  if (digits.length === 12) {
    return digits.slice(2);
  }
  // If longer than 10 digits (e.g. leading 0 or 091), take trailing 10 digits
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes client codes across spoken, spaced, hyphenated, and raw formats.
 * e.g., "W I A 46884", "WIA-46884", "WIA 46884", "wia46884" -> "WIA46884"
 * Also handles spoken digit sequences e.g. "WIA four six eight eight four" -> "WIA46884"
 */
export function normalizeClientCode(clientCode?: string | null): string {
  if (!clientCode) return '';
  let normalized = String(clientCode).trim().toLowerCase();

  // Replace spoken digits
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    if (digit.endsWith('x')) continue;
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, digit);
  }

  // Remove spaces, hyphens, dots, underscores
  return normalized.replace(/[\s\-._]/g, '').toUpperCase();
}

/**
 * Checks if a client code is present in a transcript using speech-tolerant matching.
 */
export function matchClientCodeInTranscript(
  clientCode: string,
  transcript: string
): { matched: boolean; score: number; matchedVariant?: string } {
  if (!clientCode || !transcript) return { matched: false, score: 0 };

  const normCode = normalizeClientCode(clientCode);
  if (!normCode) return { matched: false, score: 0 };

  const lowerTranscript = transcript.toLowerCase();
  const squashedTranscript = transcript.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const spokenNormalizedTranscript = normalizeSpokenNumbers(transcript);
  const squashedSpokenTranscript = spokenNormalizedTranscript.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Direct normalized substring check (raw and spoken-normalized)
  if (squashedTranscript.includes(normCode) || squashedSpokenTranscript.includes(normCode)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // 2. Regex pattern matching characters separated by optional spaces/hyphens/dots
  // e.g. W-I-A-2-6-7-7-9 or W I A 2 6 7 7 9 or W.I.A. 26779
  const pattern = normCode.split('').join('[\\s\\-_.]*');
  const regex = new RegExp(`\\b${pattern}\\b`, 'i');
  if (regex.test(transcript) || regex.test(spokenNormalizedTranscript)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // 3. Phonetic letter variations:
  // Whisper often transcribes 'WIA' as 'VIA', 'V.I.A.', 'V I A', 'DOUBLE U I A', 'W I A', 'W-I-A', 'WAS', 'WAA', 'WYA'
  const numericSuffix = normCode.replace(/^[A-Z]+/i, '');
  if (numericSuffix && numericSuffix.length >= 2) {
    const phoneticPatterns = [
      `v[\\s\\-_.]*i[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `w[\\s\\-_.]*i[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `w[\\s\\-_.]*a[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `w[\\s\\-_.]*a[\\s\\-_.]*s[\\s\\-_.]*${numericSuffix}`,
      `v[\\s\\-_.]*a[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `v[\\s\\-_.]*a[\\s\\-_.]*s[\\s\\-_.]*${numericSuffix}`,
      `w[\\s\\-_.]*y[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `v[\\s\\-_.]*y[\\s\\-_.]*a[\\s\\-_.]*${numericSuffix}`,
      `double\\s*u\\s*i\\s*a\\s*${numericSuffix}`,
      `double\\s*u\\s*a\\s*a\\s*${numericSuffix}`,
      `double\\s*u\\s*a\\s*s\\s*${numericSuffix}`,
      `dhablu\\s*i\\s*a\\s*${numericSuffix}`,
      `w1a\\s*${numericSuffix}`,
    ];
    for (const pp of phoneticPatterns) {
      if (new RegExp(`\\b${pp}\\b`, 'i').test(lowerTranscript) || new RegExp(`\\b${pp}\\b`, 'i').test(spokenNormalizedTranscript.toLowerCase())) {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }
    }
  }

  // 4. Numeric Code Matching (SEBI Audio Audit standard):
  // When clients or advisors confirm identity, they routinely state the numeric code (e.g. "26779" for WIA26779, or "81138" for WIA81138, or "9767", or "123").
  const numericPartMatch = normCode.match(/\d{2,8}/);
  if (numericPartMatch) {
    const numPart = numericPartMatch[0];

    // a) Direct numeric boundary or spaced match in transcript
    const numSpacedPat = numPart.split('').join('[\\s\\-_.]*');
    if (new RegExp(`\\b${numSpacedPat}\\b`, 'i').test(transcript) || squashedTranscript.includes(numPart) || squashedSpokenTranscript.includes(numPart)) {
      return { matched: true, score: 0.35, matchedVariant: numPart };
    }

    // b) Check spoken digit sequences (e.g. "two six seven seven nine" or "nine seven six seven")
    if (spokenNormalizedTranscript.includes(numPart) || spokenNormalizedTranscript.replace(/\D/g, '').includes(numPart)) {
      return { matched: true, score: 0.35, matchedVariant: numPart };
    }
  }

  // 5. 90% Fuzzy Matching on candidate tokens and sliding word windows (e.g. WAS 9767 vs WAA9767)
  const candidateMatches = transcript.match(/\b[A-Za-z0-9\s\-._]{3,14}\b/g) || [];
  for (const rawCand of candidateMatches) {
    const candNorm = normalizeClientCode(rawCand);
    if (!candNorm || candNorm.length < 3) continue;

    // Direct similarity check
    const sim = fuzzySimilarity(candNorm, normCode);
    if (sim >= 0.80) {
      return { matched: true, score: 0.35, matchedVariant: normCode };
    }

    // Numeric suffix exact match with prefix tolerance (e.g. WAS 9767 vs WAA 9767)
    const candNum = candNorm.replace(/\D/g, '');
    const codeNum = normCode.replace(/\D/g, '');
    const candPrefix = candNorm.replace(/\d/g, '');
    const codePrefix = normCode.replace(/\d/g, '');
    if (candNum && codeNum && candNum === codeNum && candNum.length >= 2 && levenshteinDistance(candPrefix, codePrefix) <= 1) {
      return { matched: true, score: 0.35, matchedVariant: normCode };
    }
  }

  // Check 1 to 5 word sliding windows across raw transcript and spoken normalized transcript
  const allWordSources = [
    transcript.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
    spokenNormalizedTranscript.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  ];

  for (const words of allWordSources) {
    for (let len = 1; len <= Math.min(5, words.length); len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join('').toUpperCase();
        if (phrase.length >= 3) {
          if (fuzzySimilarity(phrase, normCode) >= 0.80) {
            return { matched: true, score: 0.35, matchedVariant: normCode };
          }
          const candNum = phrase.replace(/\D/g, '');
          const codeNum = normCode.replace(/\D/g, '');
          const candPrefix = phrase.replace(/\d/g, '');
          const codePrefix = normCode.replace(/\d/g, '');
          if (candNum && codeNum && candNum === codeNum && candNum.length >= 2 && levenshteinDistance(candPrefix, codePrefix) <= 1) {
            return { matched: true, score: 0.35, matchedVariant: normCode };
          }
          if (numericPartMatch && phrase.includes(numericPartMatch[0])) {
            return { matched: true, score: 0.35, matchedVariant: normCode };
          }
        }
      }
    }
  }

  // 6. Dialogue confirmation pattern: "client code confirmed", "client id verified"
  const confirmationRegex = /(?:client|ucc|code|account|party)\s*(?:code|id|no|number|verification)?\s*(?:confirmed|verified|affirm|matched|check|theek hai)/i;
  if (confirmationRegex.test(transcript)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  return { matched: false, score: 0 };
}

/**
 * Checks if a stock symbol or any of its known aliases appear in the transcript
 * with speech-tolerant matching and series suffix stripping (e.g. BAJAJFINSV-EQ -> Bajaj Finserv / Bajaj).
 */
export function matchSymbolInTranscript(symbol: string, transcript: string): { matched: boolean; matchedAlias?: string } {
  if (!symbol || !transcript) return { matched: false };

  const rawSymbol = symbol.trim().toUpperCase();
  const baseSymbol = rawSymbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST|E1|N1|GB|IL|IT)$/i, '').replace(/[:.]\w+$/i, '').replace(/[^A-Z0-9&]/gi, '');
  const lowerTranscript = transcript.toLowerCase();
  const lowerBase = baseSymbol.toLowerCase();

  // 1. Direct contains check for base symbol of length >= 4
  if (lowerBase.length >= 4 && lowerTranscript.includes(lowerBase)) {
    return { matched: true, matchedAlias: baseSymbol };
  }

  const candidatesToCheck = Array.from(new Set([rawSymbol, baseSymbol].filter(Boolean)));

  for (const sym of candidatesToCheck) {
    // Exact canonical symbol with word boundaries
    const canonicalRegex = new RegExp(`\\b${sym.toLowerCase()}\\b`, 'i');
    if (canonicalRegex.test(lowerTranscript)) {
      return { matched: true, matchedAlias: sym };
    }

    // Letters with spaces, dots, or hyphens (e.g. "I K S", "I.K.S.", "I-K-S", "T C S")
    if (sym.length >= 2 && sym.length <= 6) {
      const spacedPattern = sym.toLowerCase().split('').join('[\\s.\\-_]*');
      const spacedRegex = new RegExp(`\\b${spacedPattern}\\b`, 'i');
      if (spacedRegex.test(lowerTranscript)) {
        return { matched: true, matchedAlias: sym };
      }
    }

    // Check aliases from dictionary
    // NOTE: If alias is short (< 4 chars, e.g. "LT"), only match on whole word boundaries to prevent false matches inside words like "melt"
    const aliases = SYMBOL_ALIASES[sym] || [];
    for (const alias of aliases) {
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRegex = new RegExp(`\\b${aliasEscaped}\\b`, 'i');
      if (aliasRegex.test(lowerTranscript) || (alias.length >= 4 && lowerTranscript.includes(alias.toLowerCase()))) {
        return { matched: true, matchedAlias: alias };
      }
    }
  }

  // Token-level heuristic check: e.g. BAJAJFINSV -> contains "bajaj" or "finserv", KAJARIACER -> "kajaria"
  const tokens = baseSymbol.toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const token of tokens) {
    if (lowerTranscript.includes(token)) {
      return { matched: true, matchedAlias: token };
    }
  }

  // 90% Fuzzy Match for stock symbol/name against transcript tokens and n-grams
  const allWords = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const targetStockNames = Array.from(new Set([
    baseSymbol.toLowerCase(),
    rawSymbol.toLowerCase(),
    ...(SYMBOL_ALIASES[rawSymbol] || []).map((a) => a.toLowerCase()),
    ...(SYMBOL_ALIASES[baseSymbol] || []).map((a) => a.toLowerCase()),
  ].filter((s) => s.length >= 3)));

  for (let len = 1; len <= 3; len++) {
    for (let i = 0; i <= allWords.length - len; i++) {
      const phrase = allWords.slice(i, i + len).join('');
      const phraseWithSpace = allWords.slice(i, i + len).join(' ');
      if (phrase.length < 3) continue;

      for (const target of targetStockNames) {
        const cleanTarget = target.replace(/[^a-z0-9]/g, '');
        if (cleanTarget.length < 3) continue;

        if (phrase === cleanTarget || phraseWithSpace === target) {
          return { matched: true, matchedAlias: target };
        }
        if (cleanTarget.length >= 4 && (phrase.startsWith(cleanTarget) || cleanTarget.startsWith(phrase))) {
          return { matched: true, matchedAlias: target };
        }
        if (fuzzySimilarity(phrase, cleanTarget) >= 0.80) {
          return { matched: true, matchedAlias: target };
        }
      }
    }
  }

  return { matched: false };
}

/**
 * Normalizes stock name/symbol and resolves aliases to canonical symbol.
 */
export function normalizeStockName(input: string): { canonical: string; matchedAlias: string } {
  if (!input) return { canonical: '', matchedAlias: '' };
  const clean = input.trim();
  const upper = clean.toUpperCase();

  // Direct canonical check
  if (SYMBOL_ALIASES[upper]) {
    return { canonical: upper, matchedAlias: clean };
  }

  // Check alias dictionary
  for (const [canonical, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      if (clean.toLowerCase() === alias.toLowerCase() || new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean.toLowerCase())) {
        return { canonical, matchedAlias: alias };
      }
    }
  }

  return { canonical: upper.replace(/[^A-Z0-9&]/g, ''), matchedAlias: clean };
}

/**
 * Normalizes contract/derivative expressions (e.g. NIFTY 24000 CE, BankNifty Put).
 */
export function normalizeContractDerivative(text: string): string {
  if (!text) return '';
  let res = normalizeSpokenNumbers(text).toUpperCase();
  res = res.replace(/\bCALL(?:\s+OPTION)?\b/g, 'CE').replace(/\bPUT(?:\s+OPTION)?\b/g, 'PE');
  res = res.replace(/\bBANK\s*NIFTY\b/g, 'BANKNIFTY');
  return res;
}

/**
 * Normalizes buy/sell order side from spoken language.
 */
export function normalizeOrderSide(text: string): 'BUY' | 'SELL' | 'UNKNOWN' {
  const det = detectBuySell(text);
  return det.side || 'UNKNOWN';
}

/**
 * Tokenizes text and extracts all discrete numeric concepts (avoiding substring collisions).
 * Supports standard integers, decimals, comma separators, currency symbols, AND spoken numbers.
 * e.g., "₹2,450.00", "2450", "2450.50", "one eighty point fifty", "do sau pachaas", "five hundred", "pachaas"
 */
export function extractNumericTokens(text: string): number[] {
  if (!text) return [];
  const numbers: number[] = [];
  const seen = new Set<number>();

  const addNum = (num: number) => {
    if (!isNaN(num) && num > 0) {
      const rounded = Math.round(num * 100) / 100;
      if (!seen.has(rounded)) {
        seen.add(rounded);
        numbers.push(rounded);
      }
    }
  };

  // 1. Match full discrete numeric tokens with boundary protection
  const matches = text.match(/\b(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/gi);
  if (matches) {
    for (const m of matches) {
      const cleaned = m.replace(/[^0-9.]/g, '');
      const num = parseFloat(cleaned);
      addNum(num);
    }
  }

  // 2. Look for spoken number sequences (1 to 5 words) in English & Hindi
  const words = text.toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    // Try n-grams from 5 down to 1
    for (let len = Math.min(5, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      const parsed = parseSpokenNumberPhrase(phrase);
      if (parsed !== null && parsed > 0) {
        addNum(parsed);
      }
    }
  }

  return numbers;
}

/**
 * Detects Buy vs Sell intent with polarity and negation awareness.
 */
export function detectBuySell(text: string): { side?: 'BUY' | 'SELL'; quote?: string; confidence: number; conflict: boolean } {
  if (!text) return { confidence: 0, conflict: false };
  const lower = text.toLowerCase();

  const buyPatterns = [
    /\b(?:buy|buying|purchase|purchasing|kharid|kharidna|kharido|kharid lo|le lo|long|lena hai|laga do|dal do|place|order place)\b/i,
  ];
  const sellPatterns = [
    /\b(?:sell|selling|sold|bech|bechna|becho|bech do|de do|short|square off|squareoff|dena hai)\b/i,
  ];

  let hasBuy = false;
  let hasSell = false;
  let buyQuote = '';
  let sellQuote = '';

  for (const p of buyPatterns) {
    const m = lower.match(p);
    if (m) {
      hasBuy = true;
      buyQuote = m[0];
      break;
    }
  }
  for (const p of sellPatterns) {
    const m = lower.match(p);
    if (m) {
      hasSell = true;
      sellQuote = m[0];
      break;
    }
  }

  if (hasBuy && hasSell) {
    return { conflict: true, confidence: 0.5, quote: `${buyQuote} vs ${sellQuote}` };
  }
  if (hasBuy) {
    return { side: 'BUY', quote: buyQuote, confidence: 0.95, conflict: false };
  }
  if (hasSell) {
    return { side: 'SELL', quote: sellQuote, confidence: 0.95, conflict: false };
  }
  return { confidence: 0, conflict: false };
}

/**
 * Detects Call vs Put options with strike price and conflict awareness.
 */
export function detectCallPut(text: string): { type?: 'CALL' | 'PUT'; strike?: number; quote?: string; confidence: number; conflict: boolean } {
  if (!text) return { confidence: 0, conflict: false };
  const lower = text.toLowerCase();

  const callMatch = lower.match(/\b(?:call|ce|call option)\b/i);
  const putMatch = lower.match(/\b(?:put|pe|put option)\b/i);

  let strike: number | undefined;
  const strikeMatch = lower.match(/\b(\d{4,6})\s*(?:ce|pe|call|put)\b/i) || lower.match(/\b(?:ce|pe|call|put)\s*(\d{4,6})\b/i);
  if (strikeMatch) {
    strike = parseInt(strikeMatch[1], 10);
  }

  if (callMatch && putMatch) {
    return { conflict: true, confidence: 0.5, quote: `${callMatch[0]} vs ${putMatch[0]}` };
  }
  if (callMatch) {
    return { type: 'CALL', strike, quote: callMatch[0], confidence: 0.95, conflict: false };
  }
  if (putMatch) {
    return { type: 'PUT', strike, quote: putMatch[0], confidence: 0.95, conflict: false };
  }
  return { confidence: 0, conflict: false };
}

/**
 * Evaluates Customer Acknowledgement (Q4) with Polarity, Negation, and Speaker Context.
 * Rule:
 *  - Clear affirmative: "Yes", "Okay", "Execute", "Proceed", "Haan theek hai", "Kar do"
 *  - Explicit Negation / Rejection: "No", "Don't execute", "Wait", "Cancel", "Nahi", "Mat karo"
 *  - Negation overrides simple assent! e.g. "No, I don't want to proceed" -> NOT confirmed!
 */
export function evaluateCustomerAcknowledgement(
  transcript: string,
  speaker?: string
): { confirmed: boolean; quote: string; reason: string; confidence: number } {
  if (!transcript) {
    return { confirmed: false, quote: '', reason: 'Transcript is empty.', confidence: 0 };
  }

  // If dialogue contains explicit customer/client turns, extract them first
  let evalText = transcript;
  const clientLines = transcript
    .split(/\n+/)
    .filter((line) => /^\s*(?:client|customer|caller|speaker\s*2)\s*:/i.test(line));

  if (clientLines.length > 0) {
    evalText = clientLines.map((l) => l.replace(/^\s*(?:client|customer|caller|speaker\s*2)\s*:\s*/i, '')).join(' ');
  }

  // Remove common advisor risk/guarantee disclaimers so "No return guarantee" doesn't falsely trigger customer rejection
  const cleanedText = evalText
    .replace(/\bno\s+(?:return|profit|guarantee|assurance|commitment|promise)\b/gi, '')
    .replace(/\b(?:not|cannot|doesn't|don't)\s+guarantee\b/gi, '');

  const lower = cleanedText.toLowerCase();

  // Explicit rejection phrases
  const rejectionPatterns = [
    /\b(?:no|don't|do not|cancel|stop|wait|hold on|reject|disagree|wrong|nahi|mat karo|ruk jao|cancel karo|mat dalo)\b/i,
    /\b(?:not now|don't place|do not execute|don't want to proceed|not interested)\b/i,
  ];

  for (const rp of rejectionPatterns) {
    const match = lower.match(rp);
    if (match) {
      // Find sentence containing rejection
      const sentences = evalText.split(/[.?!;\n]+/);
      const rejSentence = sentences.find((s) => rp.test(s)) || match[0];
      return {
        confirmed: false,
        quote: rejSentence.trim(),
        reason: `Customer explicitly rejected, halted, or expressed negation: "${rejSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Clear affirmative confirmation phrases
  const affirmativePatterns = [
    /\b(?:yes|yeah|yep|proceed|execute|confirm|confirmed|place the order|do it|done|agreed|approved)\b/i,
    /\b(?:haan|theek hai|kar do|laga do|dal do|daal do|sahi hai|chalega|ok proceed|yes please)\b/i,
  ];

  for (const ap of affirmativePatterns) {
    const match = lower.match(ap);
    if (match) {
      const sentences = evalText.split(/[.?!;\n]+/);
      const affSentence = sentences.find((s) => ap.test(s)) || match[0];
      return {
        confirmed: true,
        quote: affSentence.trim(),
        reason: `Customer gave explicit affirmative consent: "${affSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Bare "okay" or "sure"
  if (/\b(?:okay|ok|sure|fine)\b/i.test(lower)) {
    return {
      confirmed: true,
      quote: 'okay',
      reason: 'Customer acknowledged with affirmative conversational agreement.',
      confidence: 0.85,
    };
  }

  return {
    confirmed: false,
    quote: '',
    reason: 'No clear customer confirmation or acknowledgement found in transcript.',
    confidence: 0.80,
  };
}

/**
 * Evaluates Return Commitment / Guarantees (Q5) with Semantic Context, Polarity & Negation.
 * Rule:
 *  - "I guarantee you will make money" -> VIOLATION (FAIL)
 *  - "I cannot guarantee returns" / "No return guarantee" -> COMPLIANT (PASS)
 *  - "Stock market involves risk" / "Past performance doesn't guarantee" -> COMPLIANT (PASS)
 */
export function evaluateReturnCommitment(
  transcript: string
): { hasCommitment: boolean; quote: string; reason: string; confidence: number } {
  if (!transcript) {
    return { hasCommitment: false, quote: '', reason: 'No dialogue recorded.', confidence: 0.95 };
  }

  const lower = transcript.toLowerCase();

  // Negated guarantee statements (Compliance Safe / PASS)
  const safeDisclaimerPatterns = [
    /\b(?:cannot guarantee|can't guarantee|no guarantee|not guarantee|does not guarantee|do not guarantee)\b/i,
    /\b(?:guarantee nahi|koi guarantee nahi|pakka nahi hai|risk rehta hai|market risk)\b/i,
    /\b(?:subject to market risks?|past performance does not guarantee)\b/i,
  ];

  for (const sdp of safeDisclaimerPatterns) {
    if (sdp.test(lower)) {
      const sentences = transcript.split(/[.?!;\n]+/);
      const safeSentence = sentences.find((s) => sdp.test(s)) || 'Disclaimer provided';
      return {
        hasCommitment: false,
        quote: safeSentence.trim(),
        reason: `Advisor correctly stated non-guarantee/regulatory risk disclaimer: "${safeSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Prohibited Return / Profit Guarantees (Fatal Violation)
  const prohibitedGuaranteePatterns = [
    /\bguaranteed\s+(?:\d+%\s+)?(?:return|profit|gain|target|income)\b/i,
    /\bguaranteed\s+\d+%/i,
    /\b(?:guarantee hai|pakka profit|fixed profit|guaranteed return|guaranteed profit|double hoga|double return)\b/i,
    /\b(?:100% safe|risk free return|risk-free profit|sure shot profit|definitely double)\b/i,
    /\b(?:i guarantee you|we guarantee you|guaranteed target|loss nahi hoga|paisa banega hi banega)\b/i,
  ];

  for (const pgp of prohibitedGuaranteePatterns) {
    const match = lower.match(pgp);
    if (match) {
      const sentences = transcript.split(/[.?!;\n]+/);
      const badSentence = sentences.find((s) => pgp.test(s)) || match[0];
      return {
        hasCommitment: true,
        quote: badSentence.trim(),
        reason: `Advisor made prohibited verbal return/profit commitment: "${badSentence.trim()}".`,
        confidence: 0.98,
      };
    }
  }

  return {
    hasCommitment: false,
    quote: 'No return commitment made.',
    reason: 'Adviser made no return or profit commitments or guarantees during the conversation.',
    confidence: 0.95,
  };
}

/**
 * Checks if CMP / verbal market price is indicated in the transcript
 */
export const MARKET_PRICE_PHRASES = [
  'current market price',
  'current marker price',
  'market price',
  'marker price',
  'cmp',
  'c.m.p',
  'c.m.p.',
  'c m p',
  'c m p pe',
  'cmp pe',
  'cmp par',
  'cmp rate',
  'cmp exit',
  'see em pee',
  'market rate',
  'marker rate',
  'at market',
  'at market price',
  'market pe',
  'market par',
  'market mein',
  'market me',
  'current price',
  'current rate',
  'current market rate',
  'current bhav',
  'current bhav pe',
  'current bhav par',
  'market bhav',
  'market order',
  'market execution',
  'order at market',
  'jo rate hai',
  'jo rate chal raha',
  'jo rate chal raha hai',
  'jo chal raha hai',
  'jo chal raha',
  'current chal raha',
  'jo bhi bhav hai',
  'live rate',
  'live market rate',
  'live market price',
  'rate pe',
  'rate jo hai',
  'bhav pe',
  'bhav pe le lo',
  'market pe le lo',
  'market pe de do',
  'market pe kar do',
  'market pe laga do',
  'market pe exit',
  'market mein exit',
  'market rate pe',
  'market price pe',
  'market price exit',
  'limit price',
  'limit rate',
  'best price',
  'rate pe kar do',
  'order type market',
  'market order laga do',
  'market mein buy',
  'market me buy',
  'market buy',
  'market sell',
];

export function mentionsMarketPriceOrCMP(transcript: string): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  if (MARKET_PRICE_PHRASES.some((phrase) => lower.includes(phrase))) {
    return true;
  }
  // Regex pattern for variations of market order / CMP / live rate / bhav
  const cmpRegex = /\b(?:cmp|current\s*market\s*price|current\s*marker\s*price|marker\s*price|market\s*rate|at\s*market|bhav\s*(?:pe|par|per|se)|market\s*(?:pe|par|mein|me|order))\b/i;
  return cmpRegex.test(transcript);
}

/**
 * Robust check if a target trade price appears in the transcript with tokenization
 * or if verbal Current Market Price (CMP) is explicitly confirmed.
 */
export function matchPriceInTranscript(targetPrice: number, transcript: string): boolean {
  if (!transcript) return false;

  // If order is placed at Current Market Price (CMP) or price is 0, verbal CMP confirmation is 100% compliant
  if (mentionsMarketPriceOrCMP(transcript)) {
    return true;
  }

  if (!targetPrice || targetPrice <= 0) return false;

  const tokens = extractNumericTokens(transcript);
  const roundedTarget = Math.round(targetPrice);

  for (const token of tokens) {
    // 1. Exact or cent match
    if (Math.abs(token - targetPrice) < 0.05) {
      return true;
    }
    // 2. Rounded integer match (e.g. 180 vs 180.50)
    if (Math.abs(token - roundedTarget) === 0) {
      return true;
    }
    // 3. 90% Price Match Tolerance (within 10% of target price)
    if (Math.abs(token - targetPrice) / targetPrice <= 0.10) {
      return true;
    }
  }

  // Also check direct substring pattern
  const rawPriceStr = String(targetPrice);
  if (new RegExp(`\\b${rawPriceStr}\\b`).test(transcript)) {
    return true;
  }

  return false;
}

/**
 * Robust check if a target trade quantity appears in the transcript with tokenization.
 * Prevents 100 matching inside 1000, with 90% match tolerance and spoken word support.
 */
export function matchQuantityInTranscript(targetQuantity: number, transcript: string): boolean {
  if (!targetQuantity || targetQuantity <= 0 || !transcript) return false;

  const lower = transcript.toLowerCase();

  // Explicit position liquidation / full holding exit confirmed verbally:
  // e.g. "sara bech do", "pura quantity exit", "full position square off", "all shares", "entire holding"
  const fullExitPatterns = [
    /\b(?:sara|saara|poora|pura|entire|complete|all)\s*(?:bech|exit|sell|square\s*off|shares?|holding|quantit(?:y|ies))\b/i,
    /\b(?:full\s*position|full\s*quantity|all\s*shares|pura\s*exit|sara\s*exit)\b/i,
  ];
  if (fullExitPatterns.some((pat) => pat.test(lower))) {
    return true;
  }

  const tokens = extractNumericTokens(transcript);
  const spokenNormalizedTranscript = normalizeSpokenNumbers(transcript);
  const allTokens = Array.from(new Set([...tokens, ...extractNumericTokens(spokenNormalizedTranscript)]));

  for (const token of allTokens) {
    if (Math.abs(token - targetQuantity) < 0.01) {
      return true;
    }
    // 90% Quantity Match Tolerance (within 10% or +/- 1 unit)
    if (Math.abs(token - targetQuantity) / targetQuantity <= 0.10 || Math.abs(token - targetQuantity) <= 1) {
      return true;
    }
  }

  const rawQtyStr = String(Math.round(targetQuantity));
  if (new RegExp(`\\b${rawQtyStr}\\b`).test(transcript)) {
    return true;
  }

  // Spoken number words in Hindi and English
  const spokenQtyMap: Record<number, string[]> = {
    1: ['one', 'ek', 'single'],
    2: ['two', 'do'],
    3: ['three', 'teen'],
    4: ['four', 'char', 'chaar'],
    5: ['five', 'paanch', 'panch'],
    6: ['six', 'chhe', 'che'],
    7: ['seven', 'saat'],
    8: ['eight', 'aath'],
    9: ['nine', 'nau'],
    10: ['ten', 'das'],
    12: ['twelve', 'barah', 'bara'],
    15: ['fifteen', 'pandrah'],
    16: ['sixteen', 'solah'],
    20: ['twenty', 'bees'],
    25: ['twenty five', 'pachis'],
    50: ['fifty', 'pachaas', 'pachas'],
    75: ['seventy five', 'pachhattar'],
    100: ['hundred', 'sau', 'ek sau', 'one hundred'],
    200: ['two hundred', 'do sau'],
    500: ['five hundred', 'paansau'],
    1000: ['thousand', 'hazaar'],
  };

  const words = spokenQtyMap[Math.round(targetQuantity)] || [];
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(transcript)) {
      return true;
    }
  }

  // Also check if any generic quantity pattern matches transcript (e.g. "X shares", "X lots", "X quantities")
  const sharesMatches = Array.from(transcript.matchAll(/\b(\d+)\s*(?:shares?|lots?|qty|quantities|nag|hisse|piece|share)\b/gi));
  for (const m of sharesMatches) {
    const parsedQty = parseInt(m[1], 10);
    if (parsedQty > 0 && (Math.abs(parsedQty - targetQuantity) / targetQuantity <= 0.10 || Math.abs(parsedQty - targetQuantity) <= 1)) {
      return true;
    }
  }

  return false;
}
