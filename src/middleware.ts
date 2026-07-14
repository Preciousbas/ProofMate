import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware — cheap early reject for obviously bad API traffic.
 * Per-IP quotas live in route handlers (node) with richer counters.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Block oversized Content-Length before the function boots.
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > 512_000) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }
  }

  // Analyze GET must include a token address query.
  if (
    pathname === "/api/analyze" &&
    request.method === "GET" &&
    !request.nextUrl.searchParams.get("tokenAddress")
  ) {
    return NextResponse.json(
      { error: "tokenAddress query param is required" },
      { status: 400 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
