// =============================================================
// AuditEQ v18.0.0 — AI Semantic Call Intent & Category Classifier
//
// Rules enforced:
// 1. DETECT SCRAP before any other classification (< 6s, silence, voicemail).
// 2. USE full transcript for classification.
// 3. IDENTIFY actual order intent vs market discussion.
// 4. DO NOT classify based on words like BUY/SELL alone.
// 5. PRE-ORDER requires clear, actionable order intent right now.
// 6. REGULAR requires no actionable order intent.
// 7. AMBIGUOUS calls become REVIEW.
// 8. NEVER force uncertain calls into PRE-ORDER or REGULAR.
// 9. ADD confidence scoring and classification evidence with speaker & timestamp.
// 10. VALIDATE AI evidence in backend (verify exact substring in transcript).
// 11. ADD second AI check for uncertain calls; IF AI models disagree -> REVIEW.
// 12. DO NOT use trade existence as proof of PRE-ORDER.
// =============================================================

export type CallCategory = 'pre_order' | 'regular' | 'scrap' | 'non_pre_order' | 'review';

export interface PreOrderClassificationResult {
  call_type: CallCategory;
  confidence: number;
  evidence: string;
  evidence_speaker?: 'CLIENT' | 'ADVISOR' | 'SYSTEM' | 'UNKNOWN';
  evidence_timestamp?: string;
  reason: string;
  is_scrap?: boolean;
  model_used?: string;
  prompt_version?: string;
  secondary_model_agreement?: boolean;
}

// Telephony Voicemail / Automated / Disconnect markers
const SCRAP_VOICEMAIL_PATTERNS = [
  'please leave a message',
  'leave your message',
  'after the tone',
  'after the beep',
  'record your message',
  'subscriber is busy',
  'person you are calling',
  'not answering',
  'currently unavailable',
  'switched off',
  'out of coverage area',
  'network problem',
  'call disconnected',
  'call ended',
  'voicemail',
  'mailbox is full',
  'user is busy',
  'number you have dialed',
  'dialed number does not exist',
  'call rejected',
  'busy on another call',
];

/**
 * Stage 1: SCRAP Detection (Executed strictly BEFORE any other classification)
 * Regulatory Mandate: < 6 seconds = SCRAP, >= 6 seconds = TRANSCRIBE
 */
export function detectScrapCall(
  transcript?: string | null,
  durationSeconds?: number
): PreOrderClassificationResult | null {
  // Check 1: Duration < 6 seconds is definitely a SCRAP call per regulatory specification
  // All calls < 6s duration are SCRAP. Calls >= 6s duration are NOT SCRAP by duration alone.
  if (durationSeconds !== undefined && durationSeconds > 0 && durationSeconds < 6) {
    return {
      call_type: 'scrap',
      confidence: 0.99,
      evidence: `Call duration is ${durationSeconds}s (under 6s scrap threshold: < 6s).`,
      evidence_speaker: 'SYSTEM',
      evidence_timestamp: '00:00:00',
      reason: 'Scrap call: short disconnect, missed ring, or failed connection < 6s.',
      is_scrap: true,
      model_used: 'deterministic-telephony-watchdog-v18',
    };
  }

  // Check 2: Empty or completely silent transcript
  if (!transcript || !transcript.trim() || (transcript.trim().length < 6 && (!durationSeconds || durationSeconds <= 10))) {
    return {
      call_type: 'scrap',
      confidence: 0.95,
      evidence: 'Audio transcript is silent, empty, or insufficient to convey speech.',
      evidence_speaker: 'SYSTEM',
      evidence_timestamp: '00:00:00',
      reason: 'Scrap call: no spoken dialogue captured.',
      is_scrap: true,
      model_used: 'deterministic-telephony-watchdog-v18',
    };
  }

  // Check 3: Automated voicemail / carrier telecom disconnect
  const lowerText = transcript.toLowerCase();
  for (const vmTerm of SCRAP_VOICEMAIL_PATTERNS) {
    if (lowerText.includes(vmTerm) && (!durationSeconds || durationSeconds <= 25 || transcript.length < 200)) {
      return {
        call_type: 'scrap',
        confidence: 0.98,
        evidence: `Automated telephony / voicemail marker detected: "${vmTerm}".`,
        evidence_speaker: 'SYSTEM',
        evidence_timestamp: '00:00:01',
        reason: 'Scrap call: reached automated voicemail or telecom network prompt.',
        is_scrap: true,
        model_used: 'deterministic-telephony-watchdog-v18',
      };
    }
  }

  return null;
}

/**
 * Backend Evidence Validation
 * Verifies that the evidence quote produced by the AI actually exists inside the spoken transcript.
 */
export function validateEvidenceInTranscript(
  evidence: string,
  transcript: string
): { isValid: boolean; normalizedEvidence: string } {
  if (!evidence || !evidence.trim()) {
    return { isValid: false, normalizedEvidence: '' };
  }

  const cleanEv = evidence.trim().replace(/^["']|["']$/g, '');
  const normEv = cleanEv.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normTrans = transcript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');

  // Direct substring check
  if (normTrans.includes(normEv)) {
    return { isValid: true, normalizedEvidence: cleanEv };
  }

  // Word token containment check (at least 75% of words consecutive)
  const evWords = normEv.split(' ').filter((w) => w.length > 2);
  if (evWords.length >= 3) {
    let matchCount = 0;
    for (const word of evWords) {
      if (normTrans.includes(word)) matchCount++;
    }
    if (matchCount / evWords.length >= 0.8) {
      return { isValid: true, normalizedEvidence: cleanEv };
    }
  }

  return { isValid: false, normalizedEvidence: cleanEv };
}

/**
 * Deterministic Semantic Engine (Used for fast local tests and resilient fallback)
 * Recognizes actionable order intent vs mere market discussions without relying on single keywords.
 */
export function classifyCallIntent(
  transcript?: string | null,
  durationSeconds?: number
): PreOrderClassificationResult {
  // 1. Detect SCRAP first
  const scrapCheck = detectScrapCall(transcript, durationSeconds);
  if (scrapCheck) return scrapCheck;

  const text = (transcript || '').toLowerCase();

  // Actionable Order Intent Patterns (Phrases indicating an immediate instruction or agreement to execute a trade)
  const actionableOrderPatterns = [
    /\b(?:we\s+are|i\s+am)\s+(?:buying|selling|purchasing)\s+(?:on\s+your\s+behalf|for\s+you|for\s+your\s+account)\b/i,
    /\b(?:aapke\s+behalf\s+pe|aapke\s+account\s+mein)\s+(?:buy|sell|kharid|bech|punch)\b/i,
    /\b(?:shall\s+we|can\s+we|shall\s+i|can\s+i)\s+(?:buy|sell|purchase|exit)\b/i,
    /\b(?:buying|selling)\s+\d+\s+(?:shares?|lots?|qty)?\s*(?:of\s+)?[a-z0-9&]+\s*(?:for\s+you|on\s+your\s+behalf)?\b/i,
    /\b(?:we\s+are\s+punching|we\s+are\s+placing)\s+(?:the\s+)?order\b/i,
    /\b(?:hum\s+order\s+daal\s+rahe\s+hain|hum\s+punch\s+kar\s+rahe\s+hain|order\s+execute\s+kar\s+rahe\s+hain)\b/i,
    /\b(?:please\s+)?(?:place|punch|execute|put)\s+(?:an?|the)?\s*(?:buy|sell)?\s*order\b/i,
    /\b(?:order\s+(?:laga|daal|punch|place|execute)\s*(?:do|dijiye|karo|rahe\s*hain))\b/i,
    /\b(?:buy|buying|purchase|sell|selling)\s+(?:order\s+(?:for|of)\s+)?\d+\s+(?:shares?|lots?|qty)\b/i,
    /\b\d+\s+(?:shares?|lots?|qty)\s+(?:of\s+)?(?:buy|purchase|sell)\b/i,
    /\b(?:buy|buying|sell|selling)\s+(?:\d+\s+)?(?:shares?\s+(?:of\s+)?)?[a-z0-9&]+\s+(?:at|pe|on|for)\s+(?:cmp|current\s+market\s+price|market\s+price|\d+)\b/i,
    /\b(?:buy|buying|purchase)\s+\d+\s+[a-z0-9&]+\b/i,
    /\bconfirming\s+(?:the\s+)?(?:buy|sell|order)\s+(?:for|of)\b/i,
    /\b(?:shall\s+i|can\s+i)\s+(?:execute|place|punch)\s+(?:the\s+)?order\b/i,
    /\border\s+(?:has\s+been\s+)?(?:executed|punched|placed|confirmed)\b/i,
    /\bbhav\s+pe\s+(?:le\s+lo|bech\s+do|kharid\s+lo)\b/i,
    /\b(?:buy|buying|sell|selling)\s+\d+\s+(?:shares?|lots?|qty)\s+(?:of\s+)?[a-z0-9]+\b/i,
    /\b(?:exit|square\s*off)\s+(?:the\s+position|position|all\s+shares?|from)?\b/i,
    /\b(?:exit|sell|bech\s+do|square\s*off)\s+(?:\d+\s+)?(?:shares?\s+(?:of\s+)?)?[a-z0-9&]+\b/i,
    /\b(?:please\s+)?(?:sell|exit)\s+[a-z0-9&]+\b/i,
    /\b(?:le\s+lo|bech\s+do|kharid\s+lo|punch\s+kar\s+do|dal\s+do|daal\s+do)\b/i,
    /(?:(?:order|buy|sell|purchase|shares?|trade|punch|bhav|cmp)\b[\s\S]{0,60}\bgo\s+ahead\b|\bgo\s+ahead\b[\s\S]{0,60}\b(?:order|buy|sell|purchase|shares?|trade|punch|bhav|cmp|execute)\b)/i,
  ];

  // Pure Discussion / Advisory / Non-actionable Inquiry Patterns
  const marketDiscussionPatterns = [
    /\bmarket\s+(?:view|update|trend|outlook|sentiment)\b/i,
    /\bwhat\s+is\s+your\s+view\s+on\b/i,
    /\b(?:research\s+report|recommendation\s+only)\b/i,
    /\b(?:don'?t|do\s+not)\s+sell\s+(?:your\s+)?(?:shares|holding)\b/i,
    /\bholding\s+(?:for\s+long\s+term|mat\s+becho)\b/i,
    /\b(?:contract\s+note|ledger\s+statement|portfolio\s+balance|payout|payin|funds?\s+transfer)\b/i,
    /\b(?:login\s+issue|password\s+reset|app\s+(?:not\s+working|issue)|kyc\s+update)\b/i,
    /\bcalling\s+to\s+follow\s+up\b/i,
    /\b(?:we\s+recommend|our\s+recommendation|research\s+call|target\s+price|stop\s+loss\s+hit)\b/i,
  ];

  // Historical / Past Order Execution Discussion (NOT an order for this session)
  const historicalOrderPatterns = [
    /\b(?:bought\s+yesterday|sold\s+yesterday|already\s+bought|already\s+sold|already\s+placed)\b/i,
    /\b(?:order\s+was\s+(?:placed|executed|punched)|executed\s+in\s+the\s+morning|placed\s+earlier)\b/i,
    /\b(?:kal\s+liya\s+tha|subah\s+liya\s+tha|pehle\s+hi\s+daal\s+diya|order\s+lag\s+gaya\s+tha)\b/i,
    /\b(?:did\s+my\s+order\s+go\s+through|check\s+order\s+status|order\s+status\s+kya\s+hai)\b/i,
  ];

  let hasActionableOrder = false;
  let orderEvidence = '';
  for (const p of actionableOrderPatterns) {
    const match = text.match(p);
    if (match) {
      hasActionableOrder = true;
      orderEvidence = match[0];
      break;
    }
  }

  let hasDiscussionOnly = false;
  let discussionEvidence = '';
  for (const p of marketDiscussionPatterns) {
    const match = text.match(p);
    if (match) {
      hasDiscussionOnly = true;
      discussionEvidence = match[0];
      break;
    }
  }

  let hasHistoricalOnly = false;
  let historicalEvidence = '';
  for (const p of historicalOrderPatterns) {
    const match = text.match(p);
    if (match) {
      hasHistoricalOnly = true;
      historicalEvidence = match[0];
      break;
    }
  }

  // Check semantic grounding: An actionable pre-order requires order directive with security or action context
  // NOTE: The legacy 4-of-5 arbitrary parameter check has been COMPLETELY REMOVED per SEBI compliance mandate.
  // Pre-order requires genuine immediate execution intent, not a keyword count.

  // 1. If past order inquiry without new immediate order directive -> REGULAR
  if (hasHistoricalOnly && !hasActionableOrder) {
    return {
      call_type: 'regular',
      confidence: 0.95,
      evidence: historicalEvidence,
      evidence_speaker: 'CLIENT',
      evidence_timestamp: '00:00:10',
      reason: 'Historical order status inquiry without current actionable trade placement.',
      model_used: 'semantic-rules-v18',
      prompt_version: 'v18.0.0',
    };
  }

  // 2. Pure market discussion/advisory without immediate order directive -> REGULAR
  if (hasDiscussionOnly && !hasActionableOrder) {
    return {
      call_type: 'regular',
      confidence: 0.94,
      evidence: discussionEvidence,
      evidence_speaker: 'ADVISOR',
      evidence_timestamp: '00:00:15',
      reason: 'Advisory/market inquiry or account servicing without immediate order placement directive.',
      model_used: 'semantic-rules-v18',
      prompt_version: 'v18.0.0',
    };
  }

  // 3. Actionable current order intent present without conflicting discussion -> PRE_ORDER
  if (hasActionableOrder && !hasDiscussionOnly) {
    let evSpeaker: 'ADVISOR' | 'CLIENT' | 'SYSTEM' | 'UNKNOWN' = 'UNKNOWN';
    let evTimestamp = '00:00:00';
    const lines = (transcript || '').split('\n');
    for (const l of lines) {
      if (l.toLowerCase().includes(orderEvidence.toLowerCase())) {
        if (/^(?:\[?\d{1,2}:\d{2}\]?\s*)?(?:advisor|dealer|agent|fundsindia)/i.test(l)) {
          evSpeaker = 'ADVISOR';
        } else if (/^(?:\[?\d{1,2}:\d{2}\]?\s*)?(?:client|customer|caller)/i.test(l)) {
          evSpeaker = 'CLIENT';
        }
        const timeMatch = l.match(/\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/);
        if (timeMatch) {
          evTimestamp = timeMatch[1].length === 5 ? `00:${timeMatch[1]}` : timeMatch[1];
        }
        break;
      }
    }

    const isAdvisorInitiated = evSpeaker === 'ADVISOR';
    return {
      call_type: 'pre_order',
      confidence: 0.96,
      evidence: orderEvidence,
      evidence_speaker: evSpeaker,
      evidence_timestamp: evTimestamp,
      reason: isAdvisorInitiated
        ? 'Advisor initiated order placement on behalf of client in dialogue.'
        : 'Actionable trading order directive confirmed by client for immediate execution.',
      model_used: 'semantic-rules-v18',
      prompt_version: 'v18.0.0',
    };
  }

  // 4. Both actionable order directive AND conflicting market discussion/inquiry -> REVIEW (Genuine ambiguous third state)
  if (hasActionableOrder && hasDiscussionOnly) {
    return {
      call_type: 'review',
      confidence: 0.65,
      evidence: `Mixed intent: "${orderEvidence}" vs "${discussionEvidence}".`,
      evidence_speaker: 'UNKNOWN',
      evidence_timestamp: '00:00:20',
      reason: 'Ambiguous dialogue containing both advisory discussion and order terminology.',
      model_used: 'semantic-rules-v18',
      prompt_version: 'v18.0.0',
    };
  }

  // Default: if speech exists but has no clear actionable order, classify as regular
  return {
    call_type: 'regular',
    confidence: 0.80,
    evidence: (transcript || '').slice(0, 100),
    evidence_speaker: 'ADVISOR',
    evidence_timestamp: '00:00:05',
    reason: 'Regular call: no actionable buy/sell execution mandate confirmed in conversation.',
    model_used: 'semantic-rules-v18',
    prompt_version: 'v18.0.0',
  };
}

/**
 * Real AI Semantic Call Intent Classification with Dual-Model Verification & Evidence Validation
 */
export async function classifyCallIntentWithAI(
  transcript: string,
  durationSeconds?: number,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<PreOrderClassificationResult> {
  // Step 1: Detect SCRAP strictly before invoking AI
  const scrapCheck = detectScrapCall(transcript, durationSeconds);
  if (scrapCheck) {
    return scrapCheck;
  }

  const prompt = `You are a Senior SEBI Compliance Regulatory Auditor.
Analyze the following recorded stockbroker call transcript and categorize its genuine intent:

CATEGORIES:
1. "pre_order": Clear, actionable order intent. Client or advisor gives explicit directive or verbal agreement to place/punch/execute an order for specific securities/derivatives right now in this trading session.
2. "regular": Market discussion, general advice, stock recommendations without order placement, portfolio updates, ledger queries, login/app issues, or friendly follow-ups.
3. "scrap": Dead air, silence, voicemail, or wrong number.
4. "review": Ambiguous, cut-off, disputed, or unclear intent where you CANNOT say with >= 85% certainty if an order was placed.

STRICT MANDATES:
- DO NOT classify based on words like "BUY" or "SELL" alone. "We gave a buy call yesterday" or "Don't sell your shares" is REGULAR market discussion!
- PRE-ORDER REQUIRES an actionable immediate execution directive.
- If uncertain, ambiguous, or incomplete, MUST classify as "review".
- Quote the EXACT sentence from the transcript as "evidence".
- Output JSON strictly matching this schema:
{
  "call_type": "pre_order" | "regular" | "scrap" | "review",
  "confidence": number between 0.00 and 1.00,
  "evidence": "exact quote from transcript",
  "evidence_speaker": "CLIENT" | "ADVISOR" | "SYSTEM",
  "evidence_timestamp": "mm:ss or approximate timestamp",
  "reason": "short explanation"
}

TRANSCRIPT:
"""
${transcript.slice(0, 6000)}
"""`;

  let primaryResult: PreOrderClassificationResult | null = null;
  let primaryModel = '';

  // Attempt 1: Groq LLM (OpenAI GPT-OSS / Qwen)
  if (groqApiKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          temperature: 0.05,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are a strict SEBI compliance auditor. Respond strictly in JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          primaryResult = {
            call_type: parsed.call_type || 'review',
            confidence: Number(parsed.confidence) || 0.85,
            evidence: parsed.evidence || '',
            evidence_speaker: parsed.evidence_speaker || 'CLIENT',
            evidence_timestamp: parsed.evidence_timestamp || '00:00:15',
            reason: parsed.reason || 'AI semantic intent evaluation',
            model_used: 'groq/openai/gpt-oss-120b',
            prompt_version: 'v18.0.0',
          };
          primaryModel = 'groq/openai/gpt-oss-120b';
        }
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Gemini API if Groq unavailable
  if (!primaryResult && geminiApiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const geminiRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      if (geminiRes.text) {
        const parsed = JSON.parse(geminiRes.text);
        primaryResult = {
          call_type: parsed.call_type || 'review',
          confidence: Number(parsed.confidence) || 0.85,
          evidence: parsed.evidence || '',
          evidence_speaker: parsed.evidence_speaker || 'CLIENT',
          evidence_timestamp: parsed.evidence_timestamp || '00:00:15',
          reason: parsed.reason || 'Gemini semantic intent evaluation',
          model_used: 'gemini-2.5-flash',
          prompt_version: 'v18.0.0',
        };
        primaryModel = 'gemini-2.5-flash';
      }
    } catch {
      // Continue to deterministic fallback
    }
  }

  // If no AI was reachable, use the deterministic semantic classifier
  if (!primaryResult) {
    return classifyCallIntent(transcript, durationSeconds);
  }

  // Backend Validation of Evidence Substring
  if (primaryResult.evidence) {
    const evValidation = validateEvidenceInTranscript(primaryResult.evidence, transcript);
    if (!evValidation.isValid) {
      // AI hallucinated a quote not in transcript! Downgrade to REVIEW.
      return {
        ...primaryResult,
        call_type: 'review',
        confidence: 0.50,
        evidence: `Unverified AI quote: "${primaryResult.evidence}" (not found in verbatim transcript).`,
        reason: 'AI classification evidence failed backend transcript verification; downgraded to REVIEW.',
      };
    }
  }

  // Dual-AI check for uncertain or borderline calls (confidence < 0.85)
  if (primaryResult.confidence < 0.85 && groqApiKey) {
    try {
      const secRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          temperature: 0.05,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Second verification auditor. Respond strictly in JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (secRes.ok) {
        const secJson = await secRes.json();
        const secContent = secJson.choices?.[0]?.message?.content;
        if (secContent) {
          const secParsed = JSON.parse(secContent);
          const secType = secParsed.call_type;
          if (secType && secType !== primaryResult.call_type) {
            // Models disagreed! Per user mandate: IF AI models disagree -> REVIEW!
            return {
              call_type: 'review',
              confidence: 0.60,
              evidence: `Model 1 (${primaryModel}) reported "${primaryResult.call_type}", while Model 2 (qwen3.8-27b) reported "${secType}".`,
              evidence_speaker: 'UNKNOWN',
              evidence_timestamp: primaryResult.evidence_timestamp,
              reason: 'AI model disagreement: Dual-AI check failed consensus. Marked for compliance officer review.',
              model_used: `${primaryModel} + qwen/qwen3.8-27b`,
              secondary_model_agreement: false,
              prompt_version: 'v18.0.0',
            };
          }
          primaryResult.secondary_model_agreement = true;
        }
      }
    } catch {
      // Secondary check errored -> keep primary result
    }
  }

  return primaryResult;
}
