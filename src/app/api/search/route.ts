import { type NextRequest, NextResponse } from "next/server";
import { requireAspAuth } from "@/lib/aspAuth";
import {
  RATE_LIMIT_ANALYZE_PER_MIN,
  RATE_LIMIT_SEARCH_GLOBAL_PER_MIN,
} from "@/lib/constants";
import { searchTokens } from "@/lib/evidence/tokenSearch";
import { enforceRateLimits, rateLimitHeaders } from "@/lib/rateLimit";
import { clientErrorStatus, clientIp } from "@/lib/requestGuards";
import { withAspPayment } from "@/lib/x402";

export const runtime = "nodejs";
export const maxDuration = 15;

/** Ticker / name search via DexScreener — ASP skill: search_token. */
async function getHandler(request: NextRequest) {
  try {
    const authError = requireAspAuth(request);
    if (authError) return authError;

    const ip = clientIp(request);
    const limited = await enforceRateLimits([
      { key: `search:${ip}`, limit: RATE_LIMIT_ANALYZE_PER_MIN },
      { key: "search:global", limit: RATE_LIMIT_SEARCH_GLOBAL_PER_MIN },
    ]);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many searches. Try again in a minute." },
        {
          status: 429,
          headers: rateLimitHeaders(limited),
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const chain = searchParams.get("chain")?.trim() || undefined;

    if (!q) {
      return NextResponse.json(
        { error: "q query param is required" },
        { status: 400 },
      );
    }

    const results = await searchTokens(q, chain === "all" ? undefined : chain);
    return NextResponse.json(
      { results },
      {
        headers: {
          ...rateLimitHeaders(limited),
          "Cache-Control": "public, max-age=30, s-maxage=60",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const status = clientErrorStatus(error) ?? 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export const GET = withAspPayment(
  getHandler,
  "ProofMate search_token — find tokens by ticker or name",
);
