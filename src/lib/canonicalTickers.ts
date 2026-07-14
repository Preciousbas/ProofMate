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
  SHIB: "eth",
  PEPE: "eth",
  FLOKI: "bsc",
  BONK: "sol",
  CASHCAT: "robinhood",
};

export const ZERO_EVM_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export function isZeroEvmAddress(address: string): boolean {
  return address.trim().toLowerCase() === ZERO_EVM_ADDRESS;
}

export function getCanonicalTicker(ticker: string) {
  return CANONICAL_TICKERS[ticker.trim().toUpperCase()] ?? null;
}
