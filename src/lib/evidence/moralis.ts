import { fetchJson } from "../http";
import type { TopHolder } from "../types";

interface MoralisHolderSummary {
  totalHolders?: number;
  holderDistribution?: {
    top10?: { supplyPercent?: number };
    top25?: { supplyPercent?: number };
    top50?: { supplyPercent?: number };
  };
}

interface MoralisOwner {
  owner_address: string;
  owner_address_label?: string;
  percentage_relative_to_total_supply?: number;
  is_contract?: boolean;
}

interface MoralisOwnersResponse {
  result?: MoralisOwner[];
  total_supply?: string;
}

export interface HoldersDistribution {
  totalHolders?: number;
  top10Concentration?: number;
  top25Concentration?: number;
  topHolders: TopHolder[];
  available: boolean;
  error?: string;
}

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

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

export async function getHoldersDistribution(
  tokenAddress: string,
  chain = "eth",
): Promise<HoldersDistribution> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    return {
      topHolders: [],
      available: false,
      error: "Moralis API key not configured",
    };
  }

  const headers = { "X-API-Key": apiKey };
  const [summaryResult, ownersResult] = await Promise.all([
    safeFetchJson<MoralisHolderSummary>(
      `${MORALIS_BASE}/erc20/${tokenAddress}/holders?chain=${chain}`,
      { headers },
    ),
    safeFetchJson<MoralisOwnersResponse>(
      `${MORALIS_BASE}/erc20/${tokenAddress}/owners?chain=${chain}&order=DESC&limit=10`,
      { headers },
    ),
  ]);

  const summary = summaryResult.data;
  const owners = ownersResult.data;

  const topHolders: TopHolder[] =
    owners?.result?.map((owner) => ({
      address: owner.owner_address,
      percentage: owner.percentage_relative_to_total_supply ?? 0,
      label: owner.owner_address_label,
      isContract: owner.is_contract,
    })) ?? [];

  const top10FromOwners = topHolders
    .slice(0, 10)
    .reduce((sum, holder) => sum + holder.percentage, 0);

  const totalHolders = summary?.totalHolders;
  const top10Concentration =
    summary?.holderDistribution?.top10?.supplyPercent ??
    (topHolders.length > 0 ? top10FromOwners : undefined);
  const top25Concentration = summary?.holderDistribution?.top25?.supplyPercent;

  const hasAny =
    totalHolders !== undefined ||
    top10Concentration !== undefined ||
    topHolders.length > 0;

  if (!hasAny) {
    return {
      topHolders: [],
      available: false,
      error:
        summaryResult.error ||
        ownersResult.error ||
        "Moralis returned no holder data",
    };
  }

  return {
    totalHolders,
    top10Concentration,
    top25Concentration,
    topHolders,
    available: true,
    error:
      summaryResult.error || ownersResult.error
        ? `Partial Moralis data (${[summaryResult.error, ownersResult.error].filter(Boolean).join("; ")})`
        : undefined,
  };
}

export function moralisSourceUrl(tokenAddress: string, chain = "eth"): string {
  const slug = chain === "eth" || chain === "ethereum" ? "ethereum" : chain;
  return `https://moralis.io/explorer/${slug}/${tokenAddress}`;
}

export interface Erc20TokenMetadata {
  name?: string;
  symbol?: string;
  totalSupplyFormatted?: string;
  fullyDilutedValuation?: number;
  available: boolean;
  error?: string;
}

/** Extra ERC-20 metadata (supply / FDV) via Moralis. */
export async function getErc20TokenMetadata(
  tokenAddress: string,
  chain = "eth",
): Promise<Erc20TokenMetadata> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    return { available: false, error: "Moralis API key not configured" };
  }

  const result = await safeFetchJson<
    Array<{
      name?: string;
      symbol?: string;
      total_supply_formatted?: string;
      fully_diluted_valuation?: string;
    }>
  >(
    `${MORALIS_BASE}/erc20/metadata?chain=${encodeURIComponent(chain)}&addresses%5B0%5D=${encodeURIComponent(tokenAddress)}`,
    { headers: { "X-API-Key": apiKey } },
  );

  const row = result.data?.[0];
  if (!row) {
    return {
      available: false,
      error: result.error ?? "Moralis returned no ERC-20 metadata",
    };
  }

  return {
    name: row.name,
    symbol: row.symbol,
    totalSupplyFormatted: row.total_supply_formatted,
    fullyDilutedValuation: row.fully_diluted_valuation
      ? Number(row.fully_diluted_valuation)
      : undefined,
    available: true,
  };
}
