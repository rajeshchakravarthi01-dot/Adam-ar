// =============================================================
// Stage 3.5: SPEAKER ATTRIBUTION & DIARIZATION
// Takes transcript segments and attributes speaker roles:
// ADVISOR | CLIENT | UNKNOWN
//
// Rules:
// 1. Dynamic Channel Inversion Resolution:
//    Do NOT assume Channel 0 is always Advisor and Channel 1 is always Client.
//    Score both channels/speakers with lexical cues to detect channel inversions.
// 2. Telephonic turn analysis: Conversational turn patterns with lexical anchors.
// 3. Conservative compliance rule: If an important statement cannot be
//    confidently attributed, speaker = UNKNOWN -> Q2/Q4/Q5 dependent on speaker
//    becomes REVIEW, not false PASS.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { TranscriptSegment, SpeakerRole } from './types';
import type { CallRecord } from '../../src/types';

// Distinctive advisor conversational cues
const ADVISOR_MARKERS = [
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

// Distinctive client conversational cues
const CLIENT_MARKERS = [
  /\b(?:yes please|yeah please|yes place it|go ahead|okay please|do it)\b/i,
  /\b(?:yes buy|yes sell|buy it|sell it|execute it)\b/i,
  /\b(?:how much balance|how many shares|what is my margin|check my portfolio)\b/i,
  /\b(?:i want to buy|i want to sell|please buy|please sell)\b/i,
  /\b(?:yes that's correct|yes it is|correct|that is my code)\b/i,
  /\b(?:haan ji|haanji|haan bolo|theek hai|kar do|kar dijiye|le lo|bech do|kharid lo|exit maaro)\b/i,
  /\b(?:mera order status|kitna rate hai|kya bhav hai|balance batao|portfolio check)\b/i,
  /\b(?:bilkul confirm hai|execute kar do|punch kar do|daal do)\b/i,
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ensureSegmentsTable(db: DatabaseSync): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        segment_id TEXT,
        start_time REAL DEFAULT 0,
        end_time REAL DEFAULT 0,
        speaker TEXT DEFAULT 'UNKNOWN',
        text TEXT NOT NULL,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_call_segments_call ON call_segments(call_id);
    `);
  } catch {}
}

/**
 * Stage 3.5 Entry Point: Attributes speakers across all segments of a call
 */
export function stage3_5AttributeSpeakers(
  db: DatabaseSync,
  callId: number
): { segments: TranscriptSegment[]; formattedTranscript: string } {
  ensureSegmentsTable(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  let rows = db
    .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
    .all(callId) as unknown as Array<{
      id: number;
      segment_id: string;
      start_time: number;
      end_time: number;
      speaker: string;
      text: string;
    }>;

  if (!rows || rows.length === 0) {
    if (call?.transcript && call.transcript.trim()) {
      const lines = call.transcript.split('\n').map((l) => l.trim()).filter(Boolean);
      let currentTime = 0;
      const stmt = db.prepare(`
        INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let role: SpeakerRole = 'UNKNOWN';
        let cleanText = line;
        let segTime = currentTime;

        // Check for embedded timestamps like [00:04] or (00:04)
        const timeMatch = cleanText.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)/);
        if (timeMatch) {
          const mins = parseInt(timeMatch[1], 10);
          const secs = parseInt(timeMatch[2], 10);
          segTime = mins * 60 + secs;
          cleanText = timeMatch[4].trim();
        }

        // Check for speaker labels (Advisor, Client, Dealer, etc.)
        const speakerMatch = cleanText.match(/^(?:(advisor|dealer|agent|fundsindia|rep)|(client|customer|caller|user)):\s*(.*)/i);
        if (speakerMatch) {
          if (speakerMatch[1]) {
            role = 'ADVISOR';
          } else if (speakerMatch[2]) {
            role = 'CLIENT';
          }
          cleanText = speakerMatch[3].trim();
        }

        const duration = 4;
        stmt.run(callId, `seg_${callId}_${i}`, segTime, segTime + duration, role, cleanText);
        currentTime = Math.max(currentTime + duration, segTime + duration);
      }
      rows = db
        .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
        .all(callId) as unknown as Array<{
          id: number;
          segment_id: string;
          start_time: number;
          end_time: number;
          speaker: string;
          text: string;
        }>;
    }
  }

  if (!rows || rows.length === 0) {
    return { segments: [], formattedTranscript: '' };
  }

  const segments: TranscriptSegment[] = rows.map((r) => ({
    id: r.id,
    segment_id: r.segment_id,
    start_time: r.start_time,
    end_time: r.end_time,
    speaker: (r.speaker as SpeakerRole) || 'UNKNOWN',
    text: r.text,
  }));

  // Step 1: Detect and Correct Channel/Speaker Inversion
  // Telephony vendors (e.g., Tata Tele, Airtel) may place Dealer on Ch1 and Client on Ch0.
  // We evaluate lexical cues across both tagged channels to detect and correct any role inversion.
  let advisorCuesOnAdvisor = 0;
  let clientCuesOnAdvisor = 0;
  let advisorCuesOnClient = 0;
  let clientCuesOnClient = 0;

  for (const seg of segments) {
    const isAdv = ADVISOR_MARKERS.some((re) => re.test(seg.text));
    const isCli = CLIENT_MARKERS.some((re) => re.test(seg.text));
    if (seg.speaker === 'ADVISOR') {
      if (isAdv) advisorCuesOnAdvisor++;
      if (isCli) clientCuesOnAdvisor++;
    } else if (seg.speaker === 'CLIENT') {
      if (isAdv) advisorCuesOnClient++;
      if (isCli) clientCuesOnClient++;
    }
  }

  const isInverted = (clientCuesOnAdvisor > advisorCuesOnAdvisor && advisorCuesOnClient > clientCuesOnClient) ||
                     (clientCuesOnAdvisor >= 2 && advisorCuesOnAdvisor === 0 && advisorCuesOnClient >= 1);

  if (isInverted) {
    console.log(`[Speakers] Channel/Speaker inversion detected! Correcting ADVISOR <-> CLIENT assignment for call #${callId}`);
    for (const seg of segments) {
      if (seg.speaker === 'ADVISOR') seg.speaker = 'CLIENT';
      else if (seg.speaker === 'CLIENT') seg.speaker = 'ADVISOR';
    }
  }

  let currentSpeaker: SpeakerRole = 'UNKNOWN';

  segments.forEach((seg, index) => {
    // If already reliably attributed and not inverted, keep it unless contradictory
    if (seg.speaker === 'ADVISOR' || seg.speaker === 'CLIENT') {
      currentSpeaker = seg.speaker;
      return;
    }

    const text = seg.text;
    const isAdvisorCue = ADVISOR_MARKERS.some((re) => re.test(text));
    const isClientCue = CLIENT_MARKERS.some((re) => re.test(text));

    if (index === 0 && (isAdvisorCue || /\b(?:good morning|hello|calling|fundsindia)\b/i.test(text))) {
      seg.speaker = 'ADVISOR';
      currentSpeaker = 'ADVISOR';
      return;
    }

    if (isAdvisorCue && !isClientCue) {
      seg.speaker = 'ADVISOR';
      currentSpeaker = 'ADVISOR';
    } else if (isClientCue && !isAdvisorCue) {
      seg.speaker = 'CLIENT';
      currentSpeaker = 'CLIENT';
    } else {
      // Conversational alternation logic
      if (currentSpeaker !== 'UNKNOWN') {
        const prevSeg = segments[index - 1];
        const gap = seg.start_time - (prevSeg ? prevSeg.end_time : 0);

        if (gap < 1.2 && !/[?!]$/.test(prevSeg?.text || '')) {
          // Continued speech by same speaker
          seg.speaker = currentSpeaker;
        } else if (/[?]$/.test(prevSeg?.text || '') || (prevSeg && prevSeg.speaker === 'ADVISOR' && /^(?:haan|yes|theek hai|ok|okay|kar do|place karo)/i.test(text))) {
          // Response to question or affirmative acknowledgement
          seg.speaker = currentSpeaker === 'ADVISOR' ? 'CLIENT' : 'ADVISOR';
          currentSpeaker = seg.speaker;
        } else {
          // If genuinely ambiguous, mark UNKNOWN
          seg.speaker = 'UNKNOWN';
        }
      } else {
        seg.speaker = 'UNKNOWN';
      }
    }
  });

  // Step 2: Persist updated speakers in call_segments
  const updateStmt = db.prepare('UPDATE call_segments SET speaker = ? WHERE id = ?');
  for (const seg of segments) {
    if (seg.id) {
      updateStmt.run(seg.speaker, seg.id);
    }
  }

  // Step 3: Produce formatted dialogue transcript for human audit inspection
  const formattedLines = segments.map((seg) => {
    const timeStr = formatTime(seg.start_time);
    const cleaned = seg.text.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:advisor|client|dealer|customer|agent|caller|unknown):\s*/i, '').trim();
    return `[${timeStr}] ${seg.speaker}: ${cleaned}`;
  });
  const formattedTranscript = formattedLines.join('\n');

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE calls SET transcript = ?, updated_at = ? WHERE id = ?').run(
    formattedTranscript,
    now,
    callId
  );

  return { segments, formattedTranscript };
}
