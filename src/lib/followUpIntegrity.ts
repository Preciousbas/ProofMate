import { z } from "zod";
import { scoreEvidence } from "./scoring/redFlags";
import type { TokenEvidence, TrustMemo } from "./types";
import { addressesEqual } from "./validation";

export class FollowUpIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowUpIntegrityError";
  }
}

const redFlagSchema = z.object({
  category: z.enum(["contract", "holders", "liquidity"]),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4_000),
  evidence: z.string().max(4_000),
});

const topHolderSchema = z.object({
  address: z.string().trim().min(1).max(128),
  percentage: z.number().finite(),
  label: z.string().max(200).optional(),
  isContract: z.boolean().optional(),
});

export const tokenEvidenceSchema = z.object({
  tokenAddress: z.string().trim().min(1).max(128),
  chain: z.string().trim().min(1).max(48),
  contract: z.object({
    verified: z.boolean(),
    solidityClassName: z.string().max(200).optional(),
    isProxy: z.boolean(),
    implementation: z.string().max(128).optional(),
    sourceAvailable: z.boolean(),
    compilerVersion: z.string().max(120).optional(),
    explorerName: z.string().max(80).optional(),
    mintAuthority: z.string().max(128).nullable().optional(),
    freezeAuthority: z.string().max(128).nullable().optional(),
    error: z.string().max(2_000).optional(),
  }),
  holders: z.object({
    totalHolders: z.number().finite().optional(),
    top10Concentration: z.number().finite().optional(),
    top25Concentration: z.number().finite().optional(),
    topHolders: z.array(topHolderSchema).max(50),
    available: z.boolean(),
    error: z.string().max(2_000).optional(),
  }),
  market: z.object({
    symbol: z.string().max(64).optional(),
    name: z.string().max(200).optional(),
    priceUsd: z.number().finite().optional(),
    liquidityUsd: z.number().finite().optional(),
    volume24h: z.number().finite().optional(),
    fdv: z.number().finite().optional(),
    marketCap: z.number().finite().optional(),
    totalSupplyFormatted: z.string().max(120).optional(),
    circulatingSupplyFormatted: z.string().max(120).optional(),
    pairCount: z.number().finite(),
    bestPairAddress: z.string().max(128).optional(),
    dexId: z.string().max(64).optional(),
    available: z.boolean(),
    error: z.string().max(2_000).optional(),
  }),
  sources: z.array(z.string().max(2_000)).max(30),
  fetchedAt: z.string().trim().min(1).max(64),
});

export const trustMemoSchema = z.object({
  tokenAddress: z.string().trim().min(1).max(128),
  tokenSymbol: z.string().max(64).optional(),
  tokenName: z.string().max(200).optional(),
  riskLevel: z.enum(["low", "moderate", "high"]),
  riskLabel: z.string().trim().min(1).max(80),
  riskScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(4_000),
  keyFacts: z.array(z.string().max(1_000)).max(40),
  redFlags: z.array(redFlagSchema).max(40),
  recommendation: z.string().trim().min(1).max(4_000),
  disclaimer: z.string().max(2_000),
  sources: z.array(z.string().max(2_000)).max(30),
  facts: z.array(z.string().max(1_000)).max(40),
  inferences: z.array(z.string().max(1_000)).max(20),
  generatedAt: z.string().trim().min(1).max(64),
});

function flagTitleSet(flags: { title: string }[]): Set<string> {
  return new Set(flags.map((f) => f.title));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Zod-validate follow-up evidence/memo, then re-score evidence and ensure
 * the memo’s deterministic score/flags still match (rejects fabricated payloads).
 */
export function parseFollowUpPayload(
  evidenceRaw: unknown,
  memoRaw: unknown,
): { evidence: TokenEvidence; memo: TrustMemo } {
  const evidenceParsed = tokenEvidenceSchema.safeParse(evidenceRaw);
  if (!evidenceParsed.success) {
    throw new FollowUpIntegrityError(
      "Invalid evidence payload. Re-run analyze_token and pass its evidence object unchanged.",
    );
  }

  const memoParsed = trustMemoSchema.safeParse(memoRaw);
  if (!memoParsed.success) {
    throw new FollowUpIntegrityError(
      "Invalid memo payload. Re-run analyze_token and pass its memo object unchanged.",
    );
  }

  const evidence = evidenceParsed.data as TokenEvidence;
  const memo = memoParsed.data as TrustMemo;

  if (!addressesEqual(evidence.tokenAddress, memo.tokenAddress)) {
    throw new FollowUpIntegrityError(
      "evidence.tokenAddress and memo.tokenAddress do not match.",
    );
  }

  const scoring = scoreEvidence(evidence);
  if (scoring.riskScore !== memo.riskScore) {
    throw new FollowUpIntegrityError(
      "memo.riskScore does not match re-scored evidence. Do not fabricate or edit scores.",
    );
  }
  if (scoring.riskLevel !== memo.riskLevel) {
    throw new FollowUpIntegrityError(
      "memo.riskLevel does not match re-scored evidence.",
    );
  }
  if (
    !setsEqual(flagTitleSet(scoring.redFlags), flagTitleSet(memo.redFlags))
  ) {
    throw new FollowUpIntegrityError(
      "memo.redFlags do not match re-scored evidence. Pass the analyze response unchanged.",
    );
  }

  return { evidence, memo };
}
