import { fetchJson } from "../http";
import { getChain, resolveChainId } from "../chains";
import { addressesEqual } from "../validation";

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
}

interface DexScreenerResponse {
  pairs?: DexPair[] | null;
}

export interface TokenMarketSnapshot {
  symbol?: string;
  name?: string;
  priceUsd?: number;
  liquidityUsd?: number;
  volume24h?: number;
  fdv?: number;
  marketCap?: number;
  pairCount: number;
  bestPairAddress?: string;
  dexId?: string;
  available: boolean;
  error?: string;
}

const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex";

export async function getTokenMarketSnapshot(
  tokenAddress: string,
  chain = "eth",
): Promise<TokenMarketSnapshot> {
  try {
    const chainConfig = getChain(resolveChainId(chain));
    const targetChain = chainConfig?.dexScreenerId ?? "ethereum";

    const data = await fetchJson<DexScreenerResponse>(
      `${DEXSCREENER_BASE}/tokens/${tokenAddress}`,
    );

    const pairs = (data.pairs ?? []).filter(
      (pair) => pair && pair.chainId === targetChain,
    );
    if (pairs.length === 0) {
      return {
        pairCount: 0,
        available: false,
        error: `No trading pairs found on ${chainConfig?.label ?? targetChain}`,
      };
    }

    const bestPair = [...pairs].sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
    )[0];

    const token = addressesEqual(bestPair.baseToken.address, tokenAddress)
      ? bestPair.baseToken
      : bestPair.quoteToken;

    return {
      symbol: token.symbol,
      name: token.name,
      priceUsd: bestPair.priceUsd ? Number(bestPair.priceUsd) : undefined,
      liquidityUsd: bestPair.liquidity?.usd,
      volume24h: bestPair.volume?.h24,
      fdv: bestPair.fdv,
      marketCap: bestPair.marketCap,
      pairCount: pairs.length,
      bestPairAddress: bestPair.pairAddress,
      dexId: bestPair.dexId,
      available: true,
    };
  } catch (error) {
    return {
      pairCount: 0,
      available: false,
      error: error instanceof Error ? error.message : "DexScreener request failed",
    };
  }
}

export function dexScreenerSourceUrl(tokenAddress: string, chain = "eth"): string {
  const dexId = getChain(resolveChainId(chain))?.dexScreenerId ?? "ethereum";
  return `https://dexscreener.com/${dexId}/${tokenAddress}`;
}
