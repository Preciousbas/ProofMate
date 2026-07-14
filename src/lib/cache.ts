import { CACHE_TTL_MS } from "./constants";
import { LruTtlCache } from "./lruCache";
import type { TokenEvidence, TrustMemo } from "./types";
import { normalizeTokenAddress } from "./validation";

/** Soft cap per serverless instance — prevents unbounded Map growth under load. */
const MAX_EVIDENCE_CACHE_ENTRIES = 500;
const MAX_ANALYZE_CACHE_ENTRIES = 500;

const evidenceCache = new LruTtlCache<TokenEvidence>(
  MAX_EVIDENCE_CACHE_ENTRIES,
  CACHE_TTL_MS,
);
const analyzeCache = new LruTtlCache<{ memo: TrustMemo; evidence: TokenEvidence }>(
  MAX_ANALYZE_CACHE_ENTRIES,
  CACHE_TTL_MS,
);

const inflightEvidence = new Map<string, Promise<TokenEvidence>>();
const inflightAnalyze = new Map<
  string,
  Promise<{ memo: TrustMemo; evidence: TokenEvidence }>
>();

export function getCachedEvidence(key: string): TokenEvidence | null {
  return evidenceCache.get(key);
}

export function setCachedEvidence(key: string, value: TokenEvidence): void {
  evidenceCache.set(key, value);
}

/**
 * Coalesce concurrent fetches for the same cache key within one instance.
 * Thousands of identical USDC analyzes share one upstream round-trip.
 */
export async function getOrFetchEvidence(
  key: string,
  fetcher: () => Promise<TokenEvidence>,
): Promise<TokenEvidence> {
  const cached = evidenceCache.get(key);
  if (cached) return cached;

  const existing = inflightEvidence.get(key);
  if (existing) return existing;

  const promise = fetcher()
    .then((value) => {
      evidenceCache.set(key, value);
      return value;
    })
    .finally(() => {
      inflightEvidence.delete(key);
    });

  inflightEvidence.set(key, promise);
  return promise;
}

export function getCachedAnalyze(
  key: string,
): { memo: TrustMemo; evidence: TokenEvidence } | null {
  return analyzeCache.get(key);
}

/**
 * Coalesce + cache full analyze results (scoring + optional LLM polish).
 * Concurrent callers for the same token share one pipeline run.
 */
export async function getOrFetchAnalyze(
  key: string,
  fetcher: () => Promise<{ memo: TrustMemo; evidence: TokenEvidence }>,
): Promise<{ memo: TrustMemo; evidence: TokenEvidence }> {
  const cached = analyzeCache.get(key);
  if (cached) return cached;

  const existing = inflightAnalyze.get(key);
  if (existing) return existing;

  const promise = fetcher()
    .then((value) => {
      analyzeCache.set(key, value);
      // Keep evidence cache warm for follow-up / re-score paths.
      evidenceCache.set(key, value.evidence);
      return value;
    })
    .finally(() => {
      inflightAnalyze.delete(key);
    });

  inflightAnalyze.set(key, promise);
  return promise;
}

export function clearEvidenceCache(): void {
  evidenceCache.clear();
  analyzeCache.clear();
  inflightEvidence.clear();
  inflightAnalyze.clear();
}

/**
 * Cache identity for a chain+address.
 * EVM addresses are lowercased; Solana base58 keeps case (case-sensitive).
 */
export function cacheKey(chain: string, address: string): string {
  return `${chain}:${normalizeTokenAddress(address)}`;
}
