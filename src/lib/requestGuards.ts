import { MAX_JSON_BODY_BYTES } from "./constants";
import { UnknownChainError } from "./chains";

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Map known client/input errors to HTTP status; null = treat as upstream/server. */
export function clientErrorStatus(error: unknown): number | null {
  if (error instanceof UnknownChainError) return 400;
  if (!(error instanceof Error)) return null;
  const message = error.message;
  if (
    message.includes("Invalid") ||
    message.includes("zero address") ||
    message.startsWith("Unsupported chain")
  ) {
    return 400;
  }
  return null;
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > maxBytes) {
      return {
        ok: false,
        error: `Request body too large (max ${maxBytes} bytes)`,
        status: 413,
      };
    }
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      error: `Request body too large (max ${maxBytes} bytes)`,
      status: 413,
    };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
}

/** Headers that let Vercel/Netlify CDN absorb identical token analyzes. */
export function analyzeCdnHeaders(sMaxAge: number, swr: number): HeadersInit {
  return {
    // Browsers revalidate; shared caches hold the hot path.
    "Cache-Control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    "CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    "Vercel-CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    Vary: "Accept-Encoding",
  };
}
