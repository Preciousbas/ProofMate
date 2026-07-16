export type RiskLevel = "low" | "moderate" | "high";

export type RedFlagCategory = "contract" | "holders" | "liquidity";

export type RedFlagSeverity = "low" | "medium" | "high";

export interface RedFlag {
  category: RedFlagCategory;
  severity: RedFlagSeverity;
  title: string;
  description: string;
  evidence: string;
}

export interface TrustMemo {
  tokenAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  riskLevel: RiskLevel;
  riskLabel: string;
  /** Deterministic 0–100 risk score */
  riskScore: number;
  summary: string;
  keyFacts: string[];
  redFlags: RedFlag[];
  recommendation: string;
  disclaimer: string;
  sources: string[];
  facts: string[];
  inferences: string[];
  generatedAt: string;
}

/** Structured holder classification for concentration context. */
export type HolderLabelType =
  | "burn"
  | "exchange"
  | "lp"
  | "contract"
  | "team"
  | "unknown";

export interface TopHolder {
  address: string;
  percentage: number;
  /** Human label from explorer/API or a derived display name */
  label?: string;
  /** Structured type used for scoring + narrative */
  labelType?: HolderLabelType;
  /** Short risk framing (“burn address — not a sellable whale”) */
  labelNote?: string;
  isContract?: boolean;
}

/** Supply share among labeled top holders (typically top 10). */
export interface HolderDistributionAggregates {
  burnedPct: number;
  exchangePct: number;
  lpPct: number;
  contractPct: number;
  teamPct: number;
  unknownPct: number;
  /**
   * Top-10 concentration minus burn + exchange + LP share among those wallets.
   * Lower = less “true whale” risk from the labeled slice.
   */
  effectiveWhalePct?: number;
  /** burn + exchange + LP share inside the top-10 slice */
  labeledNonWhalePct: number;
}

export type ChecklistValue = "yes" | "no" | "unknown";

export interface ContractChecklistItem {
  id: string;
  label: string;
  value: ChecklistValue;
  detail?: string;
}

export type LiquidityLockStatus =
  | "locked"
  | "partial"
  | "unlocked"
  | "unknown";

export interface LiquidityLockInfo {
  status: LiquidityLockStatus;
  /** Plain-language summary; always present — may say unknown */
  summary: string;
  provider?: string;
  lockedPct?: number;
  unlockAt?: string;
  source?: string;
  evidence?: string;
}

export interface TokenEvidence {
  tokenAddress: string;
  chain: string;
  contract: {
    verified: boolean;
    /** Solidity class from verified source (e.g. TokenMintERC20Token) — not the token ticker */
    solidityClassName?: string;
    isProxy: boolean;
    implementation?: string;
    sourceAvailable: boolean;
    compilerVersion?: string;
    /** Which explorer backed the verification check (Etherscan, BscScan, Solscan, …) */
    explorerName?: string;
    /** Solana: mint / freeze authority notes */
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    /**
     * Short yes/no/unknown checklist from verified ABI/source (EVM)
     * or mint/freeze authorities (Solana).
     */
    checklist?: ContractChecklistItem[];
    error?: string;
  };
  holders: {
    totalHolders?: number;
    top10Concentration?: number;
    top25Concentration?: number;
    topHolders: TopHolder[];
    /** Aggregates from labeled top holders when classification ran */
    distribution?: HolderDistributionAggregates;
    available: boolean;
    error?: string;
  };
  market: {
    symbol?: string;
    name?: string;
    priceUsd?: number;
    liquidityUsd?: number;
    volume24h?: number;
    fdv?: number;
    marketCap?: number;
    /** Human-readable total supply if known */
    totalSupplyFormatted?: string;
    /** Circulating supply if known (esp. Solana/Moralis) */
    circulatingSupplyFormatted?: string;
    pairCount: number;
    bestPairAddress?: string;
    /** Other DEX pair addresses used for LP holder labeling */
    pairAddresses?: string[];
    dexId?: string;
    /** LP lock status when discoverable; otherwise honestly unknown */
    liquidityLock?: LiquidityLockInfo;
    available: boolean;
    error?: string;
  };
  sources: string[];
  fetchedAt: string;
}

export interface ScoringResult {
  riskLevel: RiskLevel;
  riskLabel: string;
  riskScore: number;
  redFlags: RedFlag[];
}

export interface AnalyzeResponse {
  memo: TrustMemo;
  evidence: TokenEvidence;
  sessionId: string;
}

export interface FollowUpResponse {
  answer: string;
  grounded: boolean;
  /** How the answer was produced — rules path stays authoritative for curated questions. */
  source?: "rules" | "llm" | "fallback";
}

export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      memo?: TrustMemo;
      /** Unstyled helper line (e.g. “Using USDC on Ethereum”) — no raised panel. */
      plain?: boolean;
    };
