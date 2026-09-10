// =============================================================
// Stage 3.5: SPEAKER ATTRIBUTION (Hindi / Hinglish / English Engine)
// Takes transcript segments and attributes speaker roles:
// ADVISOR | CLIENT | UNKNOWN
// Output format: Clean alternating turns:
// Advisor: ...
// Client: ...
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { TranscriptSegment, SpeakerRole } from './types';

// Distinctive advisor conversational cues (English + Hindi/Hinglish)
const ADVISOR_MARKERS = [
  /\b(?:good morning|good afternoon|good evening|hello)\s*(?:sir|madam|mr|mrs|dr)?\b/i,
  /\b(?:namaskar|namaste|pranam|hello\s+sir|hello\s+ma'am|hello\s+madam)\b/i,
  /\b(?:calling from|this is\s+[a-z\s]+from|relationship manager|wealth advisor|dealer)\b/i,
  /\b(?:fundsindia|funds india|equity desk|broking desk|equity advisory)\b/i,
  /\b(?:how can i help|can we buy|we can purchase|we recommend|current market price is|cmp is|limit price is)\b/i,
  /\b(?:confirming your order|order has been placed|executing on nse|executing on bse)\b/i,
  /\b(?:can you confirm your client code|your ucc is|confirming account|registered mobile)\b/i,
  /\b(?:shall i place|should i place|placing the order for)\b/i,
  // Hindi advisor cues
  /\b(?:bataiye|kariye|kar dijiye|order place kar diya|order laga diya|order lagaya)\b/i,
  /\b(?:kitna lena hai|kitne share lene hain|bhav pe|cmp pe|current market price pe)\b/i,
  /\b(?:fundsindia se bol raha hoon|fundsindia se baat kar raha hoon|funds india desk se)\b/i,
  /\b(?:aapka client code confirm|order confirm kar dijiye|ek baar confirm kar dijiye)\b/i,
];

// Distinctive client conversational cues (English + Hindi/Hinglish)
const CLIENT_MARKERS = [
  /\b(?:yes please|yeah please|yes place it|go ahead|okay please|do it)\b/i,
  /\b(?:yes buy|yes sell|buy it|sell it|execute it)\b/i,
  /\b(?:how much balance|how many shares|what is my margin|check my portfolio)\b/i,
  /\b(?:i want to buy|i want to sell|please buy|please sell)\b/i,
  /\b(?:yes that's correct|yes it is|correct|that is my code)\b/i,
  // Hindi client cues
  /\b(?:haan ji|ha ji|haanji|theek hai|accha|achha|thik hai)\b/i,
  /\b(?:le lijiye|bech dijiye|kar do|kar dijiye sir|haan confirm|sahi hai)\b/i,
  /\b(?:mujhe buy karna hai|mujhe sell karna hai|khareed lo|bech do)\b/i,
  /\b(?:mera balance kitna hai|portfolio kaisa chal raha hai)\b/i,
];

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

  // Step 1: Detect native diarization speaker labels (e.g. SPEAKER_0, SPEAKER_1 or 0, 1)
  const distinctSpeakers = Array.from(new Set(rows.map((r) => r.speaker).filter((s) => s && s !== 'UNKNOWN')));
  
  if (distinctSpeakers.length >= 2) {
    // We have native diarization clusters from Sarvam AI
    const speakerScores: Record<string, { advisor: number; client: number; isFirst: boolean }> = {};
    for (const spk of distinctSpeakers) {
      speakerScores[spk] = { advisor: 0, client: 0, isFirst: false };
    }

    if (rows[0] && rows[0].speaker && speakerScores[rows[0].speaker]) {
      speakerScores[rows[0].speaker].isFirst = true;
    }

    rows.forEach((r) => {
      const spk = r.speaker;
      if (!speakerScores[spk]) return;
      const text = r.text || '';
      for (const re of ADVISOR_MARKERS) {
        if (re.test(text)) speakerScores[spk].advisor++;
      }
      for (const re of CLIENT_MARKERS) {
        if (re.test(text)) speakerScores[spk].client++;
      }
    });

    // Score difference: advisor markers + first speaker bias
    let bestAdvisorSpeaker = distinctSpeakers[0];
    let highestAdvisorScore = -999;

    for (const spk of distinctSpeakers) {
      const stats = speakerScores[spk];
      const score = (stats.advisor * 2) - (stats.client * 2) + (stats.isFirst ? 3 : 0);
      if (score > highestAdvisorScore) {
        highestAdvisorScore = score;
        bestAdvisorSpeaker = spk;
      }
    }

    const advisorId = bestAdvisorSpeaker;
    const clientId = distinctSpeakers.find((s) => s !== advisorId) || distinctSpeakers[1];

    segments.forEach((seg, idx) => {
      const rawSpk = rows[idx].speaker;
      if (rawSpk === advisorId) {
        seg.speaker = 'ADVISOR';
      } else if (rawSpk === clientId) {
        seg.speaker = 'CLIENT';
      } else {
        // Fallback by content
        const isAdv = ADVISOR_MARKERS.some((re) => re.test(seg.text));
        seg.speaker = isAdv ? 'ADVISOR' : 'CLIENT';
      }
    });
  } else {
    // Step 1b: Heuristic turn alternation when diarization clusters are missing
    let currentSpeaker: SpeakerRole = 'UNKNOWN';

    segments.forEach((seg, index) => {
      const text = seg.text;
      const isAdvisorCue = ADVISOR_MARKERS.some((re) => re.test(text));
      const isClientCue = CLIENT_MARKERS.some((re) => re.test(text));

      if (index === 0 && (isAdvisorCue || /\b(?:good morning|hello|calling|namaskar|namaste)\b/i.test(text))) {
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
        if (currentSpeaker !== 'UNKNOWN') {
          const prevSeg = segments[index - 1];
          const gap = seg.start_time - (prevSeg ? prevSeg.end_time : 0);
          if (gap < 1.4 && !/[?!]$/.test(prevSeg?.text || '')) {
            seg.speaker = currentSpeaker;
          } else if (/[?]$/.test(prevSeg?.text || '')) {
            seg.speaker = currentSpeaker === 'ADVISOR' ? 'CLIENT' : 'ADVISOR';
            currentSpeaker = seg.speaker;
          } else {
            seg.speaker = currentSpeaker === 'ADVISOR' ? 'CLIENT' : 'ADVISOR';
            currentSpeaker = seg.speaker;
          }
        } else {
          seg.speaker = index % 2 === 0 ? 'ADVISOR' : 'CLIENT';
        }
      }
    });
  }

  // Step 2: Persist updated speakers in call_segments
  const updateStmt = db.prepare('UPDATE call_segments SET speaker = ? WHERE id = ?');
  for (const seg of segments) {
    if (seg.id) {
      updateStmt.run(seg.speaker, seg.id);
    }
  }

  // Step 3: Produce clean alternating turns:
  // Advisor: ...
  // Client: ...
  // Collapsing consecutive turns of the same speaker cleanly
  const turns: Array<{ speaker: string; lines: string[] }> = [];
  for (const seg of segments) {
    const speakerLabel = seg.speaker === 'ADVISOR' ? 'Advisor' : seg.speaker === 'CLIENT' ? 'Client' : 'Speaker';
    const lastTurn = turns[turns.length - 1];
    if (lastTurn && lastTurn.speaker === speakerLabel) {
      lastTurn.lines.push(seg.text);
    } else {
      turns.push({ speaker: speakerLabel, lines: [seg.text] });
    }
  }

  const formattedTranscript = turns
    .map((t) => `${t.speaker}: ${t.lines.join(' ')}`)
    .join('\n\n');

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE calls SET transcript = ?, updated_at = ? WHERE id = ?').run(
    formattedTranscript,
    now,
    callId
  );

  return { segments, formattedTranscript };
}
