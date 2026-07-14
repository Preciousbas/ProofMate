export interface ChainConfig {
  /** Internal id used in ProofMate URLs/state */
  id: string;
  label: string;
  /** DexScreener chainId string */
  dexScreenerId: string;
  /** Public explorer brand name (Etherscan, BscScan, Solscan, Blockscout, …) */
  explorerName: string;
  /** Moralis EVM chain slug, if supported */
  moralisChain?: string;
  /** Use Moralis Solana gateway for this chain */
  moralisSolana?: boolean;
  /** Etherscan API v2 chainid, if supported */
  etherscanChainId?: string;
  /** Blockscout instance API origin (e.g. https://robinhoodchain.blockscout.com) */
  blockscoutApiBase?: string;
  /** Block explorer token URL template — use {address} */
  explorerTokenUrl?: string;
}

/**
 * Chains we can analyze. Market data always comes from DexScreener.
 * Holders/contract depend on Moralis / Etherscan coverage.
 */
export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: "eth",
    label: "Ethereum",
    dexScreenerId: "ethereum",
    explorerName: "Etherscan",
    moralisChain: "eth",
    etherscanChainId: "1",
    explorerTokenUrl: "https://etherscan.io/token/{address}",
  },
  {
    id: "base",
    label: "Base",
    dexScreenerId: "base",
    explorerName: "BaseScan",
    moralisChain: "base",
    etherscanChainId: "8453",
    explorerTokenUrl: "https://basescan.org/token/{address}",
  },
  {
    id: "arbitrum",
    label: "Arbitrum",
    dexScreenerId: "arbitrum",
    explorerName: "Arbiscan",
    moralisChain: "arbitrum",
    etherscanChainId: "42161",
    explorerTokenUrl: "https://arbiscan.io/token/{address}",
  },
  {
    id: "optimism",
    label: "Optimism",
    dexScreenerId: "optimism",
    explorerName: "Optimistic Etherscan",
    moralisChain: "optimism",
    etherscanChainId: "10",
    explorerTokenUrl: "https://optimistic.etherscan.io/token/{address}",
  },
  {
    id: "polygon",
    label: "Polygon",
    dexScreenerId: "polygon",
    explorerName: "PolygonScan",
    moralisChain: "polygon",
    etherscanChainId: "137",
    explorerTokenUrl: "https://polygonscan.com/token/{address}",
  },
  {
    id: "bsc",
    label: "BNB Chain",
    dexScreenerId: "bsc",
    explorerName: "BscScan",
    moralisChain: "bsc",
    etherscanChainId: "56",
    explorerTokenUrl: "https://bscscan.com/token/{address}",
  },
  {
    id: "avalanche",
    label: "Avalanche",
    dexScreenerId: "avalanche",
    explorerName: "SnowTrace",
    moralisChain: "avalanche",
    etherscanChainId: "43114",
    explorerTokenUrl: "https://snowtrace.io/token/{address}",
  },
  {
    id: "robinhood",
    label: "Robinhood",
    dexScreenerId: "robinhood",
    explorerName: "Blockscout",
    blockscoutApiBase: "https://robinhoodchain.blockscout.com",
    explorerTokenUrl: "https://robinhoodchain.blockscout.com/token/{address}",
  },
  {
    id: "blast",
    label: "Blast",
    dexScreenerId: "blast",
    explorerName: "Blastscan",
    moralisChain: "blast",
    etherscanChainId: "81457",
    explorerTokenUrl: "https://blastscan.io/token/{address}",
  },
  {
    id: "linea",
    label: "Linea",
    dexScreenerId: "linea",
    explorerName: "Lineascan",
    moralisChain: "linea",
    etherscanChainId: "59144",
    explorerTokenUrl: "https://lineascan.build/token/{address}",
  },
  {
    id: "scroll",
    label: "Scroll",
    dexScreenerId: "scroll",
    explorerName: "Scrollscan",
    moralisChain: "scroll",
    etherscanChainId: "534352",
    explorerTokenUrl: "https://scrollscan.com/token/{address}",
  },
  {
    id: "berachain",
    label: "Berachain",
    dexScreenerId: "berachain",
    explorerName: "Berascan",
    etherscanChainId: "80094",
    explorerTokenUrl: "https://berascan.com/token/{address}",
  },
  {
    id: "abstract",
    label: "Abstract",
    dexScreenerId: "abstract",
    explorerName: "Abscan",
    etherscanChainId: "2741",
    explorerTokenUrl: "https://abscan.org/token/{address}",
  },
  {
    id: "worldchain",
    label: "World Chain",
    dexScreenerId: "worldchain",
    explorerName: "Worldscan",
    etherscanChainId: "480",
    explorerTokenUrl: "https://worldscan.org/token/{address}",
  },
  {
    id: "soneium",
    label: "Soneium",
    dexScreenerId: "soneium",
    explorerName: "Soneium Explorer",
    etherscanChainId: "1868",
    explorerTokenUrl: "https://soneium.blockscout.com/token/{address}",
  },
  {
    id: "sol",
    label: "Solana",
    dexScreenerId: "solana",
    explorerName: "Solscan",
    moralisSolana: true,
    explorerTokenUrl: "https://solscan.io/token/{address}",
  },
];

export const DEFAULT_CHAIN_ID = "eth";

const byId = new Map(SUPPORTED_CHAINS.map((chain) => [chain.id, chain]));
const byDex = new Map(
  SUPPORTED_CHAINS.map((chain) => [chain.dexScreenerId, chain]),
);

export function getChain(id: string): ChainConfig | undefined {
  return byId.get(id);
}

export class UnknownChainError extends Error {
  readonly input: string;

  constructor(input: string) {
    super(
      `Unsupported chain: "${input}". Use a supported id (eth, base, bsc, sol, …) or omit chain to auto-detect.`,
    );
    this.name = "UnknownChainError";
    this.input = input;
  }
}

/**
 * Map a chain hint to an internal id.
 * - Missing / blank → DEFAULT_CHAIN_ID (caller is using analyze default path).
 * - Known id or DexScreener slug (e.g. ethereum → eth) → resolved id.
 * - Anything else → throws UnknownChainError (never silent eth fallback).
 */
export function resolveChainId(input?: string | null): string {
  if (input == null || !String(input).trim()) return DEFAULT_CHAIN_ID;
  const lower = String(input).trim().toLowerCase();
  if (byId.has(lower)) return lower;
  const fromDex = byDex.get(lower);
  if (fromDex) return fromDex.id;
  throw new UnknownChainError(input.trim());
}

export function chainDisplayName(chainId: string): string {
  return getChain(chainId)?.label ?? chainId;
}

export function explorerDisplayName(chainId: string): string {
  return getChain(chainId)?.explorerName ?? "block explorer";
}

export function explorerUrl(chainId: string, address: string): string | undefined {
  const template = getChain(chainId)?.explorerTokenUrl;
  return template?.replace("{address}", address);
}
