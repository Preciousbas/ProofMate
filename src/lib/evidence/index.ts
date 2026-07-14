import { cacheKey, getOrFetchEvidence } from "../cache";
import {
  DEFAULT_CHAIN_ID,
  explorerDisplayName,
  getChain,
  resolveChainId,
} from "../chains";
import type { TokenEvidence } from "../types";
import {
  dexScreenerSourceUrl,
  getTokenMarketSnapshot,
} from "./dexscreener";
import {
  etherscanSourceUrl,
  getContractVerification,
  getErc20TokenIdentity,
  getTokenTotalSupply,
} from "./etherscan";
import {
  getErc20TokenMetadata,
  getHoldersDistribution,
  moralisSourceUrl,
  type HoldersDistribution,
} from "./moralis";
import { getBlockscoutTokenBundle, blockscoutTokenUrl } from "./blockscout";
import { getSolanaTokenBundle, solscanSourceUrl } from "./solana";

async function fetchSolanaEvidence(
  tokenAddress: string,
): Promise<TokenEvidence> {
  const [bundle, market] = await Promise.all([
    getSolanaTokenBundle(tokenAddress),
    getTokenMarketSnapshot(tokenAddress, "sol"),
  ]);

  const tokenName = market.name ?? bundle.name;
  const tokenSymbol = market.symbol ?? bundle.symbol;

  const sources = [
    solscanSourceUrl(tokenAddress),
    dexScreenerSourceUrl(tokenAddress, "sol"),
    ...bundle.sources.filter((url) => url !== solscanSourceUrl(tokenAddress)),
  ];

  return {
    tokenAddress,
    chain: "sol",
    contract: {
      verified: bundle.contract.verified,
      isProxy: false,
      sourceAvailable: bundle.contract.sourceAvailable,
      explorerName: "Solscan",
      mintAuthority: bundle.contract.mintAuthority,
      freezeAuthority: bundle.contract.freezeAuthority,
      error: bundle.contract.error,
    },
    holders: bundle.holders,
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
      dexId: market.dexId,
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

  const sources = [
    blockscoutTokenUrl(apiBase, tokenAddress),
    dexScreenerSourceUrl(tokenAddress, chain),
  ];

  return {
    tokenAddress,
    chain: resolveChainId(chain),
    contract: {
      verified: bundle.contract.verified,
      solidityClassName: bundle.contract.solidityClassName,
      isProxy: bundle.contract.isProxy,
      implementation: bundle.contract.implementation,
      sourceAvailable: bundle.contract.sourceAvailable,
      compilerVersion: bundle.contract.compilerVersion,
      explorerName,
      error: bundle.contract.error,
    },
    holders: bundle.holders,
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
      dexId: market.dexId,
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

  const [holders, market, metadata, supply] = await Promise.all([
    holdersPromise,
    getTokenMarketSnapshot(tokenAddress, chain),
    metadataPromise,
    supplyPromise,
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

  const sources = [
    etherscanSourceUrl(tokenAddress, chainConfig?.explorerTokenUrl),
    moralisChain ? moralisSourceUrl(tokenAddress, moralisChain) : null,
    dexScreenerSourceUrl(tokenAddress, chain),
  ].filter((url): url is string => Boolean(url));

  return {
    tokenAddress,
    chain: resolveChainId(chain),
    contract: {
      ...contract,
      explorerName,
    },
    holders: {
      totalHolders: holders.totalHolders,
      top10Concentration: holders.top10Concentration,
      top25Concentration: holders.top25Concentration,
      topHolders: holders.topHolders,
      available: holders.available,
      error: holders.error,
    },
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
      dexId: market.dexId,
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
