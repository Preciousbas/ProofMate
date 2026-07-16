import { DISCLAIMER } from "../constants";
import { chainDisplayName, explorerDisplayName } from "../chains";
import { checklistValueLabel } from "../evidence/contractChecklist";
import { formatHolderType } from "../evidence/holderLabels";
import { publicHoldersStatus } from "../evidence/holdersCopy";
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

  if (evidence.contract.checklist && evidence.contract.checklist.length > 0) {
    const compact = evidence.contract.checklist
      .map(
        (item) =>
          `${item.label}: ${checklistValueLabel(item.value)}`,
      )
      .join("; ");
    facts.push(`Contract checklist: ${compact}`);
  } else if (evidence.chain === "sol") {
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
    const dist = evidence.holders.distribution;
    if (dist && dist.labeledNonWhalePct > 0) {
      facts.push(
        `Top-10 labeled non-whale: burn ${formatPercent(dist.burnedPct)}, exchange ${formatPercent(dist.exchangePct)}, LP ${formatPercent(dist.lpPct)}`,
      );
      if (dist.effectiveWhalePct !== undefined) {
        facts.push(
          `Effective whale / unlabeled slice: ${formatPercent(dist.effectiveWhalePct)}`,
        );
      }
    }
    if (evidence.holders.topHolders.length > 0) {
      const preview = evidence.holders.topHolders
        .slice(0, 3)
        .map((holder, index) => {
          const type = formatHolderType(holder.labelType);
          const name = holder.label ? ` ${holder.label}` : "";
          return `${index + 1}. ${formatAddress(holder.address)} [${type}]${name} ${formatPercent(holder.percentage)}`;
        })
        .join("; ");
      facts.push(`Top holders: ${preview}`);
    }
  } else {
    facts.push(
      `Holder data: ${publicHoldersStatus({
        chain: evidence.chain,
        available: false,
        error: evidence.holders.error,
      })}`,
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

  const lock = evidence.market.liquidityLock;
  if (lock) {
    facts.push(
      `Liquidity lock: ${lock.status}${lock.provider ? ` (${lock.provider})` : ""} — ${lock.summary}`,
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

  const highFlags = scoring.redFlags.filter((f) => f.severity === "high");
  const focus =
    highFlags[0]?.title ??
    scoring.redFlags[0]?.title ??
    null;

  const dist = evidence.holders.distribution;
  const top10 = evidence.holders.top10Concentration;
  let concentrationClause = "";
  if (
    dist &&
    top10 !== undefined &&
    top10 >= 30 &&
    dist.labeledNonWhalePct >= 20
  ) {
    concentrationClause = ` Top-10 holds ${formatPercent(top10)}, but about ${formatPercent(dist.labeledNonWhalePct)} of that slice is burn/exchange/LP${
      dist.effectiveWhalePct !== undefined
        ? `. Effective whale risk is nearer ${formatPercent(dist.effectiveWhalePct)}`
        : ""
    }.`;
  }

  if (flagCount === 0) {
    return `${name} (${symbol}) scores ${scoring.riskScore}/100 (${scoring.riskLabel.toLowerCase()}). Nothing major stood out in the public data.${concentrationClause}${price}`;
  }

  const focusClause = focus
    ? ` The main thing to check first is ${focus.toLowerCase()}.`
    : "";

  return `${name} (${symbol}) scores ${scoring.riskScore}/100 (${scoring.riskLabel.toLowerCase()}). I found ${flagCount} red flag${flagCount === 1 ? "" : "s"} in the public data.${focusClause}${concentrationClause}${price}`;
}

function buildRecommendation(scoring: ScoringResult): string {
  if (scoring.riskLevel === "high") {
    return "A few things look off. Check the contract and liquidity yourself before you do anything with this.";
  }
  if (scoring.riskLevel === "moderate") {
    const meme = scoring.redFlags.some((f) =>
      /meme|speculative/i.test(f.title),
    );
    if (meme) {
      return "This reads like a meme / speculative token. Clean explorer data doesn't make it low risk. Watch size and exits carefully.";
    }
    return "I'd look closer at who holds the supply and how liquid the market is.";
  }
  return "Public checks look relatively calm here. That still isn't a buy signal. Dig deeper yourself.";
}

function buildInferences(evidence: TokenEvidence, scoring: ScoringResult): string[] {
  const inferences: string[] = [];
  const explorer =
    evidence.contract.explorerName ?? explorerDisplayName(evidence.chain);
  const dist = evidence.holders.distribution;
  const top10 = evidence.holders.top10Concentration;

  if (!evidence.contract.verified) {
    if (evidence.chain === "sol") {
      const mint = evidence.contract.mintAuthority;
      const freeze = evidence.contract.freezeAuthority;
      if (mint === null && freeze === null) {
        inferences.push(
          "Mint and freeze look revoked, which is common. That still isn't Solscan calling this a verified listing.",
        );
      } else {
        inferences.push(
          "Mint or freeze authority may still be active. Check Solscan before you trust the supply.",
        );
      }
    } else {
      inferences.push(
        `Source isn't verified on ${explorer}, so mint/pause/blacklist logic is harder to audit.`,
      );
    }
  }

  if (dist && top10 !== undefined && top10 > 30 && dist.labeledNonWhalePct >= 20) {
    inferences.push(
      `Top-10 concentration (${formatPercent(top10)}) looks high on paper, but ~${formatPercent(dist.labeledNonWhalePct)} is burn/exchange/LP. Treat the remaining ~${formatPercent(dist.effectiveWhalePct ?? Math.max(0, top10 - dist.labeledNonWhalePct))} as the real whale slice.`,
    );
  } else if (top10 !== undefined && top10 > 30) {
    inferences.push(
      "A few wallets hold a lot of supply. They can move price hard if they dump.",
    );
  }

  const lock = evidence.market.liquidityLock;
  if (lock?.status === "locked") {
    inferences.push(lock.summary);
  } else if (lock?.status === "unlocked") {
    inferences.push(
      "LP does not look locked in public data. Size exits carefully and verify the locker yourself.",
    );
  } else if (lock?.status === "unknown") {
    inferences.push(
      "I couldn't confirm a liquidity lock from public sources. Treat that as unknown, not unlocked.",
    );
  }

  if (
    evidence.market.liquidityUsd !== undefined &&
    evidence.market.liquidityUsd < 50_000
  ) {
    inferences.push(
      "Thin liquidity means easy slippage. Exiting a size could be painful.",
    );
  }

  const riskyChecks = (evidence.contract.checklist ?? []).filter(
    (item) =>
      item.value === "yes" &&
      ["mint", "mint_authority", "blacklist", "freeze_authority"].includes(
        item.id,
      ),
  );
  if (riskyChecks.length > 0) {
    inferences.push(
      `Contract checklist flagged: ${riskyChecks.map((c) => c.label.toLowerCase()).join(", ")}.`,
    );
  }

  if (scoring.redFlags.length === 0) {
    inferences.push(
      "No big public red flags here. This doesn't cover Twitter drama, team identity, or off-chain stuff.",
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
