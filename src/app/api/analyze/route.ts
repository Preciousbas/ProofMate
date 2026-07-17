import { analyzeToken } from "@/lib/analyze";
import { isAspProtected, requireAspAuth } from "@/lib/aspAuth";
import {
  ANALYZE_CDN_S_MAXAGE,
  ANALYZE_CDN_SWR,
  RATE_LIMIT_ANALYZE_GLOBAL_PER_MIN,
  RATE_LIMIT_ANALYZE_PER_MIN,
} from "@/lib/constants";
import {
  enforceRateLimits,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/rateLimit";
import {
  analyzeCdnHeaders,
  clientErrorStatus,
  clientIp,
  readJsonBody,
} from "@/lib/requestGuards";
import { isValidTokenAddress, normalizeTokenAddress } from "@/lib/validation";
import { withAspPayment } from "@/lib/x402";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

async function rateLimitedResponse(ip: string) {
  const limited = await enforceRateLimits([
    { key: `analyze:${ip}`, limit: RATE_LIMIT_ANALYZE_PER_MIN },
    { key: "analyze:global", limit: RATE_LIMIT_ANALYZE_GLOBAL_PER_MIN },
  ]);
  if (limited.allowed) {
    return { limited, error: null as NextResponse | null };
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((limited.resetAt - Date.now()) / 1000),
  );
  return {
    limited,
    error: NextResponse.json(
      { error: "Too many analyze requests. Slow down a bit." },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(limited),
          "Retry-After": String(retryAfter),
        },
      },
    ),
  };
}

function analyzeResponseHeaders(
  limited: RateLimitResult,
  resolvedChain: string,
  tokenAddress: string,
): HeadersInit {
  // Public CDN cache is unsafe once auth/payment is on.
  const cacheHeaders = isAspProtected()
    ? { "Cache-Control": "private, no-store" }
    : analyzeCdnHeaders(ANALYZE_CDN_S_MAXAGE, ANALYZE_CDN_SWR);

  return {
    ...cacheHeaders,
    ...rateLimitHeaders(limited),
    "Netlify-Cache-ID": `analyze,${resolvedChain},${normalizeTokenAddress(tokenAddress)}`,
  };
}

async function runAnalyze(
  tokenAddress: string,
  chain: string | null,
  ip: string,
) {
  const { limited, error } = await rateLimitedResponse(ip);
  if (error) return error;

  const result = await analyzeToken(tokenAddress, chain);
  const resolvedChain = result.evidence.chain;
  return NextResponse.json(result, {
    headers: analyzeResponseHeaders(limited, resolvedChain, tokenAddress),
  });
}

async function getHandler(request: NextRequest) {
  try {
    const authError = requireAspAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const tokenAddress = searchParams.get("tokenAddress")?.trim();
    const chainRaw = searchParams.get("chain")?.trim();
    const chain =
      !chainRaw || chainRaw === "auto" || chainRaw === "all" ? null : chainRaw;

    if (!tokenAddress) {
      return NextResponse.json(
        { error: "tokenAddress query param is required" },
        { status: 400 },
      );
    }
    if (!isValidTokenAddress(tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 },
      );
    }

    return await runAnalyze(tokenAddress, chain, clientIp(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = clientErrorStatus(error) ?? 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function postHandler(request: NextRequest) {
  try {
    const authError = requireAspAuth(request);
    if (authError) return authError;

    const parsed = await readJsonBody<{
      tokenAddress?: string;
      chain?: string;
    }>(request);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }

    if (!parsed.data.tokenAddress) {
      return NextResponse.json(
        { error: "tokenAddress is required" },
        { status: 400 },
      );
    }

    const chainRaw = parsed.data.chain?.trim();
    const chain =
      !chainRaw || chainRaw === "auto" || chainRaw === "all" ? null : chainRaw;

    return await runAnalyze(
      parsed.data.tokenAddress,
      chain,
      clientIp(request),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const status = clientErrorStatus(error) ?? 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export const GET = withAspPayment(
  getHandler,
  "ProofMate analyze_token — scored trust memo from public on-chain and market data",
);

export const POST = withAspPayment(
  postHandler,
  "ProofMate analyze_token — scored trust memo from public on-chain and market data",
);
