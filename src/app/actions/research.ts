"use server";

import { headers } from "next/headers";
import { analyzeToken, getFollowUpAnswer } from "@/lib/analyze";
import { UnknownChainError } from "@/lib/chains";
import {
  RATE_LIMIT_ANALYZE_GLOBAL_PER_MIN,
  RATE_LIMIT_ANALYZE_PER_MIN,
  RATE_LIMIT_FOLLOW_UP_GLOBAL_PER_MIN,
  RATE_LIMIT_FOLLOW_UP_PER_MIN,
  RATE_LIMIT_SEARCH_GLOBAL_PER_MIN,
} from "@/lib/constants";
import { searchTokens } from "@/lib/evidence/tokenSearch";
import {
  FollowUpIntegrityError,
  parseFollowUpPayload,
} from "@/lib/followUpIntegrity";
import { enforceRateLimits } from "@/lib/rateLimit";
import type {
  AnalyzeResponse,
  FollowUpResponse,
  TokenEvidence,
  TrustMemo,
} from "@/lib/types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function clientIpFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Demo UI entry points — run in the Next.js server so PROOFMATE_API_KEY
 * never needs to ship to the browser. ASP/MCP clients use /api/* + API key.
 */
export async function analyzeTokenAction(
  tokenAddress: string,
  chain?: string | null,
): Promise<ActionResult<AnalyzeResponse>> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const limited = await enforceRateLimits([
    { key: `analyze:${ip}`, limit: RATE_LIMIT_ANALYZE_PER_MIN },
    { key: "analyze:global", limit: RATE_LIMIT_ANALYZE_GLOBAL_PER_MIN },
  ]);
  if (!limited.allowed) {
    return {
      ok: false,
      error: "Too many analyze requests. Slow down a bit.",
      status: 429,
    };
  }

  try {
    const data = await analyzeToken(tokenAddress, chain);
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    const status =
      error instanceof UnknownChainError ||
      message.includes("Invalid") ||
      message.includes("zero address")
        ? 400
        : 502;
    return { ok: false, error: message, status };
  }
}

export async function searchTokensAction(
  query: string,
  chain?: string | null,
): Promise<ActionResult<{ results: Awaited<ReturnType<typeof searchTokens>> }>> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const limited = await enforceRateLimits([
    { key: `search:${ip}`, limit: RATE_LIMIT_ANALYZE_PER_MIN },
    { key: "search:global", limit: RATE_LIMIT_SEARCH_GLOBAL_PER_MIN },
  ]);
  if (!limited.allowed) {
    return {
      ok: false,
      error: "Too many searches. Try again in a minute.",
      status: 429,
    };
  }

  try {
    const results = await searchTokens(
      query,
      !chain || chain === "all" ? undefined : chain,
    );
    return { ok: true, data: { results } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const status = error instanceof UnknownChainError ? 400 : 502;
    return { ok: false, error: message, status };
  }
}

export async function followUpAction(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): Promise<ActionResult<FollowUpResponse>> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const limited = await enforceRateLimits([
    { key: `follow-up:${ip}`, limit: RATE_LIMIT_FOLLOW_UP_PER_MIN },
    {
      key: "follow-up:global",
      limit: RATE_LIMIT_FOLLOW_UP_GLOBAL_PER_MIN,
    },
  ]);
  if (!limited.allowed) {
    return {
      ok: false,
      error: "Too many follow-up requests. Try again shortly.",
      status: 429,
    };
  }

  if (!question || typeof question !== "string" || question.length > 2_000) {
    return {
      ok: false,
      error: "question must be a string under 2000 characters",
      status: 400,
    };
  }

  try {
    const validated = parseFollowUpPayload(evidence, memo);
    const data = await getFollowUpAnswer(
      question,
      validated.evidence,
      validated.memo,
    );
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof FollowUpIntegrityError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Follow-up failed";
    return { ok: false, error: message, status: 400 };
  }
}
