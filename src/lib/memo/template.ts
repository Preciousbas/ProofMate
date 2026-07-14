import { DISCLAIMER } from "../constants";
import { chainDisplayName, explorerDisplayName } from "../chains";
import {
  formatAddress,
  formatPercent,
  formatTokenPrice,
  formatUsd,
} from "../validation";
import type { ScoringResult, TokenEvidence, TrustMemo } from "../types";

function buildKeyFacts(evidence: TokenEvidence, scoring: ScoringResult): string[] {
  const facts: string[] = [];
  const chainLabel = chainDisplayName(evidence.chain);
  const explorer =
    evidence.contract.explorerName ?? explorerDisplayName(evidence.chain);

  facts.push(`Risk score: ${scoring.riskScore}/100 (${scoring.riskLabel})`);

  if (evidence.market.name || evidence.market.symbol) {
    const label = [evidence.market.name, evidence.market.symbol]
      .filter(Boolean)
      .join(" / ");
    facts.push(`Token: ${label}`);
  }

  facts.push(
    `Token address: ${evidence.tokenAddress}`,
    `Chain: ${chainLabel}`,
    `Verified on ${explorer}: ${evidence.contract.verified ? "Yes" : "No"}`,
  );

  if (evidence.chain === "sol") {
    facts.push(
      `Mint authority: ${
        evidence.contract.mintAuthority === null
          ? "Revoked"
          : evidence.contract.mintAuthority ?? "Unknown"
      }`,
      `Freeze authority: ${
        evidence.contract.freezeAuthority === null
          ? "Revoked"
          : evidence.contract.freezeAuthority ?? "Unknown"
      }`,
    );
  } else {
    facts.push(
      `Proxy contract: ${evidence.contract.isProxy ? "Yes" : "No"}`,
    );
    if (evidence.contract.implementation) {
      facts.push(`Proxy implementation: ${evidence.contract.implementation}`);
    }
  }

  if (evidence.market.totalSupplyFormatted) {
    facts.push(`Total supply: ${evidence.market.totalSupplyFormatted}`);
  }
  if (evidence.market.circulatingSupplyFormatted) {
    facts.push(
      `Circulating supply: ${evidence.market.circulatingSupplyFormatted}`,
    );
  }

  if (evidence.holders.available) {
    if (evidence.holders.totalHolders !== undefined) {
      facts.push(
        `Total holders: ${evidence.holders.totalHolders.toLocaleString()}`,
      );
    }
    if (evidence.holders.top10Concentration !== undefined) {
      facts.push(
        `Top 10 concentration: ${formatPercent(evidence.holders.top10Concentration)}`,
      );
    }
    if (evidence.holders.topHolders.length > 0) {
      const preview = evidence.holders.topHolders
        .slice(0, 3)
        .map(
          (holder, index) =>
            `${index + 1}. ${formatAddress(holder.address)}${holder.label ? ` (${holder.label})` : ""} ${formatPercent(holder.percentage)}`,
        )
        .join("; ");
      facts.push(`Top holders: ${preview}`);
    }
  } else {
    facts.push(
      `Holder data: unavailable${evidence.holders.error ? ` (${evidence.holders.error})` : ""}`,
    );
  }

  if (evidence.market.available) {
    facts.push(`Price: ${formatTokenPrice(evidence.market.priceUsd)}`);
    if (evidence.market.marketCap !== undefined) {
      facts.push(`Market cap: ${formatUsd(evidence.market.marketCap)}`);
    }
    if (evidence.market.fdv !== undefined) {
      facts.push(`FDV: ${formatUsd(evidence.market.fdv)}`);
    }
    facts.push(
      `Best-pair liquidity: ${formatUsd(evidence.market.liquidityUsd)}`,
      `24h volume: ${formatUsd(evidence.market.volume24h)}`,
      `Active DEX pairs (${chainLabel}): ${evidence.market.pairCount}`,
    );
    if (evidence.market.dexId) {
      facts.push(`Primary DEX: ${evidence.market.dexId}`);
    }
  } else {
    facts.push(
      `Market data: unavailable${evidence.market.error ? ` (${evidence.market.error})` : ""}`,
    );
  }

  return facts;
}

function buildSummary(evidence: TokenEvidence, scoring: ScoringResult): string {
  const symbol = evidence.market.symbol ?? "this token";
  const name = evidence.market.name ?? "Unknown token";
  const flagCount = scoring.redFlags.length;
  const price =
    evidence.market.priceUsd !== undefined
      ? ` Last price seen: ${formatTokenPrice(evidence.market.priceUsd)}.`
      : "";

  if (flagCount === 0) {
    return `${name} (${symbol}) scores ${scoring.riskScore}/100 — ${scoring.riskLabel.toLowerCase()}. Nothing major stood out in the public data.${price}`;
  }

  return `${name} (${symbol}) scores ${scoring.riskScore}/100 — ${scoring.riskLabel.toLowerCase()}. I found ${flagCount} red flag${flagCount === 1 ? "" : "s"} in the public data.${price}`;
}

function buildRecommendation(scoring: ScoringResult): string {
  if (scoring.riskLevel === "high") {
    return "A few things look off. Check the contract and liquidity yourself before you do anything with this.";
  }
  if (scoring.riskLevel === "moderate") {
    const meme = scoring.redFlags.some((f) =>
      /memecoin|speculative/i.test(f.title),
    );
    if (meme) {
      return "This reads as a speculative / meme token. Clean explorer data doesn’t make it low risk — treat size and exits carefully.";
    }
    return "Take a closer look at who holds the supply and how liquid the market is.";
  }
  return "Structural public checks look relatively calm here — that still isn’t a buy signal. Dig deeper yourself.";
}

function buildInferences(evidence: TokenEvidence, scoring: ScoringResult): string[] {
  const inferences: string[] = [];
  const explorer =
    evidence.contract.explorerName ?? explorerDisplayName(evidence.chain);

  if (!evidence.contract.verified) {
    inferences.push(
      evidence.chain === "sol"
        ? "Mint or freeze authority may still be active — check Solscan before you trust the supply."
        : `Source isn’t verified on ${explorer}, so mint/pause/blacklist logic is harder to audit.`,
    );
  }

  if (
    evidence.holders.top10Concentration !== undefined &&
    evidence.holders.top10Concentration > 30
  ) {
    inferences.push(
      "A few wallets hold a lot of supply — they can move price hard if they dump.",
    );
  }

  if (
    evidence.market.liquidityUsd !== undefined &&
    evidence.market.liquidityUsd < 50_000
  ) {
    inferences.push(
      "Thin liquidity = easy slippage. Exiting a size could be painful.",
    );
  }

  if (scoring.redFlags.length === 0) {
    inferences.push(
      "No big public red flags here — this doesn’t cover Twitter drama, team identity, or off-chain stuff.",
    );
  }

  return inferences;
}

export function buildTrustMemo(
  evidence: TokenEvidence,
  scoring: ScoringResult,
): TrustMemo {
  const facts = buildKeyFacts(evidence, scoring);
  const inferences = buildInferences(evidence, scoring);

  return {
    tokenAddress: evidence.tokenAddress,
    tokenSymbol: evidence.market.symbol,
    tokenName: evidence.market.name,
    riskLevel: scoring.riskLevel,
    riskLabel: scoring.riskLabel,
    riskScore: scoring.riskScore,
    summary: buildSummary(evidence, scoring),
    keyFacts: facts,
    redFlags: scoring.redFlags,
    recommendation: buildRecommendation(scoring),
    disclaimer: DISCLAIMER,
    sources: evidence.sources,
    facts,
    inferences,
    generatedAt: new Date().toISOString(),
  };
}
