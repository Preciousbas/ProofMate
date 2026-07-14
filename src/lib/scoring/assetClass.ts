import { addressesEqual, isEvmAddress } from "../validation";
import type { TokenEvidence } from "../types";

/**
 * Infrastructure / cash-like majors — concentration from CEX/bridges is normal.
 * Only these may use the “deep market soften” path and sit in true low bands.
 */
const TRUSTED_MAJOR_BY_ADDRESS: Array<{ chainId: string; address: string }> = [
  // Stablecoins
  { chainId: "eth", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }, // USDC
  { chainId: "eth", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }, // USDT
  { chainId: "eth", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" }, // DAI
  { chainId: "base", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }, // USDC base
  // Wrapped majors
  { chainId: "eth", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }, // WETH
  { chainId: "eth", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" }, // WBTC
  { chainId: "bsc", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" }, // WBNB
  { chainId: "sol", address: "So11111111111111111111111111111111111111112" }, // wrapped SOL
  { chainId: "sol", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, // USDC sol
];

/** Known meme / community tokens — never labeled low caution. */
const MEMECOIN_BY_ADDRESS: Array<{ chainId: string; address: string }> = [
  { chainId: "eth", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE" }, // SHIB
  { chainId: "eth", address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }, // PEPE
  { chainId: "bsc", address: "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E" }, // FLOKI
  { chainId: "sol", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }, // BONK
  { chainId: "robinhood", address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4" }, // CASHCAT
];

const MEMECOIN_SYMBOLS = new Set([
  "SHIB",
  "PEPE",
  "FLOKI",
  "BONK",
  "DOGE",
  "WIF",
  "BRETT",
  "MOG",
  "NEIRO",
  "PNUT",
  "GOAT",
  "POPCAT",
  "MEW",
  "CASHCAT",
  "ELON",
  "AKITA",
  "KISHU",
  "SAMO",
  "MYRO",
  "GIGA",
  "CHILLGUY",
  "TRUMP",
  "MELANIA",
]);

const MEME_NAME_RE =
  /\b(inu|pepe|doge|shiba|floki|kitten|kitty|catcoin|dogecoin|meme|moon|elon|wojak|chad)\b/i;

export type AssetClass = "trusted_major" | "memecoin" | "standard";

function matchesAddressList(
  evidence: TokenEvidence,
  list: Array<{ chainId: string; address: string }>,
): boolean {
  return list.some(
    (entry) =>
      entry.chainId === evidence.chain &&
      addressesEqual(entry.address, evidence.tokenAddress),
  );
}

function looksLikeMemecoin(evidence: TokenEvidence): boolean {
  const symbol = (evidence.market.symbol ?? "").trim().toUpperCase();
  const name = evidence.market.name ?? "";

  if (symbol && MEMECOIN_SYMBOLS.has(symbol)) return true;
  if (MEME_NAME_RE.test(name) || MEME_NAME_RE.test(symbol)) return true;

  // Ultra-cheap unit price is a common meme tell (not perfect, but useful).
  const price = evidence.market.priceUsd;
  if (
    price !== undefined &&
    price > 0 &&
    price < 0.0001 &&
    !matchesAddressList(evidence, TRUSTED_MAJOR_BY_ADDRESS)
  ) {
    return true;
  }

  return false;
}

/**
 * Classify how strict the structural rubric should be.
 * - trusted_major: may soften CEX/bridge concentration; can finish “low”
 * - memecoin: never “low”; gets a speculative baseline
 * - standard: full flags; can be low if public data is clean
 */
export function classifyAsset(evidence: TokenEvidence): AssetClass {
  if (matchesAddressList(evidence, TRUSTED_MAJOR_BY_ADDRESS)) {
    return "trusted_major";
  }
  if (matchesAddressList(evidence, MEMECOIN_BY_ADDRESS)) {
    return "memecoin";
  }
  if (looksLikeMemecoin(evidence)) {
    return "memecoin";
  }
  // Solana mints that aren’t majors stay standard unless meme heuristics hit.
  if (!isEvmAddress(evidence.tokenAddress) && evidence.chain === "sol") {
    return "standard";
  }
  return "standard";
}
