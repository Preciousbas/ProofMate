export const PRODUCT_NAME = "ProofMate";
export const PRODUCT_TAGLINE =
  "Checks public token data and flags what looks off. Not trading advice.";

export const DISCLAIMER =
  "ProofMate reads public chain and market data. It’s not financial advice, not an audit, and it won’t call a token safe or a scam. Dig deeper yourself before you act.";

/** Bottom-of-page “What ProofMate does” — numbered, plain language. */
export const WHAT_PROOFMATE_DOES = [
  "Pulls contract, holder, and market data from public APIs when those sources cover the chain.",
  "Gives you a memo with a score out of 100 and red flags you can expand.",
  "Answers follow-ups from that same evidence. It won’t invent numbers.",
  "Built for research. Not for placing trades.",
  "Won’t stamp anything “safe” or “scam.” Treat every result as a starting point.",
] as const;

export { DEFAULT_CHAIN_ID as DEFAULT_CHAIN, chainDisplayName } from "./chains";
export { SUPPORTED_CHAINS } from "./chains";

export const CHAIN_LABELS: Record<string, string> = {
  eth: "Ethereum",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon: "Polygon",
  bsc: "BNB Chain",
  avalanche: "Avalanche",
  robinhood: "Robinhood",
  blast: "Blast",
  linea: "Linea",
  scroll: "Scroll",
  berachain: "Berachain",
  abstract: "Abstract",
  worldchain: "World Chain",
  soneium: "Soneium",
  sol: "Solana",
  solana: "Solana",
};

export const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
/** Solana mint / token account style base58 (case-sensitive). */
export const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const RISK_LABELS = {
  low: "Low visible risk",
  moderate: "Some caution",
  high: "High caution",
} as const;

export const DEMO_TOKENS = [
  {
    label: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: "eth",
  },
  {
    label: "SHIB",
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    chainId: "eth",
  },
  {
    label: "CASHCAT",
    address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
    chainId: "robinhood",
  },
  {
    label: "FLOKI",
    address: "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E",
    chainId: "bsc",
  },
  {
    label: "BONK",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    chainId: "sol",
  },
] as const;

export const CURATED_FOLLOW_UPS = [
  "Why is the risk score this high?",
  "Who holds most of the supply?",
  "Any liquidity issues?",
  "Is the contract verified?",
] as const;

export const API_TIMEOUT_MS = 12_000;
export const CACHE_TTL_MS = 5 * 60 * 1000;
/** CDN / shared-cache TTL for identical token analyzes (seconds). */
export const ANALYZE_CDN_S_MAXAGE = 300;
export const ANALYZE_CDN_SWR = 600;

/** Soft caps — backed by Upstash when configured, else per-isolate memory. */
export const RATE_LIMIT_ANALYZE_PER_MIN = 60;
export const RATE_LIMIT_FOLLOW_UP_PER_MIN = 120;
/** Shared across all callers (protects Moralis / Etherscan / Groq spend). */
export const RATE_LIMIT_ANALYZE_GLOBAL_PER_MIN = 400;
export const RATE_LIMIT_SEARCH_GLOBAL_PER_MIN = 400;
export const RATE_LIMIT_FOLLOW_UP_GLOBAL_PER_MIN = 800;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Max concurrent outbound upstream calls per instance. */
export const UPSTREAM_MAX_CONCURRENCY = 24;
export const UPSTREAM_MAX_RETRIES = 2;

/** Reject oversized follow-up payloads early (evidence + memo JSON). */
export const MAX_JSON_BODY_BYTES = 512_000;

export const GROQ_API_BASE = "https://api.groq.com/openai/v1";
export const GROQ_MEMO_MODEL = "llama-3.3-70b-versatile";

export const SCORING_THRESHOLDS = {
  holderCountLow: 500,
  top10High: 50,
  top10Moderate: 30,
  top25High: 70,
  liquidityVeryLow: 10_000,
  liquidityLow: 50_000,
  /** Verified + this deep → treat concentration as informational, not high caution. */
  bluechipMinLiquidity: 1_000_000,
  /** Only apply liquidity/FDV ratio flags below this FDV (skip bluechips). */
  fdvLiquidityCheckMax: 500_000_000,
  volumeToLiquidityLow: 0.05,
  volumeToLiquidityActivity: 0.02,
  /**
   * Only flag weak 24h volume/liquidity when the market already looks thin
   * (avoids quiet-weekend false positives on deep major pools).
   */
  activityFlagMaxLiquidity: 50_000,
  /** Points toward 0–100 risk score — one high flag alone is high caution. */
  pointsHigh: 60,
  pointsMedium: 30,
  pointsLow: 8,
  /** Label bands on the 0–100 score — one medium flag alone is moderate. */
  scoreModerateMin: 30,
  scoreHighMin: 60,
} as const;
