import { z } from "zod";
import { GROQ_API_BASE, GROQ_MEMO_MODEL } from "./constants";
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
Use ONLY the Evidence JSON and Memo JSON below. Nothing else.
Rules:
- Do not invent numbers, wallet addresses, chain names, or flags
- Do not call the token a scam or "safe"
- Do not give buy/sell / investment advice
- If the data does not support an answer, say what is missing and set grounded=false
- Prefer short paragraphs or tight bullet lists
- Plain spoken English — no corporate AI filler

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
 * Returns null when Groq is unset / fails / returns invalid JSON.
 */
export async function maybeAnswerFollowUpWithLlm(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): Promise<FollowUpResponse | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

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
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Grounded token research assistant. JSON only. Never invent data. Never give trading advice.",
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

    return {
      answer: parsed.data.answer,
      grounded: parsed.data.grounded,
      source: "llm",
    };
  } catch {
    return null;
  }
}
