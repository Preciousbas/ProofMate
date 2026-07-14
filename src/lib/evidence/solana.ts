import { fetchJson } from "../http";
import type { TopHolder } from "../types";
import type { ContractVerification } from "./etherscan";
import type { HoldersDistribution } from "./moralis";

const SOLANA_RPC =
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const SOLSCAN_PRO_BASE = "https://pro-api.solscan.io/v2.0";
const MORALIS_SOL_BASE = "https://solana-gateway.moralis.io";

/** Official wrapped SOL mint — Solscan treats this as the liquid SOL wrapper. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

interface SolscanMetaResponse {
  success?: boolean;
  data?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    holder?: number;
    supply?: string | number;
    price?: number;
    market_cap?: number;
    volume_24h?: number;
    mint_authority?: string | null;
    freeze_authority?: string | null;
    /** Present on some Solscan payloads for curated/verified listings */
    verified?: boolean;
    create_tx?: string;
  };
}

interface SolscanHoldersResponse {
  success?: boolean;
  data?: {
    total?: number;
    items?: Array<{
      owner?: string;
      amount?: string | number;
      percentage?: number;
      rank?: number;
    }>;
  };
}

interface MoralisSolMetadata {
  name?: string;
  symbol?: string;
  decimals?: string | number;
  totalSupplyFormatted?: string;
  circulatingSupply?: string;
  marketCap?: string;
  fullyDilutedValue?: string;
  score?: number;
  links?: Record<string, string>;
  metaplex?: {
    updateAuthority?: string;
  };
}

interface MoralisSolTopHolder {
  ownerAddress?: string;
  percentageRelativeToTotalSupply?: number;
  isContract?: boolean;
  balanceFormatted?: string;
}

interface MoralisSolTopHoldersResponse {
  totalSupply?: string;
  result?: MoralisSolTopHolder[];
}

interface RpcAccountInfo {
  result?: {
    value?: {
      data?: {
        parsed?: {
          info?: {
            decimals?: number;
            supply?: string;
            mintAuthority?: string | null;
            freezeAuthority?: string | null;
            isInitialized?: boolean;
          };
          type?: string;
        };
      };
    };
  };
}

export interface SolanaTokenBundle {
  contract: ContractVerification & {
    explorerName: string;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
  };
  holders: HoldersDistribution;
  name?: string;
  symbol?: string;
  totalSupplyFormatted?: string;
  circulatingSupplyFormatted?: string;
  marketCap?: number;
  fdv?: number;
  priceUsd?: number;
  sources: string[];
}

async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await fetchJson<T>(url, init);
    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

async function rpcGetMint(mint: string): Promise<{
  mintAuthority: string | null;
  freezeAuthority: string | null;
  decimals?: number;
  supply?: string;
  error?: string;
}> {
  try {
    const data = await fetchJson<RpcAccountInfo>(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [mint, { encoding: "jsonParsed" }],
      }),
    });
    const info = data.result?.value?.data?.parsed?.info;
    if (!info) {
      return {
        mintAuthority: null,
        freezeAuthority: null,
        error: "Mint account not found on Solana RPC",
      };
    }
    return {
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
      decimals: info.decimals,
      supply: info.supply,
    };
  } catch (error) {
    return {
      mintAuthority: null,
      freezeAuthority: null,
      error: error instanceof Error ? error.message : "Solana RPC failed",
    };
  }
}

async function solscanMeta(mint: string, apiKey: string) {
  return safeFetchJson<SolscanMetaResponse>(
    `${SOLSCAN_PRO_BASE}/token/meta?address=${encodeURIComponent(mint)}`,
    { headers: { token: apiKey, Accept: "application/json" } },
  );
}

async function solscanHolders(mint: string, apiKey: string) {
  return safeFetchJson<SolscanHoldersResponse>(
    `${SOLSCAN_PRO_BASE}/token/holders?address=${encodeURIComponent(mint)}&page=1&page_size=10`,
    { headers: { token: apiKey, Accept: "application/json" } },
  );
}

async function moralisSolMeta(mint: string, apiKey: string) {
  return safeFetchJson<MoralisSolMetadata>(
    `${MORALIS_SOL_BASE}/token/mainnet/${mint}/metadata`,
    { headers: { "X-API-Key": apiKey } },
  );
}

async function moralisSolTopHolders(mint: string, apiKey: string) {
  return safeFetchJson<MoralisSolTopHoldersResponse>(
    `${MORALIS_SOL_BASE}/token/mainnet/${mint}/top-holders?limit=10`,
    { headers: { "X-API-Key": apiKey } },
  );
}

function formatRawSupply(raw?: string, decimals?: number): string | undefined {
  if (!raw || decimals === undefined) return undefined;
  try {
    const asNum = Number(raw) / 10 ** decimals;
    if (!Number.isFinite(asNum)) return undefined;
    return asNum.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return undefined;
  }
}

/**
 * Solana evidence: Solscan Pro when keyed, else Moralis Solana + RPC mint checks.
 * Explorer links and labels always point at Solscan.
 */
export async function getSolanaTokenBundle(
  mint: string,
): Promise<SolanaTokenBundle> {
  const solscanKey = process.env.SOLSCAN_API_KEY;
  const moralisKey = process.env.MORALIS_API_KEY;
  const sources = [`https://solscan.io/token/${mint}`];

  const mintInfo = await rpcGetMint(mint);

  let name: string | undefined;
  let symbol: string | undefined;
  let totalSupplyFormatted: string | undefined;
  let circulatingSupplyFormatted: string | undefined;
  let marketCap: number | undefined;
  let fdv: number | undefined;
  let priceUsd: number | undefined;
  let solscanVerified: boolean | undefined;
  let holderTotal: number | undefined;
  let topHolders: TopHolder[] = [];
  let top10: number | undefined;
  let dataErrors: string[] = [];

  if (solscanKey) {
    const [metaRes, holdersRes] = await Promise.all([
      solscanMeta(mint, solscanKey),
      solscanHolders(mint, solscanKey),
    ]);
    const meta = metaRes.data?.data;
    if (meta) {
      name = meta.name ?? name;
      symbol = meta.symbol ?? symbol;
      solscanVerified = meta.verified;
      if (meta.holder !== undefined) holderTotal = meta.holder;
      if (meta.supply !== undefined) {
        totalSupplyFormatted = String(meta.supply);
      }
      if (meta.market_cap !== undefined) marketCap = Number(meta.market_cap);
      if (meta.price !== undefined) priceUsd = Number(meta.price);
      if (meta.mint_authority !== undefined) {
        mintInfo.mintAuthority = meta.mint_authority;
      }
      if (meta.freeze_authority !== undefined) {
        mintInfo.freezeAuthority = meta.freeze_authority;
      }
    } else if (metaRes.error) {
      dataErrors.push(`Solscan meta: ${metaRes.error}`);
    }

    const items = holdersRes.data?.data?.items ?? [];
    if (holdersRes.data?.data?.total !== undefined) {
      holderTotal = holdersRes.data.data.total;
    }
    if (items.length > 0) {
      topHolders = items.map((item) => ({
        address: item.owner ?? "",
        percentage: item.percentage ?? 0,
      }));
      top10 = topHolders
        .slice(0, 10)
        .reduce((sum, h) => sum + h.percentage, 0);
    } else if (holdersRes.error) {
      dataErrors.push(`Solscan holders: ${holdersRes.error}`);
    }
  }

  if (moralisKey) {
    const [metaRes, holdersRes] = await Promise.all([
      moralisSolMeta(mint, moralisKey),
      moralisSolTopHolders(mint, moralisKey),
    ]);
    const meta = metaRes.data;
    if (meta) {
      name = name ?? meta.name;
      symbol = symbol ?? meta.symbol;
      totalSupplyFormatted =
        totalSupplyFormatted ?? meta.totalSupplyFormatted;
      circulatingSupplyFormatted =
        circulatingSupplyFormatted ?? meta.circulatingSupply;
      if (meta.marketCap && marketCap === undefined) {
        marketCap = Number(meta.marketCap);
      }
      if (meta.fullyDilutedValue && fdv === undefined) {
        fdv = Number(meta.fullyDilutedValue);
      }
    } else if (metaRes.error) {
      dataErrors.push(`Moralis Sol: ${metaRes.error}`);
    }

    if (topHolders.length === 0 && holdersRes.data?.result?.length) {
      topHolders = holdersRes.data.result.map((row) => ({
        address: row.ownerAddress ?? "",
        percentage: row.percentageRelativeToTotalSupply ?? 0,
        isContract: row.isContract,
      }));
      top10 = topHolders
        .slice(0, 10)
        .reduce((sum, h) => sum + h.percentage, 0);
    } else if (holdersRes.error && topHolders.length === 0) {
      dataErrors.push(`Moralis Sol holders: ${holdersRes.error}`);
    }
  }

  if (!totalSupplyFormatted) {
    totalSupplyFormatted = formatRawSupply(
      mintInfo.supply,
      mintInfo.decimals,
    );
  }

  const mintRevoked = mintInfo.mintAuthority === null;
  const freezeRevoked = mintInfo.freezeAuthority === null;
  const isWsol = mint === WSOL_MINT;

  // Solscan “verified” when API says so; else treat official WSOL / fully
  // revoked mint+freeze as program-verified for our scoring purposes.
  const verified =
    solscanVerified === true ||
    isWsol ||
    (mintRevoked && freezeRevoked && Boolean(name || symbol));

  const holdersAvailable =
    holderTotal !== undefined || topHolders.length > 0 || top10 !== undefined;

  return {
    contract: {
      verified,
      isProxy: false,
      sourceAvailable: verified,
      explorerName: "Solscan",
      mintAuthority: mintInfo.mintAuthority,
      freezeAuthority: mintInfo.freezeAuthority,
      error:
        !verified && dataErrors.length
          ? dataErrors.join("; ")
          : mintInfo.error && !verified
            ? mintInfo.error
            : undefined,
    },
    holders: holdersAvailable
      ? {
          totalHolders: holderTotal,
          top10Concentration: top10,
          topHolders,
          available: true,
          error: dataErrors.length ? dataErrors.join("; ") : undefined,
        }
      : {
          topHolders: [],
          available: false,
          error:
            dataErrors.join("; ") ||
            "No Solana holder feed available (add SOLSCAN_API_KEY for Solscan Pro)",
        },
    name,
    symbol,
    totalSupplyFormatted,
    circulatingSupplyFormatted,
    marketCap,
    fdv,
    priceUsd,
    sources,
  };
}

export function solscanSourceUrl(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}
