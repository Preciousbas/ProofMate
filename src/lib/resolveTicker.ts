import { getCanonicalTicker } from "./canonicalTickers";
import { resolveChainId } from "./chains";
import {
  searchTokens,
  type TokenSearchHit,
} from "./evidence/tokenSearch";

export type ResolveVia = "canonical" | "search";

export interface ResolveTickerResult {
  /** Best single match for agents that want one contract to analyze. */
  hit: TokenSearchHit | null;
  via?: ResolveVia;
  /** How many ranked candidates search found (before picking the top). */
  candidates?: number;
  note?: string;
}

/**
 * Resolve a ticker/symbol (or known alias like ETH→WETH) to one chain+address.
 * Prefers canonical majors, otherwise top-ranked DexScreener search hit.
 * Unknown `chainFilter` throws UnknownChainError (caller should 400).
 */
export async function resolveTicker(
  query: string,
  chainFilter?: string,
): Promise<ResolveTickerResult> {
  const q = query.trim();
  if (!q) return { hit: null };

  const filter =
    !chainFilter || chainFilter === "all"
      ? undefined
      : resolveChainId(chainFilter);

  const canonical = getCanonicalTicker(q);
  if (
    canonical &&
    (!filter || filter === canonical.chainId)
  ) {
    const hit: TokenSearchHit = {
      chainId: canonical.chainId,
      chainLabel: canonical.chainLabel,
      address: canonical.address,
      name: canonical.name,
      symbol: canonical.symbol,
    };
    return {
      hit,
      via: "canonical",
      candidates: 1,
      note: canonical.note,
    };
  }

  const results = await searchTokens(q, filter);
  if (results.length === 0) {
    return { hit: null, candidates: 0 };
  }

  return {
    hit: results[0],
    via: "search",
    candidates: results.length,
  };
}
