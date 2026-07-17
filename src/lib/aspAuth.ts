import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { isX402Configured } from "@/lib/x402Config";

const AUTH_HINT =
  "Pass x-api-key or Authorization: Bearer with your PROOFMATE_API_KEY.";

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Keep comparison roughly constant-time on length mismatch.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function extractAspApiKey(request: Request): string | null {
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

/** True when production ASP API-key auth is configured. */
export function isAspAuthEnabled(): boolean {
  return Boolean(process.env.PROOFMATE_API_KEY?.trim());
}

/** True when skill HTTP responses must not be publicly cached. */
export function isAspProtected(): boolean {
  return isAspAuthEnabled() || isX402Configured();
}

/** Owner/MCP bypass for x402 when PROOFMATE_API_KEY matches. */
export function hasValidAspApiKey(request: Request): boolean {
  const expected = process.env.PROOFMATE_API_KEY?.trim();
  if (!expected) return false;
  const provided = extractAspApiKey(request);
  if (!provided) return false;
  return safeEqual(provided, expected);
}

/**
 * Gate skill routes when PROOFMATE_API_KEY is set and x402 is not.
 * When x402 is configured, unpaid callers are challenged with HTTP 402 by
 * withAspPayment — API key remains an optional payment bypass, not a 401 wall.
 * Discovery endpoints (/api/agent, /api/skill) stay public.
 * Demo UI should call server actions (no browser-exposed key).
 */
export function requireAspAuth(request: Request): NextResponse | null {
  if (isX402Configured()) {
    // Payment (or API-key bypass) already enforced by withAspPayment.
    return null;
  }

  const expected = process.env.PROOFMATE_API_KEY?.trim();
  if (!expected) return null;

  if (!hasValidAspApiKey(request)) {
    return NextResponse.json(
      {
        error: `Unauthorized. ${AUTH_HINT}`,
        auth: {
          required: true,
          headers: ["x-api-key", "Authorization: Bearer <PROOFMATE_API_KEY>"],
        },
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="ProofMate ASP"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return null;
}
