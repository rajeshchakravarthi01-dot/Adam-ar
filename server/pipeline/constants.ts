// =============================================================
// AuditEQ — Authoritative Shared Constants & Thresholds
// =============================================================

/**
 * Standardized SCRAP call threshold across the entire system:
 * Calls <= 6 seconds duration are SCRAP.
 * Calls >= 7 seconds are NOT scrap by duration.
 */
export const SCRAP_DURATION_THRESHOLD_SECONDS = 6;

/**
 * Known broker client-code prefixes for FundsIndia & partner broker networks.
 */
export const KNOWN_BROKER_PREFIXES = ['WIA', 'WIG', 'WAS', 'WIC', 'WAA', 'VIA', 'FND'] as const;

/**
 * Common price / index / market context words that must NOT be confused with client codes.
 */
export const PRICE_INDEX_CONTEXT_WORDS = [
  'at', 'to', 'touches', 'touch', 'level', 'levels', 'point', 'points',
  'cmp', 'target', 'nifty', 'banknifty', 'finnifty', 'sensex', 'rate',
  'bhav', 'pe', 'around', 'above', 'below', 'crossing', 'near'
] as const;

/**
 * Telephony automated voicemail, IVR, and switch-off patterns.
 */
export const TELEPHONY_SCRAP_PATTERNS = [
  'please leave a message',
  'leave your message after the tone',
  'record your message after the beep',
  'subscriber is busy',
  'person you are calling is not answering',
  'currently unavailable',
  'switched off',
  'out of coverage area',
  'call rejected',
  'call ended',
  'mailbox is full',
  'number dialed does not exist',
  'number you have dialed is currently switched off',
  'aap jis vyakti ko call kar rahe hain',
  'kripya thodi der baad prayas karein',
  'upalabdha nahi hai',
] as const;

/**
 * Bounded concurrency pool limit for batch pipeline processing.
 */
export const MAX_PIPELINE_CONCURRENCY = 4;
