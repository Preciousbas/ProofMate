import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Auth gate + cheap early reject for oversized / incomplete API traffic.
 */
export default auth((request) => {
  const req = request as NextRequest;
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > 512_000) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }
  }

  if (
    pathname === "/api/analyze" &&
    req.method === "GET" &&
    !req.nextUrl.searchParams.get("tokenAddress")
  ) {
    return NextResponse.json(
      { error: "tokenAddress query param is required" },
      { status: 400 },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
