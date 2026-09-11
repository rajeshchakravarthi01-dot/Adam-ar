import React from 'react';
import { SYMBOL_ALIASES } from '../../server/normalizer';

interface TranscriptHighlighterProps {
  transcript: string;
  clientCode?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  className?: string;
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

interface HighlightSpan {
  start: number;
  end: number;
  type: 'client' | 'stock' | 'price' | 'quantity' | 'guarantee';
  text: string;
  label: string;
}

export const TranscriptHighlighter: React.FC<TranscriptHighlighterProps> = ({
  transcript,
  clientCode,
  symbol,
  price,
  quantity,
  className = '',
}) => {
  if (!transcript || !transcript.trim()) {
    return <span className="text-neutral-500 italic">(No transcript text available)</span>;
  }

  const spans: HighlightSpan[] = [];

  // 1. Client Code Highlights
  if (clientCode) {
    const cleanCode = clientCode.trim();
    if (cleanCode.length >= 3) {
      // Direct and spaced patterns
      const spaced = cleanCode.split('').join('[\\s\\-_]*');
      const reg = new RegExp(`\\b${spaced}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = reg.exec(transcript)) !== null) {
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

  // General client patterns in transcript
  for (const p of CLIENT_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(transcript)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'client',
        text: m[0],
        label: 'Client ID',
      });
    }
  }

  // 2. Stock / Scrip Name Highlights
  if (symbol) {
    const cleanSym = symbol.trim().toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
    const reg = new RegExp(`\\b${cleanSym}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = reg.exec(transcript)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'stock',
        text: m[0],
        label: 'Stock Symbol',
      });
    }

    // Check known aliases for this symbol
    const aliases = SYMBOL_ALIASES[cleanSym] || [];
    for (const alias of aliases) {
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasReg = new RegExp(`\\b${aliasEscaped}\\b`, 'gi');
      let am: RegExpExecArray | null;
      while ((am = aliasReg.exec(transcript)) !== null) {
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

  // Also scan for all well-known scrips in SYMBOL_ALIASES
  for (const [symKey, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      if (alias.length < 4) continue; // skip very short tokens
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasReg = new RegExp(`\\b${aliasEscaped}\\b`, 'gi');
      let am: RegExpExecArray | null;
      while ((am = aliasReg.exec(transcript)) !== null) {
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

  // 3. Price & CMP Highlights
  if (price && price > 0) {
    const priceStr = String(price);
    const pReg = new RegExp(`(?:₹|rs\\.?|at)?\\s*\\b${priceStr}\\b(?:\\.\\d{1,2})?`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(transcript)) !== null) {
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
    while ((m = p.exec(transcript)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'price',
        text: m[0],
        label: 'Execution Price / CMP',
      });
    }
  }

  // 4. Quantity Highlights
  if (quantity && quantity > 0) {
    const qReg = new RegExp(`\\b${quantity}\\b(?:\\s*(?:quantities|quantity|qty|shares|share|lots?|units?))?`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = qReg.exec(transcript)) !== null) {
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
    while ((m = p.exec(transcript)) !== null) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'quantity',
        text: m[0],
        label: 'Order Quantity',
      });
    }
  }

  // 5. Prohibited Guarantee / Return Commitment Highlights (Q5 Fatal)
  for (const p of GUARANTEE_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(transcript)) !== null) {
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
      // Give highest precedence to fatal guarantee detection
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
      elements.push(transcript.slice(currentIndex, span.start));
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
        key={`highlight-${i}`}
        className={`${badgeClasses} inline-block my-0.5`}
        title={span.label}
      >
        {span.text}
        <span className="text-[9px] opacity-75 ml-1 font-mono uppercase">[{span.type}]</span>
      </mark>
    );

    currentIndex = span.end;
  }

  if (currentIndex < transcript.length) {
    elements.push(transcript.slice(currentIndex));
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Visual Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] pb-2 border-b border-neutral-800 text-neutral-300">
        <span className="text-neutral-400 font-semibold uppercase tracking-wider">Highlights:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Client ID</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Stock Name</span>
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
          <span className="text-rose-300 font-bold">Guarantees / Commitments (Fatal)</span>
        </span>
      </div>

      {/* Rendered Text with Highlighting */}
      <div className="leading-relaxed whitespace-pre-wrap select-text font-mono text-xs">
        {elements}
      </div>
    </div>
  );
};
