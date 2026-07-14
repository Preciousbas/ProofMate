import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

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

/** True when production ASP auth is configured. */
export function isAspAuthEnabled(): boolean {
  return Boolean(process.env.PROOFMATE_API_KEY?.trim());
}

/**
 * Gate skill routes when PROOFMATE_API_KEY is set.
 * Discovery endpoints (/api/agent, /api/skill) stay public.
 * Demo UI should call server actions (no browser-exposed key).
 */
export function requireAspAuth(request: Request): NextResponse | null {
  const expected = process.env.PROOFMATE_API_KEY?.trim();
  if (!expected) return null;

  const provided = extractAspApiKey(request);
  if (!provided || !safeEqual(provided, expected)) {
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
