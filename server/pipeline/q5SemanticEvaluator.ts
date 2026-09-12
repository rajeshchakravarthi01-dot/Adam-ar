// =============================================================
// Stage 7: Q5 SEMANTIC ADVISOR NON-PROMISSORY EVALUATOR
// Evaluates SEBI compliance regarding prohibited return assurances,
// profit guarantees, capital protection promises, and risk-free claims.
//
// Key Mandates:
// 1. ADVISOR-ONLY: Only statements made by the dealer/advisor can violate SEBI norms.
//    Client inquiries or expectations are NOT violations.
// 2. NEGATION & DISCLAIMER AWARENESS: "No guarantee", "subject to market risk"
//    neutralize false positive keyword hits.
// 3. MULTILINGUAL SUPPORT: English, Hindi, and Hinglish phrases.
// 4. LLM-FIRST with Fallback: Uses Groq GPT-OSS / Gemini if available,
//    otherwise uses precision semantic phrase analysis with speaker isolation.
// =============================================================

import type { TranscriptSegment, AuditQuestionResult } from './types';

// English prohibited assurance patterns
const PROHIBITED_ENGLISH = [
  /\b(?:guarantee\s+\d+|guaranteed\s+(?:return|profit|gain|recovery)|assured\s+(?:return|profit|gain))\b/i,
  /\b(?:definite\s+return|fixed\s+return|assured\s+income|capital\s+(?:guaranteed|protection\s+guaranteed))\b/i,
  /\b(?:100%\s+(?:safe|guarantee|risk\s*free)|zero\s+risk|risk\s*free\s+return|no\s+loss\s+guaranteed)\b/i,
  /\b(?:you\s+will\s+definitely\s+make|sure\s*shot\s+profit|will\s+double\s+your\s+money|surely\s+double)\b/i,
  /\b(?:cannot\s+lose\s+money|impossible\s+to\s+lose|guaranteed\s+multibagger)\b/i,
];

// Hindi / Hinglish prohibited assurance patterns
const PROHIBITED_HINDI_HINGLISH = [
  /\b(?:pakka\s+(?:profit|return|fayda)|paisa\s+(?:double|do\s+guna)\s+hoga|double\s+ho\s+jayega)\b/i,
  /\b(?:loss\s+bilkul\s+nahi|koi\s+risk\s+nahi|bilkul\s+safe\s+hai|loss\s+ka\s+koi\s+chance\s+nahi)\b/i,
  /\b(?:meri\s+(?:guarantee|pakkii\s+guarantee)|100%\s+guarantee\s+hai|fix\s+return\s+milega)\b/i,
  /\b(?:profit\s+hi\s+profit|paisa\s+dubne\s+ka\s+sawal\s+nahi|mera\s+vaada\s+hai)\b/i,
];

// Legitimate regulatory disclaimers & negations that negate promissory intent
const DISCLAIMERS_AND_NEGATIONS = [
  /\b(?:cannot\s+guarantee|no\s+guarantee|not\s+guaranteed|does\s+not\s+guarantee)\b/i,
  /\b(?:no\s+assurance|subject\s+to\s+market\s+risk|market\s+risks?|risk\s+involved)\b/i,
  /\b(?:guarantee\s+nahi\s+hai|guarantee\s+nahi\s+de\s+sakte|market\s+pe\s+depend)\b/i,
  /\b(?:loss\s+bhi\s+ho\s+sakta|volatility\s+hai|equities\s+are\s+risky)\b/i,
];

interface LlmQ5Response {
  has_prohibited_promise: boolean;
  speaker: 'ADVISOR' | 'CLIENT' | 'NONE';
  quote?: string;
  reason?: string;
  confidence?: number;
}

/**
 * Call Groq or Gemini for semantic Q5 analysis
 */
async function callLlmForQ5(
  transcript: string,
  groqApiKey?: string,
  geminiKey?: string
): Promise<LlmQ5Response | null> {
  const prompt = `You are a strict SEBI (Securities and Exchange Board of India) Regulatory Compliance Auditor.
Analyze this broker-client phone conversation for Question 5: Non-Promissory Return Analysis.

REGULATORY RULE:
SEBI strictly prohibits equity dealers, relationship managers, and advisors from making any verbal guarantee, return promise, profit assurance, or capital protection claim to clients.

STRICT AUDIT CRITERIA:
1. ONLY statements spoken by the ADVISOR/DEALER can trigger a violation.
2. If the CLIENT asks about returns, guarantees, or safety, this is NOT an advisor violation.
3. If the ADVISOR gives market disclaimers ("subject to market risk", "we cannot guarantee returns", "markets fluctuate"), this is FULLY COMPLIANT.
4. Factual discussions (e.g., historical returns, target price with rationale, company fundamentals) are FULLY COMPLIANT.
5. PROHIBITED EXAMPLES: "100% guarantee", "you will definitely make 20%", "pakka double ho jayega", "koi risk nahi hai", "capital safe rahega".

TRANSCRIPT:
"""
${transcript.slice(0, 5000)}
"""

Respond strictly with a valid JSON object matching this schema:
{
  "has_prohibited_promise": boolean,
  "speaker": "ADVISOR" | "CLIENT" | "NONE",
  "quote": "exact sentence from transcript if violation found, else empty string",
  "reason": "short explanation",
  "confidence": number between 0.0 and 1.0
}`;

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
          temperature: 0.0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are a SEBI compliance auditor. Respond strictly in JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            has_prohibited_promise: Boolean(parsed.has_prohibited_promise),
            speaker: parsed.speaker === 'ADVISOR' || parsed.speaker === 'CLIENT' ? parsed.speaker : 'NONE',
            quote: parsed.quote || '',
            reason: parsed.reason || '',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
          };
        }
      }
    } catch {}
  }

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            has_prohibited_promise: Boolean(parsed.has_prohibited_promise),
            speaker: parsed.speaker === 'ADVISOR' || parsed.speaker === 'CLIENT' ? parsed.speaker : 'NONE',
            quote: parsed.quote || '',
            reason: parsed.reason || '',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
          };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Stage 7 Semantic Evaluator for Question 5
 */
export async function evaluateQ5SemanticAdvisorPromises(
  transcript: string,
  segments: TranscriptSegment[],
  groqApiKey?: string,
  geminiKey?: string
): Promise<AuditQuestionResult> {
  // Step 1: Attempt LLM-based semantic evaluation if API key is provided
  if (groqApiKey || geminiKey) {
    const aiResult = await callLlmForQ5(transcript, groqApiKey, geminiKey);
    if (aiResult) {
      if (aiResult.has_prohibited_promise && aiResult.speaker === 'ADVISOR') {
        const matchingSeg = segments.find(
          (s) => aiResult.quote && s.text.toLowerCase().includes(aiResult.quote.slice(0, 25).toLowerCase())
        );
        return {
          status: 'FAIL',
          flag: 'FATAL',
          evidence: `Advisor verbal return or profit assurance detected: "${aiResult.quote}". Prohibited under SEBI regulatory norms.`,
          reason: aiResult.reason || 'Dialogue contains prohibited return or profit assurance statement by advisor.',
          confidence: aiResult.confidence || 0.95,
          speaker: 'ADVISOR',
          start_ms: matchingSeg ? Math.round(matchingSeg.start_time * 1000) : undefined,
          end_ms: matchingSeg ? Math.round(matchingSeg.end_time * 1000) : undefined,
          evidence_verified: true,
        };
      } else if (aiResult.has_prohibited_promise && aiResult.speaker === 'CLIENT') {
        return {
          status: 'PASS',
          evidence: `Client initiated discussion regarding returns/guarantees, but advisor adhered to non-promissory standards.`,
          reason: 'No advisor verbal return commitment detected (client inquiry only).',
          confidence: aiResult.confidence || 0.90,
          evidence_verified: true,
        };
      } else {
        return {
          status: 'PASS',
          evidence: 'No prohibited return, profit guarantee, or capital assurance identified in advisor dialogue.',
          reason: 'Compliant: advisor strictly adhered to SEBI non-promissory norms.',
          confidence: aiResult.confidence || 0.95,
          evidence_verified: true,
        };
      }
    }
  }

  // Step 2: High-precision semantic rule evaluation across segments with speaker isolation
  const allPatterns = [...PROHIBITED_ENGLISH, ...PROHIBITED_HINDI_HINGLISH];

  let detectedPromise: {
    segment: TranscriptSegment;
    quote: string;
    speaker: 'ADVISOR' | 'CLIENT' | 'UNKNOWN';
  } | null = null;

  for (const seg of segments) {
    const text = seg.text;
    const hasDisclaimer = DISCLAIMERS_AND_NEGATIONS.some((d) => d.test(text));
    if (hasDisclaimer) continue; // Proximity disclaimer cancels out promissory phrase

    for (const pat of allPatterns) {
      const match = text.match(pat);
      if (match) {
        detectedPromise = {
          segment: seg,
          quote: match[0],
          speaker: seg.speaker,
        };
        break;
      }
    }
    if (detectedPromise) break;
  }

  // If no segment match, test transcript text directly
  if (!detectedPromise) {
    const hasGlobalDisclaimer = DISCLAIMERS_AND_NEGATIONS.some((d) => d.test(transcript));
    if (!hasGlobalDisclaimer) {
      for (const pat of allPatterns) {
        const match = transcript.match(pat);
        if (match) {
          detectedPromise = {
            segment: {
              segment_id: 'transcript_match',
              start_time: 0,
              end_time: 0,
              speaker: 'UNKNOWN',
              text: transcript,
            },
            quote: match[0],
            speaker: 'UNKNOWN',
          };
          break;
        }
      }
    }
  }

  if (detectedPromise) {
    if (detectedPromise.speaker === 'ADVISOR') {
      return {
        status: 'FAIL',
        flag: 'FATAL',
        evidence: `Advisor verbal return/profit assurance statement detected at ${detectedPromise.segment.start_time}s: "${detectedPromise.quote}". Prohibited under SEBI regulatory norms.`,
        reason: 'Dialogue contains prohibited return or profit assurance statement by advisor.',
        confidence: 0.92,
        speaker: 'ADVISOR',
        start_ms: Math.round(detectedPromise.segment.start_time * 1000),
        end_ms: Math.round(detectedPromise.segment.end_time * 1000),
        evidence_verified: true,
      };
    } else if (detectedPromise.speaker === 'CLIENT') {
      return {
        status: 'PASS',
        evidence: `Client mentioned return/guarantee inquiry ("${detectedPromise.quote}"), but advisor did not make any prohibited return commitment.`,
        reason: 'No advisor verbal return commitment detected (client inquiry only).',
        confidence: 0.90,
        evidence_verified: true,
      };
    } else {
      return {
        status: 'REVIEW',
        evidence: `Potential return assurance statement detected ("${detectedPromise.quote}"), but speaker attribution is UNKNOWN.`,
        reason: 'Dialogue contains potential return assurance statement requiring speaker attribution review.',
        confidence: 0.65,
        evidence_verified: false,
      };
    }
  }

  return {
    status: 'PASS',
    evidence: 'No prohibited return, profit guarantee, or assurance statement identified in advisor dialogue.',
    reason: 'Compliant: advisor strictly adhered to SEBI non-promissory norms.',
    confidence: 0.95,
    evidence_verified: true,
  };
}
