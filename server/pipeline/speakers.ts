// =============================================================
// Stage 3.5: SPEAKER ATTRIBUTION
// Takes transcript segments and attributes speaker roles:
// ADVISOR | CLIENT | UNKNOWN
// Rule: If an important statement cannot be confidently attributed,
// speaker = UNKNOWN -> Q2/Q5 dependent on speaker becomes REVIEW, not PASS.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { TranscriptSegment, SpeakerRole } from './types';

// Distinctive advisor conversational cues
const ADVISOR_MARKERS = [
  /\b(?:good morning|good afternoon|good evening|hello)\s*(?:sir|madam|mr|mrs|dr)?\b/i,
  /\b(?:calling from|this is\s+[a-z\s]+from|relationship manager|wealth advisor|dealer)\b/i,
  /\b(?:fundsindia|funds india|equity desk|broking desk)\b/i,
  /\b(?:how can i help|can we buy|we can purchase|we recommend|current market price is|cmp is|limit price is)\b/i,
  /\b(?:confirming your order|order has been placed|executing on nse|executing on bse)\b/i,
  /\b(?:can you confirm your client code|your ucc is|confirming account|registered mobile)\b/i,
  /\b(?:shall i place|should i place|placing the order for)\b/i,
];

// Distinctive client conversational cues
const CLIENT_MARKERS = [
  /\b(?:yes please|yeah please|yes place it|go ahead|okay please|do it)\b/i,
  /\b(?:yes buy|yes sell|buy it|sell it|execute it)\b/i,
  /\b(?:how much balance|how many shares|what is my margin|check my portfolio)\b/i,
  /\b(?:i want to buy|i want to sell|please buy|please sell)\b/i,
  /\b(?:yes that's correct|yes it is|correct|that is my code)\b/i,
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Stage 3.5 Entry Point: Attributes speakers across all segments of a call
 */
export function stage3_5AttributeSpeakers(
  db: DatabaseSync,
  callId: number
): { segments: TranscriptSegment[]; formattedTranscript: string } {
  const rows = db
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

  // Step 1: Anchor cues
  // The first speaker who introduces the call or greets as an advisor is typically ADVISOR
  let currentSpeaker: SpeakerRole = 'UNKNOWN';

  segments.forEach((seg, index) => {
    const text = seg.text;
    let isAdvisorCue = ADVISOR_MARKERS.some((re) => re.test(text));
    let isClientCue = CLIENT_MARKERS.some((re) => re.test(text));

    if (index === 0 && (isAdvisorCue || /\b(?:good morning|hello|calling)\b/i.test(text))) {
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
      // If no strong lexical marker:
      // In dialogue, speaker alternates when there's a pause or question/response pattern
      if (currentSpeaker !== 'UNKNOWN') {
        const prevSeg = segments[index - 1];
        const gap = seg.start_time - (prevSeg ? prevSeg.end_time : 0);
        // If gap is small (< 1.2s) and continues previous thought, keep current speaker
        if (gap < 1.2 && !/[?!]$/.test(prevSeg?.text || '')) {
          seg.speaker = currentSpeaker;
        } else if (/[?]$/.test(prevSeg?.text || '')) {
          // Previous ended with question -> likely response from other party
          seg.speaker = currentSpeaker === 'ADVISOR' ? 'CLIENT' : 'ADVISOR';
          currentSpeaker = seg.speaker;
        } else {
          // Conservative compliance rule: if ambiguous, attribute to UNKNOWN
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
    return `[${timeStr}] ${seg.speaker}: ${seg.text}`;
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
