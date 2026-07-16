/**
 * Well-known tickers → the contract users usually mean.
 * Native gas (ETH/BNB/SOL) isn’t a normal ERC-20 / mint in our pipeline —
 * we map to the liquid wrapped form DexScreener + explorers actually index.
 */
export const CANONICAL_TICKERS: Record<
  string,
  {
    chainId: string;
    chainLabel: string;
    address: string;
    symbol: string;
    name: string;
    note?: string;
  }
> = {
  ETH: {
    chainId: "eth",
    chainLabel: "Ethereum",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    note: "Native Ether isn’t an ERC-20 — analyzing Wrapped Ether (WETH) on Ethereum.",
  },
  WETH: {
    chainId: "eth",
    chainLabel: "Ethereum",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  SOL: {
    chainId: "sol",
    chainLabel: "Solana",
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Wrapped SOL",
    note: "Analyzing the wrapped SOL mint DexScreener uses for Solana.",
  },
  BNB: {
    chainId: "bsc",
    chainLabel: "BNB Chain",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    note: "Native BNB isn’t an ERC-20 — analyzing Wrapped BNB (WBNB) on BNB Chain.",
  },
  WBNB: {
    chainId: "bsc",
    chainLabel: "BNB Chain",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
  },
};

/** Preferred home chain when ranking same-symbol hits. */
export const TICKER_HOME_CHAIN: Record<string, string> = {
  ETH: "eth",
  WETH: "eth",
  SOL: "sol",
  BNB: "bsc",
  WBNB: "bsc",
  USDC: "eth",
  USDT: "eth",
  DAI: "eth",
  WBTC: "eth",
  SHIB: "eth",
  PEPE: "eth",
  FLOKI: "bsc",
  BONK: "sol",
  CASHCAT: "robinhood",
};

/**
 * Multi-chain majors DexScreener ticker-search often misses (e.g. Eth USDC).
 * Seeded into search so the picker can offer real Eth / Base / Sol CAs.
 */
export const MAJOR_TICKER_SEEDS: Record<
  string,
  Array<{ chainId: string; address: string; symbol: string; name: string }>
> = {
  USDC: [
    {
      chainId: "eth",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
    },
    {
      chainId: "base",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      name: "USD Coin",
    },
    {
      chainId: "sol",
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC",
      name: "USD Coin",
    },
  ],
  USDT: [
    {
      chainId: "eth",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      name: "Tether USD",
    },
    {
      chainId: "sol",
      address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      symbol: "USDT",
      name: "USDT",
    },
  ],
  DAI: [
    {
      chainId: "eth",
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      symbol: "DAI",
      name: "Dai Stablecoin",
    },
  ],
  WBTC: [
    {
      chainId: "eth",
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      name: "Wrapped BTC",
    },
  ],
};

export function getMajorTickerSeeds(ticker: string) {
  return MAJOR_TICKER_SEEDS[ticker.trim().toUpperCase()] ?? [];
}

export const ZERO_EVM_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export function isZeroEvmAddress(address: string): boolean {
  return address.trim().toLowerCase() === ZERO_EVM_ADDRESS;
}

export function getCanonicalTicker(ticker: string) {
  return CANONICAL_TICKERS[ticker.trim().toUpperCase()] ?? null;
}
