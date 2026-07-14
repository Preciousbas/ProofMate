import { z } from "zod";
import { DISCLAIMER, GROQ_API_BASE, GROQ_MEMO_MODEL } from "../constants";
import type { ScoringResult, TokenEvidence, TrustMemo } from "../types";
import { buildTrustMemo } from "./template";

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Groq may only polish these fields; everything else stays template-owned. */
const groqPolishSchema = z.object({
  summary: z.string().trim().min(1).max(2_000).optional(),
  recommendation: z.string().trim().min(1).max(4_000).optional(),
  inferences: z.array(z.string().trim().min(1).max(1_000)).max(20).optional(),
});

type GroqPolish = z.infer<typeof groqPolishSchema>;

function buildPrompt(evidence: TokenEvidence, scoring: ScoringResult): string {
  return `Rewrite ONLY summary, recommendation, and inferences in plain spoken English.
Tone: a sharp teammate explaining onchain risk — short sentences, concrete words.
Avoid: buzzwords, filler ("delve", "crucial", "landscape", "leverage", "robust"), corporate AI phrasing, hedging stacks.
Rules:
- Don't invent numbers, names, or chain labels
- Don't call it a scam or "safe"
- Don't give buy/sell advice
- Missing data = say you don't have it
- Summary: 1–2 short sentences max
- Use evidence token name/symbol (never Solidity class names)

Evidence JSON:
${JSON.stringify({ evidence, scoring }, null, 2)}

Return JSON keys only: summary, recommendation, inferences (string[])`;
}

/**
 * Parse Groq JSON per-field. Invalid shape → ignore that field and keep template.
 * Prevents non-array `inferences` (or garbage types) from reaching the UI.
 */
export function mergeGroqPolish(
  base: TrustMemo,
  content: string,
): TrustMemo {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return base;
  }

  const parsed = groqPolishSchema.safeParse(raw);
  if (!parsed.success) {
    // Partial recovery: if top-level object has usable fields, adopt those only.
    return mergePartialPolish(base, raw);
  }

  return applyPolish(base, parsed.data);
}

function mergePartialPolish(base: TrustMemo, raw: unknown): TrustMemo {
  if (!raw || typeof raw !== "object") return base;

  const obj = raw as Record<string, unknown>;
  const partial: GroqPolish = {};

  if (typeof obj.summary === "string") {
    const summary = obj.summary.trim();
    if (summary.length > 0 && summary.length <= 2_000) {
      partial.summary = summary;
    }
  }

  if (typeof obj.recommendation === "string") {
    const recommendation = obj.recommendation.trim();
    if (recommendation.length > 0 && recommendation.length <= 4_000) {
      partial.recommendation = recommendation;
    }
  }

  const inferences = z
    .array(z.string().trim().min(1).max(1_000))
    .max(20)
    .safeParse(obj.inferences);
  if (inferences.success && inferences.data.length > 0) {
    partial.inferences = inferences.data;
  }

  return applyPolish(base, partial);
}

function applyPolish(base: TrustMemo, polish: GroqPolish): TrustMemo {
  return {
    ...base,
    summary: polish.summary ?? base.summary,
    recommendation: polish.recommendation ?? base.recommendation,
    inferences:
      polish.inferences && polish.inferences.length > 0
        ? polish.inferences
        : base.inferences,
    keyFacts: base.keyFacts,
    facts: base.facts,
    redFlags: base.redFlags,
    riskLevel: base.riskLevel,
    riskLabel: base.riskLabel,
    riskScore: base.riskScore,
    tokenName: base.tokenName,
    tokenSymbol: base.tokenSymbol,
    sources: base.sources,
    disclaimer: DISCLAIMER,
  };
}

export async function maybeEnhanceMemo(
  evidence: TokenEvidence,
  scoring: ScoringResult,
): Promise<TrustMemo> {
  const base = buildTrustMemo(evidence, scoring);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return base;

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
              "Rewrite in plain, direct English. No corporate AI tone. JSON only. Never invent data.",
          },
          { role: "user", content: buildPrompt(evidence, scoring) },
        ],
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) return base;

    const data = (await response.json()) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return base;

    return mergeGroqPolish(base, content);
  } catch {
    return base;
  }
}
