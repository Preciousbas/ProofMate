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

export interface TopHolder {
  address: string;
  percentage: number;
  label?: string;
  isContract?: boolean;
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
    error?: string;
  };
  holders: {
    totalHolders?: number;
    top10Concentration?: number;
    top25Concentration?: number;
    topHolders: TopHolder[];
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
    dexId?: string;
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
  | { role: "assistant"; content: string; memo?: TrustMemo };
