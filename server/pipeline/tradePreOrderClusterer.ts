// =============================================================
// ADAM-AR Trade-Driven Pre-Order Analysis & 4-Minute Gap Clustering Engine
//
// Core Algorithmic Logic (Per Regulatory Trading Mandate):
// 1. First find total number of pre-orders from authoritative trade data.
// 2. Focus on: Client ID (UCC), Stock/Script name, Date, and Time.
// 3. For each date:
//    - Identify unique Client IDs (UCC) executed on that date.
//    - For each client code and stock/script:
//      * Sort trades chronologically by execution time.
//      * Multiple trades for same client code & script within < 4 minutes difference = 1 PRE-ORDER.
//        (e.g., partial fills / CMP market split executions consolidated).
//      * Multiple trades for same client code & script with >= 4 minutes difference = MULTIPLE PRE-ORDERS.
//        (e.g., separate order directives placed across different conversation sessions).
// 4. Then find the same number of pre-order calls and match them 1-to-1 with the pre-orders.
//    (Matching the number of orders and pre-order calls for 100% audit coverage).
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { TradeRecord, CallRecord } from '../../src/types';
import {
  formatCleanClientCode,
  normalizeClientCode,
  normalizePhoneNumber,
  matchClientCodeInTranscript,
  matchSymbolInTranscript,
} from '../normalizer';
import { ensureScorecardsForMatchedCalls } from './reconciliation';

export interface PreOrderTradeCluster {
  cluster_id: string;
  client_code: string;
  symbol: string;
  trade_date: string;
  start_time: string;
  end_time: string;
  start_seconds: number;
  end_seconds: number;
  total_quantity: number;
  average_price: number;
  total_value: number;
  trade_count: number;
  trade_ids: number[];
  dealer?: string;
  advisor_name?: string;
  team?: string;
  phone_number?: string;
  order_type?: string;
  matched_call_id?: number | null;
  matched_call_recording?: string | null;
  match_confidence?: number | null;
  match_status?: 'MATCHED' | 'MISSING_CALL' | 'CONFIRMED_VIA_MAIL';
  trades: TradeRecord[];
}

export interface DailyPreOrderBreakdown {
  date: string;
  unique_client_count: number;
  unique_clients: string[];
  total_trades: number;
  total_pre_orders: number;
  clusters: PreOrderTradeCluster[];
}

export interface TradePreOrdersSummary {
  total_pre_orders: number;
  total_trades: number;
  total_unique_clients: number;
  total_matched_calls: number;
  target_pre_order_calls: number;
  missing_calls_count?: number;
  coverage_percentage?: number;
  daily_breakdown: DailyPreOrderBreakdown[];
  clusters: PreOrderTradeCluster[];
  algorithm_notes: string;
}

/**
 * Normalizes trade date into YYYY-MM-DD format for chronological grouping
 */
export function normalizeDateToStandard(dateStr?: string | null): string {
  if (!dateStr) return 'UNKNOWN_DATE';
  const clean = String(dateStr).trim().split(' ')[0];

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return clean;
}

/**
 * Cleans stock/symbol name by stripping exchange series extensions (-EQ, -BE, etc.)
 */
export function cleanTradingScript(symbol?: string | null): string {
  if (!symbol) return 'UNKNOWN';
  return String(symbol)
    .toUpperCase()
    .trim()
    .replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
}

/**
 * Parses execution time string (HH:MM:SS or HH:MM) into seconds from midnight (0 - 86399)
 */
export function parseTradeSecondsFromMidnight(timeStr?: string | null, dateStr?: string | null): number {
  let time = (timeStr || '').trim();

  // If time is embedded in dateStr (e.g. "13-08-2026 13:36:31")
  if (!time && dateStr && dateStr.includes(' ')) {
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length > 1) {
      time = parts[1];
    }
  }

  if (!time) return 0;

  const match = time.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = match[3] ? parseInt(match[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }

  return 0;
}

/**
 * Formats seconds from midnight back to HH:MM:SS
 */
function secondsToTimeString(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * STEP 1: Accurately calculate the number of Pre-Orders from Trade Data.
 *
 * Rules:
 * 1. Identify unique client IDs for the date.
 * 2. Group trades by (client code, script/stock name).
 * 3. Within each (client code, script), sort chronologically.
 * 4. Trades within < 4 minutes (240s) gap = 1 Pre-Order (consolidating partial fills).
 * 5. Trades separated by >= 4 minutes (240s) gap = Multiple Pre-Orders.
 */
export function calculatePreOrdersFromTrades(trades: TradeRecord[]): TradePreOrdersSummary {
  if (!trades || trades.length === 0) {
    return {
      total_pre_orders: 0,
      total_trades: 0,
      total_unique_clients: 0,
      total_matched_calls: 0,
      target_pre_order_calls: 0,
      missing_calls_count: 0,
      coverage_percentage: 0,
      daily_breakdown: [],
      clusters: [],
      algorithm_notes: 'No trade records present in the database.',
    };
  }

  // 1. Group trades by normalized trade date
  const dateMap = new Map<string, TradeRecord[]>();
  for (const trade of trades) {
    const normDate = normalizeDateToStandard(trade.trade_date);
    if (!dateMap.has(normDate)) {
      dateMap.set(normDate, []);
    }
    dateMap.get(normDate)!.push(trade);
  }

  const allClusters: PreOrderTradeCluster[] = [];
  const dailyBreakdowns: DailyPreOrderBreakdown[] = [];
  const allUniqueClients = new Set<string>();

  // Sort dates chronologically
  const sortedDates = Array.from(dateMap.keys()).sort();

  for (const date of sortedDates) {
    const dayTrades = dateMap.get(date)!;

    // 2. Identify unique client codes for this date
    // Map: clientCode -> (scriptName -> trades[])
    const clientScriptMap = new Map<string, Map<string, TradeRecord[]>>();

    for (const t of dayTrades) {
      const rawClient = t.client || (t as any).client_code || '';
      const cleanUcc = formatCleanClientCode(rawClient) || String(rawClient).trim().toUpperCase();
      if (!cleanUcc) continue;

      allUniqueClients.add(cleanUcc);
      const script = cleanTradingScript(t.symbol);

      if (!clientScriptMap.has(cleanUcc)) {
        clientScriptMap.set(cleanUcc, new Map<string, TradeRecord[]>());
      }
      const scriptMap = clientScriptMap.get(cleanUcc)!;
      if (!scriptMap.has(script)) {
        scriptMap.set(script, []);
      }
      scriptMap.get(script)!.push(t);
    }

    const dayClusters: PreOrderTradeCluster[] = [];
    let dayClusterSeq = 1;

    // 3. For each client code and script, sort chronologically and apply 4-minute rule
    for (const [clientCode, scriptMap] of clientScriptMap.entries()) {
      for (const [script, scriptTrades] of scriptMap.entries()) {
        // Sort trades for this client and script chronologically
        const sortedTrades = scriptTrades
          .map((trade) => {
            const sec = parseTradeSecondsFromMidnight(trade.trade_time, trade.trade_date);
            return { trade, sec };
          })
          .sort((a, b) => a.sec - b.sec);

        let currentCluster: PreOrderTradeCluster | null = null;

        for (const item of sortedTrades) {
          const { trade, sec } = item;
          const rawTime = trade.trade_time || secondsToTimeString(sec);
          const qty = Number(trade.quantity) || 1;
          const price = Number(trade.price) || 0;

          if (!currentCluster) {
            // First execution initializes cluster
            currentCluster = {
              cluster_id: `POC-${date}-${clientCode}-${script}-${dayClusterSeq++}`,
              client_code: clientCode,
              symbol: script,
              trade_date: date,
              start_time: rawTime,
              end_time: rawTime,
              start_seconds: sec,
              end_seconds: sec,
              total_quantity: qty,
              average_price: price,
              total_value: qty * price,
              trade_count: 1,
              trade_ids: [trade.id],
              dealer: trade.dealer,
              advisor_name: trade.advisor_name,
              team: trade.team,
              phone_number: trade.phone_number || (trade as any).client_number,
              order_type: (trade as any).order_type || trade.side || 'BUY',
              trades: [trade],
              match_status: 'MISSING_CALL',
            };
          } else {
            // 4-Minute Gap Rule:
            // "Trades for the same client code and script executed within < 4 minutes are clustered into 1 Pre-Order (consolidating partial fills)."
            // "Trades separated by >= 4 minutes are recognized as Multiple Pre-Orders."
            const gapSeconds = Math.abs(sec - currentCluster.end_seconds);

            if (gapSeconds < 240) {
              // Gap < 4 minutes -> SAME PRE-ORDER!
              currentCluster.end_seconds = Math.max(currentCluster.end_seconds, sec);
              currentCluster.end_time = rawTime;
              currentCluster.total_quantity += qty;
              currentCluster.total_value += qty * price;
              currentCluster.average_price = currentCluster.total_quantity > 0
                ? currentCluster.total_value / currentCluster.total_quantity
                : price;
              currentCluster.trade_count += 1;
              currentCluster.trade_ids.push(trade.id);
              currentCluster.trades.push(trade);
            } else {
              // Gap >= 4 minutes -> MULTIPLE PRE-ORDERS (New pre-order session starts)
              dayClusters.push(currentCluster);
              allClusters.push(currentCluster);

              currentCluster = {
                cluster_id: `POC-${date}-${clientCode}-${script}-${dayClusterSeq++}`,
                client_code: clientCode,
                symbol: script,
                trade_date: date,
                start_time: rawTime,
                end_time: rawTime,
                start_seconds: sec,
                end_seconds: sec,
                total_quantity: qty,
                average_price: price,
                total_value: qty * price,
                trade_count: 1,
                trade_ids: [trade.id],
                dealer: trade.dealer,
                advisor_name: trade.advisor_name,
                team: trade.team,
                phone_number: trade.phone_number || (trade as any).client_number,
                order_type: (trade as any).order_type || trade.side || 'BUY',
                trades: [trade],
                match_status: 'MISSING_CALL',
              };
            }
          }
        }

        if (currentCluster) {
          dayClusters.push(currentCluster);
          allClusters.push(currentCluster);
        }
      }
    }

    dailyBreakdowns.push({
      date,
      unique_client_count: clientScriptMap.size,
      unique_clients: Array.from(clientScriptMap.keys()),
      total_trades: dayTrades.length,
      total_pre_orders: dayClusters.length,
      clusters: dayClusters,
    });
  }

  return {
    total_pre_orders: allClusters.length,
    total_trades: trades.length,
    total_unique_clients: allUniqueClients.size,
    total_matched_calls: 0,
    target_pre_order_calls: allClusters.length,
    missing_calls_count: allClusters.length,
    coverage_percentage: 0,
    daily_breakdown: dailyBreakdowns,
    clusters: allClusters,
    algorithm_notes: `Console Engine identified ${allClusters.length} pre-orders across ${allUniqueClients.size} unique clients from ${trades.length} executed trades (4-minute gap clustering rule applied).`,
  };
}

/**
 * STEP 2: Find the same number of pre-order calls and match the number of orders and pre-order calls.
 *
 * Algorithm:
 * 1. Calculate the accurate pre-orders from trades.
 * 2. Load all available candidate audio calls.
 * 3. Score candidate calls for each pre-order cluster based on:
 *    - Client code (exact or spoken phonetic in transcript)
 *    - Phone number
 *    - Date match
 *    - Stock / symbol mention in transcript
 *    - Call timing correlation (call preceding or near trade execution)
 *    - Quantity & price / CMP mention
 * 4. Assign calls to pre-orders 1-to-1 to match the exact count.
 * 5. Update calls (classification = 'PRE_ORDER', trade_match_status = 'CONFIRMED'),
 *    matches table, and call_orders / order_executions.
 */
export function matchPreOrdersWithCalls(db: DatabaseSync): TradePreOrdersSummary {
  const trades = db.prepare('SELECT * FROM trades ORDER BY id ASC').all() as unknown as TradeRecord[];
  const summary = calculatePreOrdersFromTrades(trades);

  if (summary.clusters.length === 0) {
    return summary;
  }

  // Fetch all non-scrap calls
  const calls = db.prepare(`
    SELECT * FROM calls 
    WHERE (classification != 'SCRAP' OR classification IS NULL)
    ORDER BY id ASC
  `).all() as unknown as CallRecord[];

  if (calls.length === 0) {
    return summary;
  }

  const assignedCallIds = new Set<number>();
  const now = new Date().toISOString();

  // Score candidate pairs: (cluster, call) -> score
  type CandidateMatch = {
    cluster: PreOrderTradeCluster;
    call: CallRecord;
    score: number;
    reasons: string[];
  };

  const candidatePairs: CandidateMatch[] = [];

  for (const cluster of summary.clusters) {
    const clusterUcc = normalizeClientCode(cluster.client_code);
    const clusterPhone = normalizePhoneNumber(cluster.phone_number);
    const clusterScript = cluster.symbol.toUpperCase();

    for (const call of calls) {
      const callUcc = normalizeClientCode(call.client_code || call.client);
      const callPhone = normalizePhoneNumber(call.calling_number || call.phone_number || call.client_number);
      const transcript = call.transcript || '';

      let score = 0;
      const reasons: string[] = [];

      // 1. Client Identity (Weight: 45)
      let clientMatched = false;
      if (clusterUcc && callUcc && clusterUcc === callUcc) {
        score += 45;
        clientMatched = true;
        reasons.push(`UCC match: ${clusterUcc}`);
      } else if (clusterUcc && transcript) {
        const spokenUccMatch = matchClientCodeInTranscript(clusterUcc, transcript);
        if (spokenUccMatch.matched) {
          score += 40;
          clientMatched = true;
          reasons.push(`Spoken UCC match in transcript: ${clusterUcc}`);
        }
      }

      if (!clientMatched && clusterPhone && callPhone && clusterPhone === callPhone) {
        score += 35;
        clientMatched = true;
        reasons.push(`Phone match: ${clusterPhone}`);
      }

      // If client does NOT match, do not correlate
      if (!clientMatched) continue;

      // 2. Stock / Script mention (Weight: 25)
      if (transcript && clusterScript) {
        const symMatch = matchSymbolInTranscript(clusterScript, transcript);
        if (symMatch.matched) {
          score += 25;
          reasons.push(`Script confirmed: ${clusterScript} (${symMatch.matchedAlias || clusterScript})`);
        }
      }

      // 3. Date Correlation (Weight: 15)
      const callDateNorm = normalizeDateToStandard(call.call_date);
      if (callDateNorm === cluster.trade_date) {
        score += 15;
        reasons.push(`Execution date match: ${cluster.trade_date}`);
      } else if (!call.call_date) {
        score += 8; // Neutral if call date not recorded
      }

      // 4. Time Correlation (Weight: 10)
      if (call.call_time) {
        const callSec = parseTradeSecondsFromMidnight(call.call_time, call.call_date);
        const timeDiff = cluster.start_seconds - callSec;
        // Optimal: Call occurs 0 to 30 minutes before trade execution
        if (timeDiff >= -300 && timeDiff <= 1800) {
          score += 10;
          reasons.push(`Timing correlation: call preceded trade execution by ${Math.round(timeDiff / 60)}m`);
        } else if (Math.abs(timeDiff) <= 3600) {
          score += 5;
        }
      } else {
        score += 5;
      }

      // 5. Action Side / Quantity mention (Weight: 5)
      if (transcript && cluster.total_quantity) {
        const qtyStr = String(cluster.total_quantity);
        if (transcript.includes(qtyStr)) {
          score += 5;
          reasons.push(`Quantity confirmed: ${qtyStr}`);
        }
      }

      candidatePairs.push({
        cluster,
        call,
        score,
        reasons,
      });
    }
  }

  // Sort candidate pairs by score descending (greedy optimal assignment)
  candidatePairs.sort((a, b) => b.score - a.score);

  const matchedClusterIds = new Set<string>();

  for (const pair of candidatePairs) {
    if (matchedClusterIds.has(pair.cluster.cluster_id)) continue;
    if (assignedCallIds.has(pair.call.id)) continue;
    if (pair.score < 40) continue; // Minimum threshold for identity + trade link

    // Assign call to this cluster!
    matchedClusterIds.add(pair.cluster.cluster_id);
    assignedCallIds.add(pair.call.id);

    pair.cluster.matched_call_id = pair.call.id;
    pair.cluster.matched_call_recording = pair.call.recording_name;
    pair.cluster.match_confidence = Math.min(1.0, Math.round((pair.score / 100) * 100) / 100);
    pair.cluster.match_status = 'MATCHED';

    const primaryTradeId = pair.cluster.trade_ids[0];
    const matchReason = `Matched to Pre-Order cluster ${pair.cluster.cluster_id}: ${pair.cluster.trade_count} fill(s), ${pair.cluster.total_quantity} shares of ${pair.cluster.symbol} @ ₹${pair.cluster.average_price.toFixed(2)}. ${pair.reasons.join(', ')}`;

    // 1. Update call record
    try {
      db.prepare(`
        UPDATE calls SET
          classification = 'PRE_ORDER',
          call_type = 'pre_order',
          trade_match_status = 'CONFIRMED',
          matched_trade_id = ?,
          status = 'matched',
          audit_status = 'AUDITED',
          updated_at = ?
        WHERE id = ?
      `).run(primaryTradeId, now, pair.call.id);
    } catch (err: any) {
      console.warn(`[PreOrderMatch] Error updating call #${pair.call.id}:`, err?.message);
    }

    // 2. Update / Insert into matches table
    try {
      const existingMatch = db.prepare('SELECT id FROM matches WHERE call_id = ?').get(pair.call.id) as { id: number } | undefined;
      if (existingMatch) {
        db.prepare(`
          UPDATE matches SET
            trade_id = ?,
            confidence = ?,
            status = 'matched',
            verification_status = 'confirmed',
            reason = ?,
            updated_at = ?
          WHERE id = ?
        `).run(primaryTradeId, pair.cluster.match_confidence, matchReason, now, existingMatch.id);
      } else {
        db.prepare(`
          INSERT INTO matches (call_id, trade_id, confidence, reason, status, verification_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'matched', 'confirmed', ?, ?)
        `).run(pair.call.id, primaryTradeId, pair.cluster.match_confidence, matchReason, now, now);
      }
    } catch (err: any) {
      console.warn(`[PreOrderMatch] Error updating match for call #${pair.call.id}:`, err?.message);
    }

    // 3. Link multi-fill trade IDs to order_executions
    try {
      for (const trade of pair.cluster.trades) {
        const orderId = `order_${pair.call.id}_${pair.cluster.cluster_id}`;
        db.prepare(`
          INSERT OR IGNORE INTO order_executions (
            id, order_id, trade_id, matched_quantity, confidence, status, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
        `).run(
          `exec_${orderId}_${trade.id}`,
          orderId,
          trade.id,
          trade.quantity || 1,
          pair.cluster.match_confidence,
          `Correlated via 4-minute pre-order clustering engine.`,
          now
        );
      }
    } catch {}
  }

  // Ensure all confirmed pre-order call matches have scorecards generated
  try {
    ensureScorecardsForMatchedCalls(db);
  } catch (err: any) {
    console.warn('[PreOrderClusterer] ensureScorecardsForMatchedCalls error in matchPreOrdersWithCalls:', err?.message);
  }

  // Update summary totals
  summary.total_matched_calls = matchedClusterIds.size;
  summary.missing_calls_count = Math.max(0, summary.total_pre_orders - summary.total_matched_calls);
  summary.coverage_percentage = summary.total_pre_orders > 0
    ? Math.round((summary.total_matched_calls / summary.total_pre_orders) * 100)
    : 0;
  summary.algorithm_notes = `Console Engine matched ${summary.total_matched_calls} pre-order calls to ${summary.total_pre_orders} target pre-orders (${summary.coverage_percentage}% coverage). ${summary.missing_calls_count} orders pending call correlation or mail proof.`;

  return summary;
}

/**
 * Queries database and retrieves full Pre-Order analysis with current match status.
 */
export function getPreOrdersAnalysisFromDb(db: DatabaseSync): TradePreOrdersSummary {
  try {
    const trades = db.prepare('SELECT * FROM trades ORDER BY id ASC').all() as unknown as TradeRecord[];
    const summary = calculatePreOrdersFromTrades(trades);

    if (summary.clusters.length === 0) {
      return summary;
    }

    // Check existing matched calls from matches, calls, and audits tables
    try {
      const tradeToCallMap = new Map<number, { call_id?: number; recording_name: string; confidence: number; isMail?: boolean }>();

      // 1. Matches table
      try {
        const matchedCalls = db.prepare(`
          SELECT c.id as call_id, c.recording_name, m.trade_id, m.confidence
          FROM calls c
          JOIN matches m ON m.call_id = c.id
          WHERE c.classification = 'PRE_ORDER'
             OR m.status = 'matched'
        `).all() as Array<{ call_id: number; recording_name: string; trade_id: number; confidence: number }>;

        for (const mc of matchedCalls) {
          tradeToCallMap.set(mc.trade_id, {
            call_id: mc.call_id,
            recording_name: mc.recording_name,
            confidence: mc.confidence || 0.95,
          });
        }
      } catch {}

      // 2. Direct matched_trade_id in calls table
      try {
        const directMatches = db.prepare(`
          SELECT id as call_id, recording_name, matched_trade_id
          FROM calls
          WHERE matched_trade_id IS NOT NULL
        `).all() as Array<{ call_id: number; recording_name: string; matched_trade_id: number }>;

        for (const dm of directMatches) {
          if (!tradeToCallMap.has(dm.matched_trade_id)) {
            tradeToCallMap.set(dm.matched_trade_id, {
              call_id: dm.call_id,
              recording_name: dm.recording_name,
              confidence: 0.98,
            });
          }
        }
      } catch {}

      // 3. Mail confirmation audits or manual audits in audits table
      try {
        const mailAudits = db.prepare(`
          SELECT trade_id, model, audit_comment
          FROM audits
          WHERE trade_id IS NOT NULL
        `).all() as Array<{ trade_id: number; model: string; audit_comment: string }>;

        for (const ma of mailAudits) {
          if (!tradeToCallMap.has(ma.trade_id)) {
            const isMail = ma.model === 'manual-mail-audit' || (ma.audit_comment && ma.audit_comment.toLowerCase().includes('mail'));
            tradeToCallMap.set(ma.trade_id, {
              recording_name: isMail ? 'Client Mail Confirmation (PDF)' : 'Manual Trade Audit',
              confidence: 1.0,
              isMail,
            });
          }
        }
      } catch {}

      let matchedCount = 0;
      let hasUnmatched = false;
      for (const cluster of summary.clusters) {
        let clusterMatched = false;
        for (const tradeId of cluster.trade_ids) {
          if (tradeToCallMap.has(tradeId)) {
            const matchInfo = tradeToCallMap.get(tradeId)!;
            cluster.matched_call_id = matchInfo.call_id;
            cluster.matched_call_recording = matchInfo.recording_name;
            cluster.match_confidence = matchInfo.confidence || 0.95;
            cluster.match_status = matchInfo.isMail ? 'CONFIRMED_VIA_MAIL' : 'MATCHED';
            matchedCount++;
            clusterMatched = true;
            break;
          }
        }
        if (!clusterMatched) {
          hasUnmatched = true;
        }
      }

      // If some clusters are still missing calls, run matchPreOrdersWithCalls to correlate any available calls
      if (hasUnmatched) {
        try {
          matchPreOrdersWithCalls(db);
          // Re-check after correlation
          matchedCount = 0;
          const reCheckDirect = db.prepare('SELECT id as call_id, recording_name, matched_trade_id FROM calls WHERE matched_trade_id IS NOT NULL').all() as Array<{ call_id: number; recording_name: string; matched_trade_id: number }>;
          for (const dm of reCheckDirect) {
            tradeToCallMap.set(dm.matched_trade_id, { call_id: dm.call_id, recording_name: dm.recording_name, confidence: 0.95 });
          }
          for (const cluster of summary.clusters) {
            for (const tradeId of cluster.trade_ids) {
              if (tradeToCallMap.has(tradeId)) {
                const matchInfo = tradeToCallMap.get(tradeId)!;
                cluster.matched_call_id = matchInfo.call_id;
                cluster.matched_call_recording = matchInfo.recording_name;
                cluster.match_confidence = matchInfo.confidence || 0.95;
                cluster.match_status = matchInfo.isMail ? 'CONFIRMED_VIA_MAIL' : 'MATCHED';
                matchedCount++;
                break;
              }
            }
          }
        } catch {}
      }

      summary.total_matched_calls = matchedCount;
      summary.missing_calls_count = Math.max(0, summary.total_pre_orders - matchedCount);
      summary.coverage_percentage = summary.total_pre_orders > 0
        ? Math.round((matchedCount / summary.total_pre_orders) * 100)
        : 0;
    } catch {}

    // Ensure all pre-order call matches produce matching scorecards
    try {
      ensureScorecardsForMatchedCalls(db);
    } catch {}

    return summary;
  } catch (err: any) {
    return {
      total_pre_orders: 0,
      total_trades: 0,
      total_unique_clients: 0,
      total_matched_calls: 0,
      target_pre_order_calls: 0,
      missing_calls_count: 0,
      coverage_percentage: 0,
      daily_breakdown: [],
      clusters: [],
      algorithm_notes: `Error computing pre-orders: ${err?.message}`,
    };
  }
}
