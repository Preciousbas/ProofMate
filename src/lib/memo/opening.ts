import type { TrustMemo } from "../types";

/**
 * Narrative-first assistant copy shown above the memo card.
 * Leads with prose (summary + recommendation); the card holds structured depth.
 */
export function buildMemoOpeningMessage(memo: TrustMemo): string {
  const summary = memo.summary.trim();
  const recommendation = memo.recommendation.trim();

  if (!recommendation) return summary;
  if (!summary) return recommendation;
  if (summary.includes(recommendation)) return summary;

  return `${summary}\n\n${recommendation}`;
}
