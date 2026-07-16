import { cacheKey, getOrFetchEvidence } from "../cache";
import {
  DEFAULT_CHAIN_ID,
  explorerDisplayName,
  getChain,
  resolveChainId,
} from "../chains";
import type { TokenEvidence } from "../types";
import { buildContractChecklist } from "./contractChecklist";
import {
  dexScreenerSourceUrl,
  getTokenMarketSnapshot,
} from "./dexscreener";
import {
  etherscanSourceUrl,
  getContractVerification,
  getErc20TokenIdentity,
  getTokenTotalSupply,
  type ContractVerification,
} from "./etherscan";
import {
  buildHolderAggregates,
  enrichTopHolders,
} from "./holderLabels";
import { detectLiquidityLock } from "./liquidityLocks";
import {
  getErc20TokenMetadata,
  getHoldersDistribution,
  moralisSourceUrl,
  type HoldersDistribution,
} from "./moralis";
import { getBlockscoutTokenBundle, blockscoutTokenUrl } from "./blockscout";
import { getSolanaTokenBundle, solscanSourceUrl } from "./solana";

function finalizeHolders(
  holders: HoldersDistribution,
  pairAddresses?: string[],
): TokenEvidence["holders"] {
  const topHolders = enrichTopHolders(holders.topHolders, pairAddresses);
  const distribution = buildHolderAggregates(
    topHolders,
    holders.top10Concentration,
  );
  return {
    totalHolders: holders.totalHolders,
    top10Concentration: holders.top10Concentration,
    top25Concentration: holders.top25Concentration,
    topHolders,
    distribution,
    available: holders.available,
    error: holders.error,
  };
}

function contractFieldsFromVerification(
  contract: ContractVerification & {
    explorerName?: string;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
  },
  chain: string,
): TokenEvidence["contract"] {
  const checklist = buildContractChecklist({
    verified: contract.verified,
    isProxy: contract.isProxy,
    implementation: contract.implementation,
    sourceCode: contract.sourceCode,
    abi: contract.abi,
    solidityClassName: contract.solidityClassName,
    mintAuthority: contract.mintAuthority,
    freezeAuthority: contract.freezeAuthority,
    chain,
  });

  return {
    verified: contract.verified,
    solidityClassName: contract.solidityClassName,
    isProxy: contract.isProxy,
    implementation: contract.implementation,
    sourceAvailable: contract.sourceAvailable,
    compilerVersion: contract.compilerVersion,
    explorerName: contract.explorerName,
    mintAuthority: contract.mintAuthority,
    freezeAuthority: contract.freezeAuthority,
    checklist,
    error: contract.error,
  };
}

async function fetchSolanaEvidence(
  tokenAddress: string,
): Promise<TokenEvidence> {
  const [bundle, market] = await Promise.all([
    getSolanaTokenBundle(tokenAddress),
    getTokenMarketSnapshot(tokenAddress, "sol"),
  ]);

  const tokenName = market.name ?? bundle.name;
  const tokenSymbol = market.symbol ?? bundle.symbol;
  const holders = finalizeHolders(bundle.holders, market.pairAddresses);

  const sources = [
    solscanSourceUrl(tokenAddress),
    dexScreenerSourceUrl(tokenAddress, "sol"),
    ...bundle.sources.filter((url) => url !== solscanSourceUrl(tokenAddress)),
  ];

  return {
    tokenAddress,
    chain: "sol",
    contract: contractFieldsFromVerification(
      {
        ...bundle.contract,
        mintAuthority: bundle.contract.mintAuthority,
        freezeAuthority: bundle.contract.freezeAuthority,
      },
      "sol",
    ),
    holders,
    market: {
      symbol: tokenSymbol,
      name: tokenName,
      priceUsd: market.priceUsd ?? bundle.priceUsd,
      liquidityUsd: market.liquidityUsd,
      volume24h: market.volume24h,
      fdv: market.fdv ?? bundle.fdv,
      marketCap: market.marketCap ?? bundle.marketCap,
      totalSupplyFormatted: bundle.totalSupplyFormatted,
      circulatingSupplyFormatted: bundle.circulatingSupplyFormatted,
      pairCount: market.pairCount,
      bestPairAddress: market.bestPairAddress,
      pairAddresses: market.pairAddresses,
      dexId: market.dexId,
      liquidityLock: {
        status: "unknown",
        summary:
          "Liquidity lock status unknown on Solana from current public sources.",
        evidence: "Solana lock oracles not wired in Phase A",
      },
      available:
        market.available ||
        Boolean(tokenName || tokenSymbol || bundle.totalSupplyFormatted),
      error: market.error,
    },
    sources: [...new Set(sources)],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchBlockscoutEvidence(
  tokenAddress: string,
  chain: string,
): Promise<TokenEvidence> {
  const chainConfig = getChain(resolveChainId(chain));
  const apiBase = chainConfig?.blockscoutApiBase;
  if (!apiBase) {
    throw new Error(`No Blockscout API configured for ${chain}`);
  }

  const explorerName = explorerDisplayName(chain);
  const [bundle, market] = await Promise.all([
    getBlockscoutTokenBundle(tokenAddress, apiBase, explorerName),
    getTokenMarketSnapshot(tokenAddress, chain),
  ]);

  const tokenName = market.name ?? bundle.name;
  const tokenSymbol = market.symbol ?? bundle.symbol;
  const holders = finalizeHolders(bundle.holders, market.pairAddresses);
  const liquidityLock = await detectLiquidityLock({
    tokenAddress,
    chain: resolveChainId(chain),
    pairAddress: market.bestPairAddress,
  });

  const sources = [
    blockscoutTokenUrl(apiBase, tokenAddress),
    dexScreenerSourceUrl(tokenAddress, chain),
  ];

  return {
    tokenAddress,
    chain: resolveChainId(chain),
    contract: contractFieldsFromVerification(
      { ...bundle.contract, explorerName },
      resolveChainId(chain),
    ),
    holders,
    market: {
      symbol: tokenSymbol,
      name: tokenName,
      priceUsd: market.priceUsd ?? bundle.priceUsd,
      liquidityUsd: market.liquidityUsd,
      volume24h: market.volume24h ?? bundle.volume24h,
      fdv: market.fdv,
      marketCap: market.marketCap ?? bundle.marketCap,
      totalSupplyFormatted: bundle.totalSupplyFormatted,
      pairCount: market.pairCount,
      bestPairAddress: market.bestPairAddress,
      pairAddresses: market.pairAddresses,
      dexId: market.dexId,
      liquidityLock,
      available:
        market.available ||
        Boolean(tokenName || tokenSymbol || bundle.totalSupplyFormatted),
      error: market.error,
    },
    sources,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchEvmEvidence(
  tokenAddress: string,
  chain: string,
): Promise<TokenEvidence> {
  const chainConfig = getChain(resolveChainId(chain));
  const moralisChain = chainConfig?.moralisChain;
  const etherscanChainId = chainConfig?.etherscanChainId;
  const explorerName = explorerDisplayName(chain);
  const resolvedChain = resolveChainId(chain);

  const holdersPromise: Promise<HoldersDistribution> = moralisChain
    ? getHoldersDistribution(tokenAddress, moralisChain)
    : Promise.resolve({
        topHolders: [],
        available: false,
        error: `Holder stats aren't wired for ${chainConfig?.label ?? chain} yet`,
      });

  const metadataPromise = moralisChain
    ? getErc20TokenMetadata(tokenAddress, moralisChain)
    : Promise.resolve({
        available: false,
        error: "No Moralis chain",
      } as Awaited<ReturnType<typeof getErc20TokenMetadata>>);

  const supplyPromise = etherscanChainId
    ? getTokenTotalSupply(tokenAddress, etherscanChainId)
    : Promise.resolve({
        available: false,
        error: "No explorer chain id",
      } as Awaited<ReturnType<typeof getTokenTotalSupply>>);

  const [holdersRaw, market, metadata, supply, liquidityLock] =
    await Promise.all([
      holdersPromise,
      getTokenMarketSnapshot(tokenAddress, chain),
      metadataPromise,
      supplyPromise,
      detectLiquidityLock({
        tokenAddress,
        chain: resolvedChain,
      }),
    ]);

  const contract = etherscanChainId
    ? await getContractVerification(tokenAddress, etherscanChainId)
    : {
        verified: false,
        isProxy: false,
        sourceAvailable: false,
        error: `Contract verification isn't available on ${explorerName} for this chain yet`,
      };

  const tokenIdentity =
    market.name && market.symbol
      ? { name: market.name, symbol: market.symbol, available: true as const }
      : metadata.available && (metadata.name || metadata.symbol)
        ? {
            name: metadata.name,
            symbol: metadata.symbol,
            available: true as const,
          }
        : etherscanChainId
          ? await getErc20TokenIdentity(tokenAddress, etherscanChainId)
          : {
              available: false as const,
              error: "No on-chain identity source for this chain",
            };

  const tokenName = market.name ?? tokenIdentity.name ?? metadata.name;
  const tokenSymbol = market.symbol ?? tokenIdentity.symbol ?? metadata.symbol;
  const holders = finalizeHolders(holdersRaw, market.pairAddresses);

  const sources = [
    etherscanSourceUrl(tokenAddress, chainConfig?.explorerTokenUrl),
    moralisChain ? moralisSourceUrl(tokenAddress, moralisChain) : null,
    dexScreenerSourceUrl(tokenAddress, chain),
  ].filter((url): url is string => Boolean(url));

  return {
    tokenAddress,
    chain: resolvedChain,
    contract: contractFieldsFromVerification(
      { ...contract, explorerName },
      resolvedChain,
    ),
    holders,
    market: {
      symbol: tokenSymbol,
      name: tokenName,
      priceUsd: market.priceUsd,
      liquidityUsd: market.liquidityUsd,
      volume24h: market.volume24h,
      fdv: market.fdv ?? metadata.fullyDilutedValuation,
      marketCap: market.marketCap,
      totalSupplyFormatted:
        supply.totalSupplyFormatted ?? metadata.totalSupplyFormatted,
      pairCount: market.pairCount,
      bestPairAddress: market.bestPairAddress,
      pairAddresses: market.pairAddresses,
      dexId: market.dexId,
      liquidityLock: {
        ...liquidityLock,
        // Attach pair context when we have it
        evidence: [
          liquidityLock.evidence,
          market.bestPairAddress
            ? `Best pair: ${market.bestPairAddress}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      available: market.available || Boolean(tokenName || tokenSymbol),
      error: market.error,
    },
    sources,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchEvidenceFresh(
  tokenAddress: string,
  chain: string,
): Promise<TokenEvidence> {
  const resolved = resolveChainId(chain);
  const chainConfig = getChain(resolved);

  if (chainConfig?.moralisSolana || resolved === "sol") {
    return fetchSolanaEvidence(tokenAddress);
  }

  if (chainConfig?.blockscoutApiBase) {
    return fetchBlockscoutEvidence(tokenAddress, resolved);
  }

  return fetchEvmEvidence(tokenAddress, resolved);
}

export async function gatherEvidence(
  tokenAddress: string,
  chain = DEFAULT_CHAIN_ID,
): Promise<TokenEvidence> {
  const resolved = resolveChainId(chain);
  const key = cacheKey(resolved, tokenAddress);
  return getOrFetchEvidence(key, () => fetchEvidenceFresh(tokenAddress, resolved));
}
