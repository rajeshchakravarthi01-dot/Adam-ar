import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Headset,
  User,
  Copy,
  Check,
  Search,
  Filter,
  MessageSquare,
  FileText,
  AlertTriangle,
  Volume2,
  Play,
} from 'lucide-react';
import { SYMBOL_ALIASES } from '../../server/normalizer';

export interface CallSegmentItem {
  id?: number;
  segment_id?: string | number;
  start_time: number;
  end_time: number;
  speaker?: string;
  text: string;
}

export interface TranscriptHighlighterProps {
  transcript: string;
  clientCode?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  advisorName?: string;
  clientName?: string;
  className?: string;
  defaultView?: 'dialogue' | 'raw';
  currentTime?: number;
  onSeek?: (seconds: number) => void;
  segments?: CallSegmentItem[];
  isPlaying?: boolean;
}

export type SpeakerType = 'ADVISOR' | 'CLIENT' | 'SYSTEM' | 'UNKNOWN';

export interface DialogueTurn {
  id: string;
  index: number;
  speaker: SpeakerType;
  timestamp?: string;
  startTime?: number;
  endTime?: number;
  text: string;
  raw: string;
}

// Prohibited return commitment phrases (SEBI Q5 fatal violation markers)
const GUARANTEE_PATTERNS = [
  /\b(?:guarantee|guaranteed|guaranteeing|pakka\s*return|sure\s*shot|100%\s*profit|fixed\s*return|assured\s*return|double\s*ho\s*jayega|no\s*risk|safe\s*hai\s*poora|loss\s*nahi\s*hoga|pakka\s*hai|definitely\s*double|risk\s*free|zero\s*risk|100%\s*sure|har\s*haal\s*mein\s*profit)\b/gi,
];

// Price / CMP verbal expressions
const PRICE_PATTERNS = [
  /\b(?:cmp|current\s*market\s*price|market\s*price|at\s*market|bhav|market\s*rate|at\s*cmp)\b/gi,
  /(?:₹|rs\.?|inr|price|rate|at|bhav)?\s*(?:\d+(?:\.\d{1,2})?)\s*(?:rupees?|bucks?|inr|\/-)?\b/gi,
];

// Quantity verbal expressions
const QUANTITY_PATTERNS = [
  /\b\d+\s*(?:quantities|quantity|qty|shares|share|lots?|units?|scrips?)\b/gi,
  /\b(?:quantity|qty|shares?|volume)\s*(?:is|of|:)?\s*\d+\b/gi,
];

// Client Code verbal expressions
const CLIENT_PATTERNS = [
  /\b(?:client\s*(?:id|code|ucc|account|number)?|ucc|account|party\s*code)\s*(?:is|:|-)?\s*([a-zA-Z0-9\-_]{3,12})\b/gi,
  /\b([a-zA-Z]{1,5}\s*(?:-|\s)?\s*\d{3,8})\b/gi,
];

// Conversational cues for speaker attribution fallback
const ADVISOR_CUES = [
  /\b(?:good morning|good afternoon|good evening|hello)\s*(?:sir|madam|mr|mrs|dr)?\b/i,
  /\b(?:calling from|this is\s+[a-z\s]+from|relationship manager|wealth advisor|dealer)\b/i,
  /\b(?:fundsindia|funds\s*india|equity\s*desk|broking\s*desk)\b/i,
  /\b(?:how can i help|can we buy|we can purchase|we recommend|current market price is|cmp is|limit price is)\b/i,
  /\b(?:confirming your order|order has been placed|executing on nse|executing on bse)\b/i,
  /\b(?:can you confirm your client code|your ucc is|confirming account|registered mobile)\b/i,
  /\b(?:shall i place|should i place|placing the order for|buying for you|selling for you)\b/i,
  /\b(?:se bol raha hoon|se bol rahi hoon|dealer bol raha|order punch kar|order place kar)\b/i,
  /\b(?:aapka client code|aapka ucc|bhav chal raha|current market price hai)\b/i,
  /\b(?:aapke behalf pe|hum buy kar rahe|hum sell kar rahe|order execute kar rahe)\b/i,
];

const CLIENT_CUES = [
  /\b(?:yes please|yeah please|yes place it|go ahead|okay please|do it)\b/i,
  /\b(?:yes buy|yes sell|buy it|sell it|execute it)\b/i,
  /\b(?:how much balance|how many shares|what is my margin|check my portfolio)\b/i,
  /\b(?:i want to buy|i want to sell|please buy|please sell)\b/i,
  /\b(?:yes that's correct|yes it is|correct|that is my code)\b/i,
  /\b(?:haan ji|haanji|haan bolo|theek hai|kar do|kar dijiye|le lo|bech do|kharid lo|exit maaro)\b/i,
  /\b(?:mera order status|kitna rate hai|kya bhav hai|balance batao|portfolio check)\b/i,
  /\b(?:bilkul confirm hai|execute kar do|punch kar do|daal do)\b/i,
];

interface HighlightSpan {
  start: number;
  end: number;
  type: 'client' | 'stock' | 'price' | 'quantity' | 'guarantee';
  text: string;
  label: string;
}

/**
 * Applies entity highlights to an arbitrary string of text
 */
function highlightEntities(
  text: string,
  clientCode?: string,
  symbol?: string,
  price?: number,
  quantity?: number
): React.ReactNode[] {
  if (!text) return [];

  const spans: HighlightSpan[] = [];

  // 1. Client Code
  if (clientCode) {
    const cleanCode = clientCode.trim();
    if (cleanCode.length >= 3) {
      const spaced = cleanCode.split('').join('[\\s\\-_]*');
      const reg = new RegExp(`\\b${spaced}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = reg.exec(text)) !== null) {
        spans.push({
          start: m.index,
          end: m.index + m[0].length,
          type: 'client',
          text: m[0],
          label: 'Client ID',
        });
      }
    }
  }

  for (const p of CLIENT_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'client',
        text: m[0],
        label: 'Client ID',
      });
    }
  }

  // 2. Stock / Scrip Name
  if (symbol) {
    const cleanSym = symbol.trim().toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
    const reg = new RegExp(`\\b${cleanSym}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = reg.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'stock',
        text: m[0],
        label: `Stock (${cleanSym})`,
      });
    }

    const aliases = SYMBOL_ALIASES[cleanSym] || [];
    for (const alias of aliases) {
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasReg = new RegExp(`\\b${aliasEscaped}\\b`, 'gi');
      let am: RegExpExecArray | null;
      while ((am = aliasReg.exec(text)) !== null) {
        spans.push({
          start: am.index,
          end: am.index + am[0].length,
          type: 'stock',
          text: am[0],
          label: `Stock (${cleanSym})`,
        });
      }
    }
  }

  // Scan for well-known aliases
  for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasReg = new RegExp(`\\b${aliasEscaped}\\b`, 'gi');
      let am: RegExpExecArray | null;
      while ((am = aliasReg.exec(text)) !== null) {
        spans.push({
          start: am.index,
          end: am.index + am[0].length,
          type: 'stock',
          text: am[0],
          label: `Stock (${symKey})`,
        });
      }
    }
  }

  // 3. Price & CMP
  if (price && price > 0) {
    const priceStr = String(price);
    const pReg = new RegExp(`(?:₹|rs\\.?|at)?\\s*\\b${priceStr}\\b(?:\\.\\d{1,2})?`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'price',
        text: m[0],
        label: `Price (₹${price})`,
      });
    }
  }

  for (const p of PRICE_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'price',
        text: m[0],
        label: 'Execution Price / CMP',
      });
    }
  }

  // 4. Quantity
  if (quantity && quantity > 0) {
    const qReg = new RegExp(`\\b${quantity}\\b(?:\\s*(?:quantities|quantity|qty|shares|share|lots?|units?))?`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = qReg.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'quantity',
        text: m[0],
        label: `Qty (${quantity})`,
      });
    }
  }

  for (const p of QUANTITY_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'quantity',
        text: m[0],
        label: 'Order Quantity',
      });
    }
  }

  // 5. Prohibited Guarantees
  for (const p of GUARANTEE_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'guarantee',
        text: m[0],
        label: 'PROHIBITED GUARANTEE (FATAL)',
      });
    }
  }

  // Deduplicate and resolve overlapping spans (guarantee > client > stock > price > quantity)
  spans.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping: HighlightSpan[] = [];
  let lastEnd = 0;

  for (const s of spans) {
    if (s.start >= lastEnd) {
      nonOverlapping.push(s);
      lastEnd = s.end;
    } else if (s.type === 'guarantee' && nonOverlapping.length > 0) {
      const prev = nonOverlapping[nonOverlapping.length - 1];
      if (prev.type !== 'guarantee') {
        nonOverlapping.pop();
        nonOverlapping.push(s);
        lastEnd = s.end;
      }
    }
  }

  // Construct highlighted segments
  const elements: React.ReactNode[] = [];
  let currentIndex = 0;

  for (let i = 0; i < nonOverlapping.length; i++) {
    const span = nonOverlapping[i];

    if (span.start > currentIndex) {
      elements.push(text.slice(currentIndex, span.start));
    }

    const badgeClasses = {
      client: 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 rounded px-1 font-bold',
      stock: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded px-1 font-bold',
      price: 'bg-purple-500/20 text-purple-300 border border-purple-400/40 rounded px-1 font-bold',
      quantity: 'bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded px-1 font-bold',
      guarantee: 'bg-rose-500/30 text-rose-300 border border-rose-500/60 rounded px-1 font-bold underline decoration-rose-500 decoration-2',
    }[span.type];

    elements.push(
      <mark
        key={`hl-${i}-${span.start}`}
        className={`${badgeClasses} inline-block my-0.5`}
        title={span.label}
      >
        {span.text}
        <span className="text-[9px] opacity-75 ml-1 font-mono uppercase">[{span.type}]</span>
      </mark>
    );

    currentIndex = span.end;
  }

  if (currentIndex < text.length) {
    elements.push(text.slice(currentIndex));
  }

  return elements;
}

/**
 * Helper to convert "MM:SS" or "HH:MM:SS" to seconds
 */
function parseTimestampToSeconds(ts?: string): number | undefined {
  if (!ts) return undefined;
  const parts = ts.split(':').map((p) => parseFloat(p));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

/**
 * Parses a multiline transcript into structured dialogue turns with speaker detection
 */
function parseDialogueTurns(transcript: string, segments?: CallSegmentItem[]): DialogueTurn[] {
  if (segments && segments.length > 0) {
    return segments.map((seg, idx) => {
      let spk: SpeakerType = 'UNKNOWN';
      const rawSpk = (seg.speaker || '').toUpperCase();
      if (rawSpk.includes('ADVISOR') || rawSpk.includes('DEALER') || rawSpk.includes('AGENT')) spk = 'ADVISOR';
      else if (rawSpk.includes('CLIENT') || rawSpk.includes('CUSTOMER') || rawSpk.includes('CALLER')) spk = 'CLIENT';
      else if (rawSpk.includes('SYSTEM') || rawSpk.includes('IVR')) spk = 'SYSTEM';

      const m = Math.floor(seg.start_time / 60);
      const s = Math.floor(seg.start_time % 60);
      const ts = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      return {
        id: `seg-${seg.id || idx}`,
        index: idx + 1,
        speaker: spk,
        timestamp: ts,
        startTime: seg.start_time,
        endTime: seg.end_time,
        text: seg.text,
        raw: `[${ts}] ${spk}: ${seg.text}`,
      };
    });
  }

  if (!transcript || !transcript.trim()) return [];

  const rawLines = transcript.split('\n').map((l) => l.trim()).filter(Boolean);
  const turns: DialogueTurn[] = [];

  let currentSpeaker: SpeakerType = 'UNKNOWN';

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    let timestamp: string | undefined;
    let cleanText = rawLine;
    let explicitSpeaker: SpeakerType | null = null;

    // 1. Extract optional timestamp [00:02] or (00:02)
    const timeMatch = cleanText.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)/);
    if (timeMatch) {
      timestamp = timeMatch[1];
      cleanText = timeMatch[2].trim();
    }

    // 2. Check for explicit speaker labels: Advisor:, Client:, Dealer:, etc.
    const speakerMatch = cleanText.match(/^(?:(advisor|dealer|agent|fundsindia|broker)|(client|customer|caller|user)|(system|ivr|telephony)):\s*(.*)/i);
    if (speakerMatch) {
      if (speakerMatch[1]) {
        explicitSpeaker = 'ADVISOR';
      } else if (speakerMatch[2]) {
        explicitSpeaker = 'CLIENT';
      } else if (speakerMatch[3]) {
        explicitSpeaker = 'SYSTEM';
      }
      cleanText = speakerMatch[4].trim();
    }

    let determinedSpeaker: SpeakerType = explicitSpeaker || 'UNKNOWN';

    // 3. Fallback: Diarization cues if not explicitly tagged
    if (!explicitSpeaker) {
      const isAdvisorCue = ADVISOR_CUES.some((re) => re.test(cleanText));
      const isClientCue = CLIENT_CUES.some((re) => re.test(cleanText));

      if (i === 0 && (isAdvisorCue || /\b(?:good morning|hello|calling|fundsindia)\b/i.test(cleanText))) {
        determinedSpeaker = 'ADVISOR';
      } else if (isAdvisorCue && !isClientCue) {
        determinedSpeaker = 'ADVISOR';
      } else if (isClientCue && !isAdvisorCue) {
        determinedSpeaker = 'CLIENT';
      } else if (currentSpeaker !== 'UNKNOWN') {
        const prevTurn = turns[i - 1];
        if (prevTurn && (/[?]$/.test(prevTurn.text) || (prevTurn.speaker === 'ADVISOR' && /^(?:haan|yes|theek|ok|kar do|place)/i.test(cleanText)))) {
          determinedSpeaker = prevTurn.speaker === 'ADVISOR' ? 'CLIENT' : 'ADVISOR';
        } else {
          determinedSpeaker = currentSpeaker;
        }
      }
    }

    currentSpeaker = determinedSpeaker;

    const parsedStart = parseTimestampToSeconds(timestamp);
    const estStart = parsedStart !== undefined ? parsedStart : i * 5;
    const estEnd = estStart + 4.8;
    const formattedTs = timestamp || `00:${String((i * 5) % 60).padStart(2, '0')}`;

    turns.push({
      id: `turn-${i}`,
      index: i + 1,
      speaker: determinedSpeaker,
      timestamp: formattedTs,
      startTime: estStart,
      endTime: estEnd,
      text: cleanText,
      raw: rawLine,
    });
  }

  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i + 1].startTime !== undefined && turns[i].startTime !== undefined) {
      if (turns[i + 1].startTime! > turns[i].startTime!) {
        turns[i].endTime = turns[i + 1].startTime!;
      }
    }
  }

  return turns;
}

export const TranscriptHighlighter: React.FC<TranscriptHighlighterProps> = ({
  transcript,
  clientCode,
  symbol,
  price,
  quantity,
  advisorName = 'Advisor',
  clientName,
  className = '',
  defaultView = 'dialogue',
  currentTime,
  onSeek,
  segments,
  isPlaying,
}) => {
  const [viewMode, setViewMode] = useState<'dialogue' | 'raw'>(defaultView);
  const [speakerFilter, setSpeakerFilter] = useState<'ALL' | 'ADVISOR' | 'CLIENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Parse turns with segment support
  const turns = useMemo(() => parseDialogueTurns(transcript, segments), [transcript, segments]);

  // Determine active playing turn based on currentTime
  const activeTurnId = useMemo(() => {
    if (currentTime === undefined || currentTime === null) return null;
    const match = turns.find((t) => {
      if (t.startTime !== undefined && t.endTime !== undefined) {
        return currentTime >= t.startTime && currentTime < t.endTime;
      }
      if (t.startTime !== undefined) {
        return Math.abs(currentTime - t.startTime) <= 3;
      }
      return false;
    });
    return match?.id || null;
  }, [turns, currentTime]);

  // Auto-scroll active turn into view
  const activeTurnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeTurnId && activeTurnRef.current) {
      activeTurnRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeTurnId]);

  // Turn counts
  const advisorCount = useMemo(() => turns.filter((t) => t.speaker === 'ADVISOR').length, [turns]);
  const clientCount = useMemo(() => turns.filter((t) => t.speaker === 'CLIENT').length, [turns]);

  // Filtered turns
  const filteredTurns = useMemo(() => {
    return turns.filter((turn) => {
      if (speakerFilter === 'ADVISOR' && turn.speaker !== 'ADVISOR') return false;
      if (speakerFilter === 'CLIENT' && turn.speaker !== 'CLIENT') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return turn.text.toLowerCase().includes(q) || (turn.timestamp && turn.timestamp.includes(q));
      }
      return true;
    });
  }, [turns, speakerFilter, searchQuery]);

  const handleCopy = () => {
    if (!transcript) return;
    const formatted = turns
      .map((t) => `[${t.timestamp || '00:00'}] ${t.speaker}: ${t.text}`)
      .join('\n');
    navigator.clipboard.writeText(formatted || transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!transcript || !transcript.trim()) {
    return (
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 text-center text-neutral-400 italic text-xs">
        (No transcript text available for this recording)
      </div>
    );
  }

  return (
    <div className={`flex flex-col space-y-3 ${className}`}>
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-neutral-800">
        {/* View Switcher & Speaker Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* View Toggle */}
          <div className="inline-flex p-0.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('dialogue')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                viewMode === 'dialogue'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Dialogue Turns</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Raw Text</span>
            </button>
          </div>

          {/* Speaker Tabs (when in Dialogue mode) */}
          {viewMode === 'dialogue' && (
            <div className="inline-flex p-0.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => setSpeakerFilter('ALL')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  speakerFilter === 'ALL'
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                All ({turns.length})
              </button>
              <button
                type="button"
                onClick={() => setSpeakerFilter('ADVISOR')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  speakerFilter === 'ADVISOR'
                    ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50'
                    : 'text-neutral-400 hover:text-indigo-300'
                }`}
              >
                <Headset className="w-3 h-3" />
                <span>Advisor ({advisorCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSpeakerFilter('CLIENT')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  speakerFilter === 'CLIENT'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                    : 'text-neutral-400 hover:text-emerald-300'
                }`}
              >
                <User className="w-3 h-3" />
                <span>Client ({clientCount})</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Tools: Search & Copy */}
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-48"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300"
              >
                ×
              </button>
            )}
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy formatted dialogue"
            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded-lg text-xs transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-neutral-400" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visual Legend & Live Audio Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] pb-1 text-neutral-300">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-neutral-500 font-semibold uppercase tracking-wider">Spoken Entities:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>Client ID / UCC</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Stock Symbol</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span>Price / CMP</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Quantity</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span className="text-rose-300 font-bold">Prohibited Guarantees (Fatal)</span>
          </span>
        </div>

        {currentTime !== undefined && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-medium animate-pulse">
            <Volume2 className="w-3 h-3 text-amber-400" />
            <span>Audio Tracking Active · Click line to jump</span>
          </div>
        )}
      </div>

      {/* Main View Area */}
      {viewMode === 'dialogue' ? (
        /* Dialogue Turn Cards View */
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {filteredTurns.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-500 italic">
              No dialogue turns match the selected filter or search query.
            </div>
          ) : (
            filteredTurns.map((turn) => {
              const isAdvisor = turn.speaker === 'ADVISOR';
              const isClient = turn.speaker === 'CLIENT';
              const isActive = turn.id === activeTurnId;

              return (
                <div
                  key={turn.id}
                  ref={isActive ? activeTurnRef : null}
                  onClick={() => {
                    if (turn.startTime !== undefined && onSeek) {
                      onSeek(turn.startTime);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all text-xs cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/15 border-amber-400 text-neutral-100 shadow-[0_4px_20px_rgba(251,191,36,0.18)] ring-2 ring-amber-400/60 scale-[1.006]'
                      : isAdvisor
                      ? 'bg-neutral-900/90 border-indigo-500/30 shadow-[0_2px_8px_rgba(79,70,229,0.06)] hover:border-indigo-500/60'
                      : isClient
                      ? 'bg-neutral-900/90 border-emerald-500/30 shadow-[0_2px_8px_rgba(16,185,129,0.06)] hover:border-emerald-500/60'
                      : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {/* Speaker Header */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      {isAdvisor ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold text-[11px]">
                          <Headset className="w-3.5 h-3.5 text-indigo-400" />
                          <span>ADVISOR (Dealer)</span>
                          {advisorName && <span className="opacity-75 font-normal">· {advisorName}</span>}
                        </div>
                      ) : isClient ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-[11px]">
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          <span>CLIENT (Customer)</span>
                          {clientCode && <span className="opacity-75 font-mono text-[10px]">[{clientCode}]</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 font-medium text-[11px]">
                          <span>SYSTEM / TELEPHONY</span>
                        </div>
                      )}

                      {/* Playing Now Badge */}
                      {isActive && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-black font-bold text-[10px] animate-pulse">
                          <Volume2 className="w-3 h-3" />
                          PLAYING NOW
                        </span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1">
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        isActive
                          ? 'bg-amber-400 text-neutral-950 font-bold border-amber-300'
                          : 'text-neutral-500 bg-neutral-950 border-neutral-800/80 hover:text-white'
                      }`}>
                        {turn.timestamp || '00:00'}
                      </span>
                    </div>
                  </div>

                  {/* Spoken Turn Content with Evidence Highlights */}
                  <div className={`leading-relaxed font-mono select-text pl-1 ${
                    isActive ? 'text-white font-medium' : 'text-neutral-200'
                  }`}>
                    {highlightEntities(turn.text, clientCode, symbol, price, quantity)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Raw Verbatim Text View with Active Segment Highlighting */
        <div className="p-3 bg-neutral-950 text-neutral-200 font-mono text-xs rounded-xl border border-neutral-800 max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap select-text space-y-1">
          {turns.length > 0 ? (
            turns.map((turn) => {
              const isActive = turn.id === activeTurnId;
              return (
                <div
                  key={turn.id}
                  onClick={() => turn.startTime !== undefined && onSeek && onSeek(turn.startTime)}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    isActive ? 'bg-amber-500/25 border-l-4 border-amber-400 text-white font-medium pl-2' : 'hover:bg-neutral-900/60'
                  }`}
                >
                  <span className="text-neutral-500 mr-2 text-[10px]">[{turn.timestamp || '00:00'}]</span>
                  <span className={turn.speaker === 'ADVISOR' ? 'text-indigo-300 font-semibold mr-2' : turn.speaker === 'CLIENT' ? 'text-emerald-300 font-semibold mr-2' : 'text-neutral-400 mr-2'}>
                    {turn.speaker}:
                  </span>
                  <span>{highlightEntities(turn.text, clientCode, symbol, price, quantity)}</span>
                </div>
              );
            })
          ) : (
            highlightEntities(transcript, clientCode, symbol, price, quantity)
          )}
        </div>
      )}

      {/* Summary Footer */}
      <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-800/60">
        <span>
          Showing {filteredTurns.length} of {turns.length} conversational turns
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Diarization &amp; Evidence Active</span>
        </span>
      </div>
    </div>
  );
};
