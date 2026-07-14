import { NextResponse } from "next/server";
import { getFollowUpAnswer } from "@/lib/analyze";
import { requireAspAuth } from "@/lib/aspAuth";
import {
  RATE_LIMIT_FOLLOW_UP_GLOBAL_PER_MIN,
  RATE_LIMIT_FOLLOW_UP_PER_MIN,
} from "@/lib/constants";
import {
  FollowUpIntegrityError,
  parseFollowUpPayload,
} from "@/lib/followUpIntegrity";
import { enforceRateLimits, rateLimitHeaders } from "@/lib/rateLimit";
import { clientIp, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  try {
    const authError = requireAspAuth(request);
    if (authError) return authError;

    const ip = clientIp(request);
    const limited = await enforceRateLimits([
      { key: `follow-up:${ip}`, limit: RATE_LIMIT_FOLLOW_UP_PER_MIN },
      {
        key: "follow-up:global",
        limit: RATE_LIMIT_FOLLOW_UP_GLOBAL_PER_MIN,
      },
    ]);
    if (!limited.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((limited.resetAt - Date.now()) / 1000),
      );
      return NextResponse.json(
        { error: "Too many follow-up requests. Try again shortly." },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders(limited),
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    const parsed = await readJsonBody<{
      question?: string;
      evidence?: unknown;
      memo?: unknown;
    }>(request);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }

    const { question, evidence, memo } = parsed.data;

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    if (evidence == null || memo == null) {
      return NextResponse.json(
        {
          error:
            "evidence and memo are required. Run a new token analysis first.",
        },
        { status: 400 },
      );
    }

    if (typeof question !== "string" || question.length > 2_000) {
      return NextResponse.json(
        { error: "question must be a string under 2000 characters" },
        { status: 400 },
      );
    }

    const validated = parseFollowUpPayload(evidence, memo);
    const result = await getFollowUpAnswer(
      question,
      validated.evidence,
      validated.memo,
    );
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        ...rateLimitHeaders(limited),
      },
    });
  } catch (error) {
    const message =
      error instanceof FollowUpIntegrityError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Follow-up failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
