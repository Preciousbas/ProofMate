import { fetchJson } from "../http";
import type { TopHolder } from "../types";
import type { ContractVerification } from "./etherscan";
import type { HoldersDistribution } from "./moralis";

interface BlockscoutToken {
  address_hash?: string;
  name?: string;
  symbol?: string;
  decimals?: string;
  total_supply?: string;
  holders_count?: string | number;
  exchange_rate?: string;
  circulating_market_cap?: string;
  volume_24h?: string;
  type?: string;
}

interface BlockscoutHolderItem {
  value?: string;
  address?: {
    hash?: string;
    name?: string | null;
    is_contract?: boolean;
    is_verified?: boolean;
  };
}

interface BlockscoutHoldersResponse {
  items?: BlockscoutHolderItem[];
}

interface BlockscoutAddress {
  is_verified?: boolean;
  is_contract?: boolean;
  name?: string | null;
  proxy_type?: string | null;
  implementations?: Array<{ address_hash?: string; address?: string }>;
}

interface BlockscoutSmartContract {
  is_verified?: boolean;
  name?: string;
  compiler_version?: string;
  source_code?: string;
  proxy_type?: string | null;
  implementations?: Array<{ address_hash?: string; address?: string }>;
}

export interface BlockscoutTokenBundle {
  contract: ContractVerification & {
    explorerName: string;
  };
  holders: HoldersDistribution;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupplyFormatted?: string;
  marketCap?: number;
  priceUsd?: number;
  volume24h?: number;
  sources: string[];
}

function apiKey(): string | undefined {
  return (
    process.env.ROBINHOOD_API_KEY?.trim() ||
    process.env.BLOCKSCOUT_API_KEY?.trim() ||
    undefined
  );
}

function withAuthUrl(url: string): string {
  const key = apiKey();
  if (!key) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("apikey", key);
  return parsed.toString();
}

function authHeaders(): HeadersInit {
  const key = apiKey();
  if (!key) return { Accept: "application/json" };
  return {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
  };
}

async function safeFetchJson<T>(
  url: string,
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await fetchJson<T>(withAuthUrl(url), {
      headers: authHeaders(),
    });
    return { data };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function formatSupply(raw?: string, decimals = 18): string | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  try {
    const asNum = Number(raw) / 10 ** decimals;
    if (!Number.isFinite(asNum)) return undefined;
    return asNum.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return undefined;
  }
}

/**
 * Robinhood (and other) Blockscout instance APIs.
 * Uses instance REST v2 + optional ROBINHOOD_API_KEY / BLOCKSCOUT_API_KEY.
 * @see https://robinhoodchain.blockscout.com/
 */
export async function getBlockscoutTokenBundle(
  tokenAddress: string,
  apiBase: string,
  explorerName = "Blockscout",
): Promise<BlockscoutTokenBundle> {
  const base = apiBase.replace(/\/$/, "");
  const address = tokenAddress;
  const tokenUrl = `${base}/token/${address}`;

  const [tokenRes, holdersRes, addressRes, contractRes] = await Promise.all([
    safeFetchJson<BlockscoutToken>(`${base}/api/v2/tokens/${address}`),
    safeFetchJson<BlockscoutHoldersResponse>(
      `${base}/api/v2/tokens/${address}/holders`,
    ),
    safeFetchJson<BlockscoutAddress>(`${base}/api/v2/addresses/${address}`),
    safeFetchJson<BlockscoutSmartContract>(
      `${base}/api/v2/smart-contracts/${address}`,
    ),
  ]);

  const token = tokenRes.data;
  const decimals = token?.decimals ? Number(token.decimals) : 18;
  const totalSupplyRaw = token?.total_supply;
  const holdersCount = token?.holders_count
    ? Number(token.holders_count)
    : undefined;

  const items = holdersRes.data?.items ?? [];
  const topHolders: TopHolder[] = items.slice(0, 10).map((item) => {
    const pct =
      totalSupplyRaw && item.value
        ? (Number(item.value) / Number(totalSupplyRaw)) * 100
        : 0;
    return {
      address: item.address?.hash ?? "",
      percentage: Number.isFinite(pct) ? pct : 0,
      label: item.address?.name ?? undefined,
      isContract: item.address?.is_contract,
    };
  });

  const top10Concentration =
    topHolders.length > 0
      ? topHolders.reduce((sum, h) => sum + h.percentage, 0)
      : undefined;

  const verified =
    Boolean(contractRes.data?.is_verified) ||
    Boolean(addressRes.data?.is_verified) ||
    Boolean(contractRes.data?.source_code);

  const impl =
    contractRes.data?.implementations?.[0]?.address_hash ||
    contractRes.data?.implementations?.[0]?.address ||
    addressRes.data?.implementations?.[0]?.address_hash ||
    addressRes.data?.implementations?.[0]?.address;

  const isProxy = Boolean(
    contractRes.data?.proxy_type || addressRes.data?.proxy_type || impl,
  );

  const holdersAvailable =
    holdersCount !== undefined || topHolders.length > 0;

  return {
    contract: {
      verified,
      solidityClassName: contractRes.data?.name,
      isProxy,
      implementation: impl,
      sourceAvailable: verified,
      compilerVersion: contractRes.data?.compiler_version,
      explorerName,
      error:
        !token && tokenRes.error
          ? tokenRes.error
          : !verified && !addressRes.data && addressRes.error
            ? addressRes.error
            : undefined,
    },
    holders: holdersAvailable
      ? {
          totalHolders: holdersCount,
          top10Concentration,
          topHolders,
          available: true,
          error: holdersRes.error,
        }
      : {
          topHolders: [],
          available: false,
          error:
            holdersRes.error ||
            "Blockscout returned no holder data for this token",
        },
    name: token?.name ?? addressRes.data?.name ?? undefined,
    symbol: token?.symbol,
    decimals,
    totalSupplyFormatted: formatSupply(totalSupplyRaw, decimals),
    marketCap: token?.circulating_market_cap
      ? Number(token.circulating_market_cap)
      : undefined,
    priceUsd: token?.exchange_rate ? Number(token.exchange_rate) : undefined,
    volume24h: token?.volume_24h ? Number(token.volume_24h) : undefined,
    sources: [tokenUrl],
  };
}

export function blockscoutTokenUrl(apiBase: string, address: string): string {
  return `${apiBase.replace(/\/$/, "")}/token/${address}`;
}
