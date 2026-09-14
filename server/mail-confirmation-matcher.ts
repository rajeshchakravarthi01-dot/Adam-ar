// =============================================================
// ADAM-AR Mail Confirmation & PDF Parser for Missing Calls
//
// Regulatory Mandate:
// When an audio call recording is missing for a trade execution,
// the broker may confirm the pre-order instruction via written client
// mail confirmation / PDF order authorization.
//
// User Matching Rule:
// - Do NOT check client code.
// - Verify:
//   1. Stock Name (script / symbol)
//   2. Quantity (number of shares / lots)
//   3. Price (IF CMP / current market price is mentioned, ignore the price and pass it!)
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { cleanCallerName } from './normalizer';
import type { TradeRecord } from '../src/types';

export interface MailMatchResult {
  tradeId: number;
  symbol: string;
  quantity: number;
  price: number;
  advisor: string;
  client: string;
  tradeDate: string;
  fileName: string;
  matchedBy: string;
  isCmp: boolean;
  scorecardId: number;
  auditId: number;
}

export interface MailConfirmationUploadSummary {
  filesProcessed: number;
  matchedCount: number;
  unmatchedCount: number;
  matches: MailMatchResult[];
  unmatchedFiles: string[];
  errorFiles: Array<{ fileName: string; error: string }>;
}

/**
 * Extracts all plain text from a PDF buffer or fallback text/email file.
 */
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();

  // 1. Try PDF parsing if PDF extension or buffer starts with %PDF
  if (ext === '.pdf' || buffer.slice(0, 5).toString('latin1').startsWith('%PDF')) {
    try {
      // Try dynamic import of pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfLib = require('pdf-parse');
      if (pdfLib && typeof pdfLib.PDFParse === 'function') {
        const parser = new pdfLib.PDFParse({ data: buffer });
        await parser.load();
        const extracted = await parser.getText();
        if (extracted && extracted.trim().length > 0) {
          return extracted;
        }
      } else if (typeof pdfLib === 'function') {
        const res = await pdfLib(buffer);
        if (res && res.text) {
          return res.text;
        }
      }
    } catch (pdfErr) {
      // PDF stream extraction fallback
      console.warn(`[MailParser] Structured PDF parser failed for ${fileName}, applying stream regex:`, (pdfErr as Error).message);
    }

    // PDF raw string stream extraction fallback:
    // Extract text blocks inside parentheses (text) Tj or [(text)] TJ
    const rawContent = buffer.toString('latin1');
    const textChunks: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(rawContent)) !== null) {
      textChunks.push(match[1]);
    }
    if (textChunks.length > 5) {
      return textChunks.join(' ');
    }
  }

  // 2. Plain text / HTML / EML / CSV fallback
  try {
    const utf8Text = buffer.toString('utf-8');
    if (utf8Text && utf8Text.trim().length > 0) {
      return utf8Text;
    }
  } catch {}

  return buffer.toString('latin1');
}

/**
 * Checks if stock symbol matches anywhere in text.
 */
function isSymbolMatch(symbol: string, textUpper: string): boolean {
  if (!symbol) return false;
  const cleanSymbol = symbol.replace(/-(?:EQ|BE|BL|SM)$/i, '').trim().toUpperCase();

  // 1. Direct contains check
  if (textUpper.includes(cleanSymbol)) return true;

  // 2. Base name check for derivatives / options e.g. NIFTY18AUG2624350PE -> NIFTY
  const baseMatch = cleanSymbol.match(/^([A-Z]{3,15})/);
  if (baseMatch && baseMatch[1]) {
    const baseSym = baseMatch[1];
    // For specific derivatives, check base name + strike if present
    const strikeMatch = cleanSymbol.match(/(\d{4,6})(PE|CE)/);
    if (strikeMatch) {
      const strike = strikeMatch[1];
      const optType = strikeMatch[2];
      if (textUpper.includes(baseSym) && textUpper.includes(strike) && textUpper.includes(optType)) {
        return true;
      }
    } else if (textUpper.includes(baseSym) && baseSym.length >= 4) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if quantity matches anywhere in text.
 */
function isQuantityMatch(quantity: number, textUpper: string): boolean {
  if (!quantity || quantity <= 0) return false;
  const qtyStr = String(quantity);

  // Exact word boundary match for the number
  const regex = new RegExp(`\\b${qtyStr}\\b`, 'i');
  if (regex.test(textUpper)) {
    return true;
  }

  // Also check explicit "qty: 10", "quantity: 10", "shares: 10"
  const explicitRegex = new RegExp(`(?:qty|quantity|shares|nos|units|lots)\\s*[:=]?\\s*${qtyStr}\\b`, 'i');
  return explicitRegex.test(textUpper);
}

/**
 * Checks if price matches or if CMP was mentioned.
 */
function isPriceOrCmpMatch(price: number, textUpper: string, isCmpMentioned: boolean): { matches: boolean; reason: string } {
  if (isCmpMentioned) {
    // "if CMP mentioned ignore the price and pass it"
    return { matches: true, reason: 'CMP (Current Market Price) execution authorized by client' };
  }

  if (!price || price <= 0) {
    return { matches: true, reason: 'Zero/market price' };
  }

  const priceFloat = Number(price);
  const roundedPrice = Math.round(priceFloat);
  const price2Dec = priceFloat.toFixed(2);

  if (textUpper.includes(price2Dec) || textUpper.includes(String(roundedPrice))) {
    return { matches: true, reason: `Exact/rounded price verified: ₹${priceFloat}` };
  }

  // Regex for price with currency symbols
  const priceRegex = new RegExp(`(?:price|rate|at|@|₹|rs\\.?)\\s*[:=]?\\s*${roundedPrice}\\b`, 'i');
  if (priceRegex.test(textUpper)) {
    return { matches: true, reason: `Price verified with prefix: ₹${priceFloat}` };
  }

  return { matches: false, reason: `Price ${priceFloat} not found in mail confirmation` };
}

/**
 * Process uploaded mail confirmation PDFs and match against missing trades.
 */
export async function matchUploadedMailConfirmations(
  db: DatabaseSync,
  files: Array<{ originalname: string; buffer: Buffer }>
): Promise<MailConfirmationUploadSummary> {
  const summary: MailConfirmationUploadSummary = {
    filesProcessed: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    matches: [],
    unmatchedFiles: [],
    errorFiles: [],
  };

  if (!files || files.length === 0) {
    return summary;
  }

  // Get all trades without a confirmed call match
  const confirmedTradeRows = db.prepare(
    "SELECT matched_trade_id FROM calls WHERE trade_match_status = 'CONFIRMED' AND matched_trade_id IS NOT NULL"
  ).all() as Array<{ matched_trade_id: number }>;
  const confirmedTradeIdSet = new Set(confirmedTradeRows.map((r) => r.matched_trade_id));

  // Also check existing scorecards / manual audits
  const existingAuditedTradeRows = db.prepare(
    'SELECT trade_id FROM audits WHERE trade_id IS NOT NULL'
  ).all() as Array<{ trade_id: number }>;
  const auditedTradeIdSet = new Set(existingAuditedTradeRows.map((r) => r.trade_id));

  const allTrades = db.prepare('SELECT * FROM trades ORDER BY id ASC').all() as unknown as TradeRecord[];
  // Candidate trades are those without confirmed calls
  const candidateTrades = allTrades.filter((t) => !confirmedTradeIdSet.has(t.id));

  const matchedTradeIdSet = new Set<number>();
  const now = new Date().toISOString();

  for (const file of files) {
    summary.filesProcessed++;
    try {
      const extractedText = await extractTextFromBuffer(file.buffer, file.originalname);
      const textUpper = extractedText.toUpperCase();

      // Detect CMP
      // "if CMP mentioned ignore the price and pass it"
      const isCmp = /\b(?:CMP|CURRENT\s*MARKET\s*PRICE|AT\s*MARKET|MARKET\s*RATE|MARKET\s*PRICE|LTP|MKT)\b/i.test(textUpper);

      let fileMatched = false;

      for (const trade of candidateTrades) {
        if (matchedTradeIdSet.has(trade.id)) continue;

        // 1. Stock name check
        const stockMatches = isSymbolMatch(trade.symbol, textUpper);
        if (!stockMatches) continue;

        // 2. Quantity check
        const qtyMatches = isQuantityMatch(Number(trade.quantity), textUpper);
        if (!qtyMatches) continue;

        // 3. Price check (ignored if CMP mentioned)
        const priceCheck = isPriceOrCmpMatch(Number(trade.price), textUpper, isCmp);
        if (!priceCheck.matches) continue;

        // MATCH FOUND!
        matchedTradeIdSet.add(trade.id);
        fileMatched = true;

        const advisorName = cleanCallerName(trade.advisor_name || trade.dealer || 'Advisor');
        const comment = `Verified via client mail confirmation PDF (${file.originalname}): Script: ${trade.symbol}, Qty: ${trade.quantity}, ${isCmp ? 'Price: CMP (Market execution)' : 'Price: ₹' + trade.price}. ${priceCheck.reason}.`;

        // 1. Upsert Audit record
        const existingAudit = db.prepare('SELECT id FROM audits WHERE trade_id = ?').get(trade.id) as { id: number } | undefined;
        let auditId: number;

        if (existingAudit) {
          auditId = existingAudit.id;
          db.prepare(`
            UPDATE audits SET
              model = 'manual-mail-audit',
              client = ?,
              caller_name = ?,
              q1_status = 'PASS',
              q2_status = 'PASS',
              q3_status = 'PASS',
              q4_status = 'PASS',
              q5_status = 'PASS',
              score = 5,
              audit_comment = ?,
              updated_at = ?
            WHERE id = ?
          `).run(trade.client, advisorName, comment, now, auditId);
        } else {
          const ins = db.prepare(`
            INSERT INTO audits (
              trade_id, model, client, caller_name,
              q1_status, q2_status, q3_status, q4_status, q5_status,
              score, audit_comment, created_at, updated_at
            ) VALUES (?, 'manual-mail-audit', ?, ?, 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 5, ?, ?, ?)
          `).run(trade.id, trade.client, advisorName, comment, now, now);
          auditId = Number(ins.lastInsertRowid);
        }

        // 2. Upsert Scorecard record
        const existingSc = db.prepare('SELECT id FROM scorecards WHERE audit_id = ? OR resolved_trade_id = ?').get(auditId, trade.id) as { id: number } | undefined;
        let scId: number;

        if (existingSc) {
          scId = existingSc.id;
          db.prepare(`
            UPDATE scorecards SET
              client = ?,
              caller_name = ?,
              team = ?,
              score = 5,
              is_fatal = 0,
              q1_status = 'PASS',
              q2_status = 'PASS',
              q3_status = 'PASS',
              q4_status = 'PASS',
              q5_status = 'PASS',
              audit_comment = ?,
              trade_date = ?,
              resolved_trade_id = ?,
              updated_at = ?
            WHERE id = ?
          `).run(trade.client, advisorName, trade.team || 'Equity', comment, trade.trade_date, trade.id, now, scId);
        } else {
          const scIns = db.prepare(`
            INSERT INTO scorecards (
              audit_id, client, caller_name, team, trade_phone, trade_date, resolved_trade_id,
              q1_status, q2_status, q3_status, q4_status, q5_status,
              score, is_fatal, audit_comment, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              'PASS', 'PASS', 'PASS', 'PASS', 'PASS',
              5, 0, ?, ?, ?
            )
          `).run(
            auditId,
            trade.client,
            advisorName,
            trade.team || 'Equity',
            trade.phone_number || trade.client_number || '',
            trade.trade_date,
            trade.id,
            comment,
            now,
            now
          );
          scId = Number(scIns.lastInsertRowid);
        }

        summary.matchedCount++;
        summary.matches.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          quantity: Number(trade.quantity),
          price: Number(trade.price),
          advisor: advisorName,
          client: trade.client,
          tradeDate: trade.trade_date,
          fileName: file.originalname,
          matchedBy: isCmp ? 'Symbol + Qty + CMP' : 'Symbol + Qty + Price',
          isCmp,
          scorecardId: scId,
          auditId,
        });

        // Break once matched for this trade, or allow matching another partial fill if applicable
        break;
      }

      if (!fileMatched) {
        summary.unmatchedCount++;
        summary.unmatchedFiles.push(file.originalname);
      }
    } catch (fileErr: any) {
      summary.errorFiles.push({
        fileName: file.originalname,
        error: fileErr.message || 'Error processing file',
      });
    }
  }

  return summary;
}
