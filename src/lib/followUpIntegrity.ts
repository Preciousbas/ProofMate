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

/** APIs / Flight often send null for missing optionals — treat like undefined. */
const nullishString = (max: number) =>
  z
    .union([z.string().max(max), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? undefined : v));

const nullishFinite = z
  .union([z.number().finite(), z.null(), z.undefined()])
  .transform((v) => (v == null ? undefined : v));

const nullishBool = z
  .union([z.boolean(), z.null(), z.undefined()])
  .transform((v) => (v == null ? undefined : v));

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
  label: nullishString(200),
  labelType: z
    .union([
      z.enum(["burn", "exchange", "lp", "contract", "team", "unknown"]),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => v ?? undefined),
  labelNote: nullishString(400),
  isContract: nullishBool,
});

const checklistItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  value: z.enum(["yes", "no", "unknown"]),
  detail: nullishString(500),
});

const holderDistributionSchema = z
  .object({
    burnedPct: z.number().finite(),
    exchangePct: z.number().finite(),
    lpPct: z.number().finite(),
    contractPct: z.number().finite(),
    teamPct: z.number().finite(),
    unknownPct: z.number().finite(),
    effectiveWhalePct: nullishFinite,
    labeledNonWhalePct: z.number().finite(),
  })
  .optional()
  .or(z.null())
  .transform((v) => v ?? undefined);

const liquidityLockSchema = z
  .object({
    status: z.enum(["locked", "partial", "unlocked", "unknown"]),
    summary: z.string().trim().min(1).max(1_000),
    provider: nullishString(120),
    lockedPct: nullishFinite,
    unlockAt: nullishString(80),
    source: nullishString(200),
    evidence: nullishString(1_000),
  })
  .optional()
  .or(z.null())
  .transform((v) => v ?? undefined);

export const tokenEvidenceSchema = z.object({
  tokenAddress: z.string().trim().min(1).max(128),
  chain: z.string().trim().min(1).max(48),
  contract: z.object({
    verified: z.boolean(),
    solidityClassName: nullishString(200),
    isProxy: z.boolean(),
    implementation: nullishString(128),
    sourceAvailable: z.boolean(),
    compilerVersion: nullishString(120),
    explorerName: nullishString(80),
    mintAuthority: z
      .union([z.string().max(128), z.null(), z.undefined()])
      .transform((v) => (v === "" ? null : v ?? null)),
    freezeAuthority: z
      .union([z.string().max(128), z.null(), z.undefined()])
      .transform((v) => (v === "" ? null : v ?? null)),
    checklist: z.array(checklistItemSchema).max(20).optional(),
    error: nullishString(2_000),
  }),
  holders: z.object({
    totalHolders: nullishFinite,
    top10Concentration: nullishFinite,
    top25Concentration: nullishFinite,
    topHolders: z.array(topHolderSchema).max(50),
    distribution: holderDistributionSchema,
    available: z.boolean(),
    error: nullishString(2_000),
  }),
  market: z.object({
    symbol: nullishString(64),
    name: nullishString(200),
    priceUsd: nullishFinite,
    liquidityUsd: nullishFinite,
    volume24h: nullishFinite,
    fdv: nullishFinite,
    marketCap: nullishFinite,
    totalSupplyFormatted: nullishString(120),
    circulatingSupplyFormatted: nullishString(120),
    pairCount: z.number().finite(),
    bestPairAddress: nullishString(128),
    pairAddresses: z.array(z.string().max(128)).max(40).optional(),
    dexId: nullishString(64),
    liquidityLock: liquidityLockSchema,
    available: z.boolean(),
    error: nullishString(2_000),
  }),
  sources: z.array(z.string().max(2_000)).max(30),
  // ISO timestamps are ~24 chars; allow headroom for offsets / milliseconds.
  fetchedAt: z.string().trim().min(1).max(80),
});

export const trustMemoSchema = z.object({
  tokenAddress: z.string().trim().min(1).max(128),
  tokenSymbol: nullishString(64),
  tokenName: nullishString(200),
  riskLevel: z.enum(["low", "moderate", "high"]),
  riskLabel: z.string().trim().min(1).max(80),
  riskScore: z.number().min(0).max(100),
  summary: z.string().trim().min(1).max(4_000),
  keyFacts: z.array(z.string().max(1_000)).max(40),
  redFlags: z.array(redFlagSchema).max(40),
  recommendation: z.string().trim().min(1).max(4_000),
  disclaimer: z.string().max(2_000),
  sources: z.array(z.string().max(2_000)).max(30),
  facts: z.array(z.string().max(1_000)).max(40),
  inferences: z.array(z.string().max(1_000)).max(20),
  generatedAt: z.string().trim().min(1).max(80),
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

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "unknown validation error";
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `${path}: ${issue.message}`;
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
      `Invalid evidence payload (${formatZodError(evidenceParsed.error)}). Re-run analyze and retry the follow-up.`,
    );
  }

  const memoParsed = trustMemoSchema.safeParse(memoRaw);
  if (!memoParsed.success) {
    throw new FollowUpIntegrityError(
      `Invalid memo payload (${formatZodError(memoParsed.error)}). Re-run analyze and retry the follow-up.`,
    );
  }

  const evidence = evidenceParsed.data as TokenEvidence;
  const memo = memoParsed.data as TrustMemo;

  // Normalize score comparison: template uses ints; Flight may send 60.0.
  const memoScore = Math.round(memo.riskScore);

  if (!addressesEqual(evidence.tokenAddress, memo.tokenAddress)) {
    throw new FollowUpIntegrityError(
      "evidence.tokenAddress and memo.tokenAddress do not match.",
    );
  }

  const scoring = scoreEvidence(evidence);
  if (scoring.riskScore !== memoScore) {
    throw new FollowUpIntegrityError(
      "This memo’s risk score no longer matches current scoring (deploy may have updated rules). Analyze the token again, then ask your follow-up.",
    );
  }
  if (scoring.riskLevel !== memo.riskLevel) {
    throw new FollowUpIntegrityError(
      "This memo’s risk level no longer matches current scoring. Analyze the token again, then ask your follow-up.",
    );
  }
  if (
    !setsEqual(flagTitleSet(scoring.redFlags), flagTitleSet(memo.redFlags))
  ) {
    throw new FollowUpIntegrityError(
      "This memo’s red flags no longer match current scoring (often after a redeploy). Analyze the token again, then ask your follow-up.",
    );
  }

  return {
    evidence,
    memo: { ...memo, riskScore: memoScore },
  };
}
