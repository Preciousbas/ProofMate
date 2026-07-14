import { Redis } from "@upstash/redis";
import { RATE_LIMIT_WINDOW_MS } from "./constants";

interface Bucket {
  count: number;
  resetAt: number;
}

/** Fixed-window counter per key within one isolate — used when Upstash is unset. */
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  /** Which store enforced this decision. */
  backend: "upstash" | "memory";
}

let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

export function isDistributedRateLimitEnabled(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function pruneBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;

  const sorted = [...buckets.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const excess = buckets.size - Math.floor(MAX_BUCKETS * 0.8);
  for (let i = 0; i < excess; i += 1) {
    buckets.delete(sorted[i][0]);
  }
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneBuckets(now);

  const existing = buckets.get(key);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
      limit,
      backend: "memory",
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit,
      backend: "memory",
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    limit,
    backend: "memory",
  };
}

/**
 * Fixed-window limit via Upstash INCR (shared across all serverless isolates).
 * Returns null on misconfig / Redis errors so callers can fall back to memory.
 */
async function checkUpstashRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const now = Date.now();
    const windowId = Math.floor(now / windowMs);
    const redisKey = `pm:rl:${key}:${windowId}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    const resetAt = (windowId + 1) * windowMs;
    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
        backend: "upstash",
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      resetAt,
      limit,
      backend: "upstash",
    };
  } catch {
    return null;
  }
}

/**
 * Preferred entry point. Uses Upstash when configured; otherwise in-memory.
 * Always await — API is async so callers share one code path.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs = RATE_LIMIT_WINDOW_MS,
): Promise<RateLimitResult> {
  const distributed = await checkUpstashRateLimit(key, limit, windowMs);
  if (distributed) return distributed;
  return checkMemoryRateLimit(key, limit, windowMs);
}

/**
 * Enforce several scopes (e.g. per-IP + global). Returns the first deny, or
 * the result with the smallest remaining budget.
 */
export async function enforceRateLimits(
  scopes: Array<{ key: string; limit: number }>,
  windowMs = RATE_LIMIT_WINDOW_MS,
): Promise<RateLimitResult> {
  let tightest: RateLimitResult | null = null;
  for (const scope of scopes) {
    const result = await checkRateLimit(scope.key, scope.limit, windowMs);
    if (!result.allowed) return result;
    if (!tightest || result.remaining < tightest.remaining) {
      tightest = result;
    }
  }
  return tightest ?? {
    allowed: true,
    remaining: 0,
    resetAt: Date.now() + windowMs,
    limit: 0,
    backend: "memory",
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    "X-RateLimit-Backend": result.backend,
  };
}
