import { fetchJson } from "../http";
import {
  getCanonicalTicker,
  getMajorTickerSeeds,
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
 * Relative liquidity floor vs the deepest hit. Dust / copycat pools below
 * this share of top liquidity are treated as noise for disambiguation.
 * Kept low so majors like USDC still surface on Eth + Sol + BSC together.
 */
const MATERIAL_LIQ_RATIO = 0.02;
/** Absolute floor so tiny zero-liq clones don’t crowd the picker. */
const MATERIAL_MIN_LIQ_USD = 25_000;
/** Cap choices so the picker stays scannable. */
const MAX_DISAMBIGUATION_HITS = 10;

/**
 * Narrow search hits to genuine choices the user needs to pick between.
 * - Prefer exact ticker matches when any exist
 * - Drop dust clones vs the deepest pool (and under a small absolute floor)
 * - Keep distinct chain+address hits (multiple CAs on Eth/Sol/BSC all show)
 * - Home-chain mapping only boosts *rank* — it does NOT auto-pick
 *
 * length === 1 → safe to auto-analyze; length > 1 → show a picker
 */
export function narrowSearchHitsForDisambiguation(
  hits: TokenSearchHit[],
  query: string,
): TokenSearchHit[] {
  if (hits.length <= 1) return hits;

  const exact = hits.filter((h) => exactSymbolMatch(h.symbol, query));
  const pool = exact.length > 0 ? exact : hits;

  const topLiq = Math.max(0, ...pool.map((h) => h.liquidityUsd ?? 0));
  const floor =
    topLiq > 0
      ? Math.max(MATERIAL_MIN_LIQ_USD, topLiq * MATERIAL_LIQ_RATIO)
      : 0;
  const material =
    topLiq > 0
      ? pool.filter((h) => (h.liquidityUsd ?? 0) >= floor)
      : pool;

  // Dedupe by chain+address only — do not collapse to one winner per chain.
  const byKey = new Map<string, TokenSearchHit>();
  for (const hit of material) {
    const key = `${hit.chainId}:${hit.address}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      hitRankScore(hit, query) > hitRankScore(existing, query)
    ) {
      byKey.set(key, hit);
    }
  }

  return [...byKey.values()]
    .sort((a, b) => hitRankScore(b, query) - hitRankScore(a, query))
    .slice(0, MAX_DISAMBIGUATION_HITS);
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

  // Force known multi-chain majors into results (DexScreener search often
  // omits Eth USDC etc. while returning Solana clones).
  const seeds = getMajorTickerSeeds(q);
  if (seeds.length > 0) {
    const filterChainId = chainFilter
      ? resolveChainId(chainFilter)
      : undefined;
    const seeded = await Promise.all(
      seeds.map(async (seed) => {
        if (filterChainId && seed.chainId !== filterChainId) return null;
        const chain = getChain(seed.chainId);
        if (!chain) return null;
        const address = normalizeHitAddress(seed.address);
        const existing = results.find(
          (r) =>
            r.chainId === seed.chainId && addressesEqual(r.address, address),
        );
        if (existing) return existing;

        let liquidityUsd: number | undefined;
        let volume24h: number | undefined;
        let priceUsd: number | undefined;
        try {
          const fromDex = await resolveAddressChains(seed.address);
          const match =
            fromDex.find((h) => h.chainId === seed.chainId) ?? fromDex[0];
          liquidityUsd = match?.liquidityUsd;
          volume24h = match?.volume24h;
          priceUsd = match?.priceUsd;
        } catch {
          // Seed anyway — picker still needs the CA even without liq.
        }

        return {
          chainId: seed.chainId,
          chainLabel: chain.label,
          address,
          name: seed.name,
          symbol: seed.symbol,
          liquidityUsd,
          volume24h,
          priceUsd,
        } satisfies TokenSearchHit;
      }),
    );

    const byKey = new Map<string, TokenSearchHit>();
    for (const hit of [...seeded.filter(Boolean), ...results] as TokenSearchHit[]) {
      const key = `${hit.chainId}:${hit.address}`;
      const prev = byKey.get(key);
      if (!prev || hitRankScore(hit, q) > hitRankScore(prev, q)) {
        byKey.set(key, hit);
      }
    }
    results = [...byKey.values()].sort(
      (a, b) => hitRankScore(b, q) - hitRankScore(a, q),
    );
  }

  // Always keep seeded majors; fill remaining slots from search.
  const seedKeys = new Set(
    seeds.map(
      (s) => `${s.chainId}:${normalizeHitAddress(s.address)}`,
    ),
  );
  const mustKeep = results.filter((r) =>
    seedKeys.has(`${r.chainId}:${r.address}`),
  );
  const rest = results.filter(
    (r) => !seedKeys.has(`${r.chainId}:${r.address}`),
  );
  return [...mustKeep, ...rest].slice(0, Math.max(12, mustKeep.length + 4));
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
