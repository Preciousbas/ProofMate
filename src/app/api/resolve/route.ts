import { type NextRequest, NextResponse } from "next/server";
import { requireAspAuth } from "@/lib/aspAuth";
import {
  RATE_LIMIT_ANALYZE_PER_MIN,
  RATE_LIMIT_SEARCH_GLOBAL_PER_MIN,
} from "@/lib/constants";
import { resolveTicker } from "@/lib/resolveTicker";
import { enforceRateLimits, rateLimitHeaders } from "@/lib/rateLimit";
import { clientErrorStatus, clientIp } from "@/lib/requestGuards";
import { withAspPayment } from "@/lib/x402";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * ASP skill: resolve_ticker
 * Pick one best token for a ticker/symbol so agents can call analyze_token next.
 */
async function getHandler(request: NextRequest) {
  try {
    const authError = requireAspAuth(request);
    if (authError) return authError;

    const ip = clientIp(request);
    const limited = await enforceRateLimits([
      { key: `resolve:${ip}`, limit: RATE_LIMIT_ANALYZE_PER_MIN },
      { key: "resolve:global", limit: RATE_LIMIT_SEARCH_GLOBAL_PER_MIN },
    ]);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many resolve requests. Try again in a minute." },
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
        {
          error:
            "q query param is required (ticker or symbol, e.g. PEPE, ETH)",
        },
        { status: 400 },
      );
    }

    const resolved = await resolveTicker(q, chain);
    if (!resolved.hit) {
      return NextResponse.json(
        {
          error: `Could not resolve “${q}”${chain && chain !== "all" ? ` on ${chain}` : ""}.`,
          hit: null,
          candidates: 0,
        },
        {
          status: 404,
          headers: rateLimitHeaders(limited),
        },
      );
    }

    return NextResponse.json(
      {
        hit: resolved.hit,
        via: resolved.via,
        candidates: resolved.candidates,
        note: resolved.note,
        next: {
          skill: "analyze_token",
          method: "GET",
          path: `/api/analyze?tokenAddress=${encodeURIComponent(resolved.hit.address)}&chain=${encodeURIComponent(resolved.hit.chainId)}`,
        },
      },
      {
        headers: {
          ...rateLimitHeaders(limited),
          "Cache-Control": "public, max-age=30, s-maxage=60",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";
    const status = clientErrorStatus(error) ?? 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export const GET = withAspPayment(
  getHandler,
  "ProofMate resolve_ticker — resolve a ticker to one best address+chain",
);
