import { z } from "zod";
import {
  GROQ_API_BASE,
  GROQ_MEMO_MODEL,
  isFollowUpLlmEnabled,
} from "./constants";
import {
  answerHasUngroundedNumbers,
  collectAllowedNumbers,
} from "./followUpGrounding";
import type { FollowUpResponse, TokenEvidence, TrustMemo } from "./types";

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const followUpLlmSchema = z.object({
  answer: z.string().trim().min(1).max(4_000),
  grounded: z.boolean(),
});

function buildFollowUpPrompt(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): string {
  return `You answer follow-up questions about a token trust memo.

Voice (critical):
- Sound like a sharp research teammate on chat — plain spoken, first-person where it fits (“I can’t…”, “Here’s what stands out…”, “From this memo…”)
- Short paragraphs. No corporate / legal / academic filler
- Never say: “The provided data does not support…”, “It is recommended that…”, “Based on the available information…”
- Prefer concrete words over hedges stacked on hedges

Rules:
- Use ONLY the Evidence JSON and Memo JSON below. Nothing else
- Do not invent numbers, wallet addresses, chain names, or flags
- Every number you write must appear in the JSON (risk score, liquidity, %, holder counts, etc.)
- Do not call the token a scam or "safe"
- Do not give buy/sell / invest / allocate advice
- If they ask whether to buy, invest, hold, sell, or if you’d “recommend” this token: refuse warmly in first person, say you only provide analysis to help them decide, remind them to do their own research, then optionally point to what they can ask instead (holders, liquidity, contract, score). Do not sneak in a soft buy/sell lean
- If the data isn’t there, say what’s missing in plain English and set grounded=false
- Prefer short paragraphs or tight bullet lists

Question:
${question}

Memo JSON:
${JSON.stringify(
    {
      tokenAddress: memo.tokenAddress,
      tokenSymbol: memo.tokenSymbol,
      tokenName: memo.tokenName,
      riskScore: memo.riskScore,
      riskLevel: memo.riskLevel,
      riskLabel: memo.riskLabel,
      summary: memo.summary,
      keyFacts: memo.keyFacts,
      redFlags: memo.redFlags,
      recommendation: memo.recommendation,
      inferences: memo.inferences,
    },
    null,
    2,
  )}

Evidence JSON:
${JSON.stringify(evidence, null, 2)}

Return JSON only: { "answer": string, "grounded": boolean }`;
}

/**
 * Optional Groq path for open-ended follow-ups.
 * Returns null when Groq is unset / disabled / fails / invents numbers.
 */
export async function maybeAnswerFollowUpWithLlm(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): Promise<FollowUpResponse | null> {
  if (!isFollowUpLlmEnabled()) return null;

  const apiKey = process.env.GROQ_API_KEY!.trim();
  const allowedNumbers = collectAllowedNumbers(evidence, memo);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MEMO_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Conversational token research teammate. Plain spoken, first-person when natural. JSON only. Never invent data or numbers. Never give buy/sell/invest advice — refuse those warmly and steer back to analysis + DYOR.",
          },
          {
            role: "user",
            content: buildFollowUpPrompt(question, evidence, memo),
          },
        ],
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) return null;

    const data = (await response.json()) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }

    const parsed = followUpLlmSchema.safeParse(raw);
    if (!parsed.success) return null;

    if (answerHasUngroundedNumbers(parsed.data.answer, allowedNumbers)) {
      return null;
    }

    return {
      answer: parsed.data.answer,
      grounded: parsed.data.grounded,
      source: "llm",
    };
  } catch {
    return null;
  }
}
