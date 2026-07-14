import { randomUUID } from "crypto";
import { cacheKey, getOrFetchAnalyze } from "@/lib/cache";
import { isZeroEvmAddress } from "@/lib/canonicalTickers";
import { DEFAULT_CHAIN_ID, resolveChainId } from "@/lib/chains";
import { gatherEvidence } from "@/lib/evidence";
import { resolveAddressChains } from "@/lib/evidence/tokenSearch";
import { answerFollowUp } from "@/lib/followUp";
import { maybeEnhanceMemo } from "@/lib/memo/llm";
import { scoreEvidence } from "@/lib/scoring/redFlags";
import {
  isSolanaAddress,
  isValidTokenAddress,
  normalizeTokenAddress,
} from "@/lib/validation";
import type { AnalyzeResponse, TokenEvidence, TrustMemo } from "@/lib/types";

async function analyzeTokenFresh(
  normalized: string,
  chain: string,
): Promise<{ memo: TrustMemo; evidence: TokenEvidence }> {
  const evidence = await gatherEvidence(normalized, chain);
  const scoring = scoreEvidence(evidence);
  const memo = await maybeEnhanceMemo(evidence, scoring);
  return { memo, evidence };
}

/**
 * Resolve which chain to analyze when the client didn't pick one.
 * Solana addresses → sol. Otherwise DexScreener highest-liquidity match.
 */
export async function detectChainForAddress(
  tokenAddress: string,
  chainHint?: string | null,
): Promise<string> {
  if (chainHint && chainHint !== "all" && chainHint !== "auto") {
    return resolveChainId(chainHint);
  }
  if (isSolanaAddress(tokenAddress)) return "sol";

  const hits = await resolveAddressChains(tokenAddress);
  if (hits.length > 0) return hits[0].chainId;
  return DEFAULT_CHAIN_ID;
}

export async function analyzeToken(
  tokenAddress: string,
  chainInput?: string | null,
): Promise<AnalyzeResponse> {
  const normalized = normalizeTokenAddress(tokenAddress);
  if (!isValidTokenAddress(normalized)) {
    throw new Error("Invalid token address");
  }
  if (isZeroEvmAddress(normalized)) {
    throw new Error(
      "That’s the zero address (often shown as native Ether on DEXes). Paste a contract, or search ETH to analyze Wrapped Ether (WETH).",
    );
  }

  const chain = await detectChainForAddress(normalized, chainInput);
  const key = cacheKey(chain, normalized);
  const shared = await getOrFetchAnalyze(key, () =>
    analyzeTokenFresh(normalized, chain),
  );

  return {
    memo: shared.memo,
    evidence: shared.evidence,
    sessionId: randomUUID(),
  };
}

export async function getFollowUpAnswer(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
) {
  return answerFollowUp(question, evidence, memo);
}
