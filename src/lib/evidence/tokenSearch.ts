import { fetchJson } from "../http";
import {
  getCanonicalTicker,
  isZeroEvmAddress,
  TICKER_HOME_CHAIN,
} from "../canonicalTickers";
import { formatUsd, addressesEqual, isEvmAddress, isSolanaAddress } from "../validation";
import {
  SUPPORTED_CHAINS,
  getChain,
  resolveChainId,
  type ChainConfig,
} from "../chains";

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

interface DexSearchResponse {
  pairs?: DexPair[] | null;
}

interface DexTokensResponse {
  pairs?: DexPair[] | null;
}

export interface TokenSearchHit {
  chainId: string;
  chainLabel: string;
  address: string;
  name: string;
  symbol: string;
  liquidityUsd?: number;
  volume24h?: number;
  priceUsd?: number;
  dexId?: string;
  pairAddress?: string;
}

const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex";

function supportedDexIds(): Set<string> {
  return new Set(SUPPORTED_CHAINS.map((c) => c.dexScreenerId));
}

function chainFromDex(dexChainId: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.dexScreenerId === dexChainId);
}

function normalizeHitAddress(address: string): string {
  if (isEvmAddress(address)) return address.toLowerCase();
  return address.trim();
}

function isUsableTokenAddress(address: string): boolean {
  if (!address) return false;
  if (isZeroEvmAddress(address)) return false;
  return isEvmAddress(address) || isSolanaAddress(address);
}

function pickTokenSide(
  pair: DexPair,
  query: string,
): {
  address: string;
  name: string;
  symbol: string;
} {
  const q = query.trim().toLowerCase();
  const baseSym = pair.baseToken.symbol.toLowerCase();
  const quoteSym = pair.quoteToken.symbol.toLowerCase();

  if (q && baseSym === q && quoteSym !== q) return pair.baseToken;
  if (q && quoteSym === q && baseSym !== q) return pair.quoteToken;
  if (q && baseSym.includes(q) && !quoteSym.includes(q)) return pair.baseToken;
  if (q && quoteSym.includes(q) && !baseSym.includes(q)) return pair.quoteToken;
  return pair.baseToken;
}

function exactSymbolMatch(symbol: string, query: string): boolean {
  return symbol.trim().toLowerCase() === query.trim().toLowerCase();
}

/** Rank: exact symbol, then home-chain bonus, then liquidity. */
function hitRankScore(hit: TokenSearchHit, query: string): number {
  const q = query.trim().toUpperCase();
  const exact = exactSymbolMatch(hit.symbol, query) ? 1_000_000_000_000 : 0;
  const home = TICKER_HOME_CHAIN[q];
  const homeBonus = home && hit.chainId === home ? 500_000_000_000 : 0;
  // Soft-cap absurd liq so one fake pool can’t dominate ranking.
  const liq = Math.min(hit.liquidityUsd ?? 0, 250_000_000);
  return exact + homeBonus + liq;
}

/**
 * Search DexScreener by ticker / name. Dedupes to one hit per chain+address.
 * Known majors (ETH/SOL/BNB) pin to their wrapped canonical contract first.
 */
export async function searchTokens(
  query: string,
  chainFilter?: string,
): Promise<TokenSearchHit[]> {
  const q = query.trim();
  if (!q || q.length > 64) return [];

  const data = await fetchJson<DexSearchResponse>(
    `${DEXSCREENER_BASE}/search?q=${encodeURIComponent(q)}`,
  );

  const allowed = supportedDexIds();
  const filterDex = chainFilter
    ? getChain(resolveChainId(chainFilter))?.dexScreenerId
    : undefined;

  const bestByKey = new Map<string, TokenSearchHit>();

  for (const pair of data.pairs ?? []) {
    if (!pair?.chainId || !allowed.has(pair.chainId)) continue;
    if (filterDex && pair.chainId !== filterDex) continue;

    const chain = chainFromDex(pair.chainId);
    if (!chain) continue;

    const token = pickTokenSide(pair, q);
    if (!isUsableTokenAddress(token.address)) continue;

    const address = normalizeHitAddress(token.address);
    // Do not lowercase Solana — base58 is case-sensitive.
    const key = `${chain.id}:${address}`;
    const liquidityUsd = pair.liquidity?.usd;
    const existing = bestByKey.get(key);
    if (existing && (existing.liquidityUsd ?? 0) >= (liquidityUsd ?? 0)) {
      continue;
    }

    bestByKey.set(key, {
      chainId: chain.id,
      chainLabel: chain.label,
      address,
      name: token.name,
      symbol: token.symbol,
      liquidityUsd,
      volume24h: pair.volume?.h24,
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
    });
  }

  let results = [...bestByKey.values()].sort(
    (a, b) => hitRankScore(b, q) - hitRankScore(a, q),
  );

  const pinned = getCanonicalTicker(q);
  if (
    pinned &&
    (!filterDex || pinned.chainId === resolveChainId(chainFilter))
  ) {
    const pinnedHit: TokenSearchHit = {
      chainId: pinned.chainId,
      chainLabel: pinned.chainLabel,
      address: pinned.address,
      name: pinned.name,
      symbol: pinned.symbol,
    };
    results = [
      pinnedHit,
      ...results.filter(
        (r) =>
          !(
            r.chainId === pinned.chainId &&
            addressesEqual(r.address, pinned.address)
          ),
      ),
    ];
  }

  return results.slice(0, 8);
}

/**
 * Figure out which supported chain(s) an address trades on via DexScreener.
 * Highest-liquidity chain first.
 */
export async function resolveAddressChains(
  tokenAddress: string,
): Promise<TokenSearchHit[]> {
  const address = tokenAddress.trim();
  if (!isUsableTokenAddress(address)) return [];

  const data = await fetchJson<DexTokensResponse>(
    `${DEXSCREENER_BASE}/tokens/${encodeURIComponent(address)}`,
  );

  const allowed = supportedDexIds();
  const bestByChain = new Map<string, TokenSearchHit>();

  for (const pair of data.pairs ?? []) {
    if (!pair?.chainId || !allowed.has(pair.chainId)) continue;
    const chain = chainFromDex(pair.chainId);
    if (!chain) continue;

    const isBase = addressesEqual(pair.baseToken.address, address);
    const isQuote = addressesEqual(pair.quoteToken.address, address);
    if (!isBase && !isQuote) continue;

    const token = isBase ? pair.baseToken : pair.quoteToken;
    const liq = pair.liquidity?.usd ?? 0;
    const existing = bestByChain.get(chain.id);
    if (existing && (existing.liquidityUsd ?? 0) >= liq) continue;

    bestByChain.set(chain.id, {
      chainId: chain.id,
      chainLabel: chain.label,
      address: normalizeHitAddress(token.address),
      name: token.name,
      symbol: token.symbol,
      liquidityUsd: liq,
      volume24h: pair.volume?.h24,
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
    });
  }

  return [...bestByChain.values()].sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
  );
}

export function formatSearchHitLabel(hit: TokenSearchHit): string {
  const liq =
    hit.liquidityUsd !== undefined ? ` · liq ${formatUsd(hit.liquidityUsd)}` : "";
  return `${hit.symbol} · ${hit.chainLabel}${liq}`;
}

export function chainsForSelect(): ChainConfig[] {
  return SUPPORTED_CHAINS;
}
