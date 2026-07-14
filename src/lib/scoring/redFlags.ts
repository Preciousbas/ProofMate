import { RISK_LABELS, SCORING_THRESHOLDS } from "../constants";
import type { RedFlag, RiskLevel, ScoringResult, TokenEvidence } from "../types";

function severityPoints(severity: RedFlag["severity"]): number {
  if (severity === "high") return SCORING_THRESHOLDS.pointsHigh;
  if (severity === "medium") return SCORING_THRESHOLDS.pointsMedium;
  return SCORING_THRESHOLDS.pointsLow;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelFromScore(score: number): RiskLevel {
  if (score >= SCORING_THRESHOLDS.scoreHighMin) return "high";
  if (score >= SCORING_THRESHOLDS.scoreModerateMin) return "moderate";
  return "low";
}

/** Deep, verified markets — don’t punish CEX/bridge concentration the same way. */
function isDeepVerifiedMarket(evidence: TokenEvidence): boolean {
  if (!evidence.contract.verified) return false;
  return (evidence.market.liquidityUsd ?? 0) >= SCORING_THRESHOLDS.bluechipMinLiquidity;
}

function softenSeverity(
  severity: RedFlag["severity"],
  steps: number,
): RedFlag["severity"] {
  const order: RedFlag["severity"][] = ["high", "medium", "low"];
  const idx = Math.min(order.length - 1, order.indexOf(severity) + steps);
  return order[idx];
}

export function scoreEvidence(evidence: TokenEvidence): ScoringResult {
  const redFlags: RedFlag[] = [];
  let riskScore = 0;

  const { contract, holders, market } = evidence;
  const deepVerified = isDeepVerifiedMarket(evidence);

  const pushFlag = (flag: RedFlag) => {
    redFlags.push(flag);
    riskScore += severityPoints(flag.severity);
  };

  if (!contract.verified) {
    const checksUnavailable =
      Boolean(contract.error) &&
      /not available|isn.?t available|aren.?t available|unavailable for this chain/i.test(
        contract.error ?? "",
      );

    if (checksUnavailable) {
      pushFlag({
        category: "contract",
        severity: "low",
        title: "Contract check unavailable",
        description:
          "This chain doesn’t have explorer verification wired up yet, so I can’t confirm source code from here.",
        evidence: contract.error ?? "No explorer verification for this chain",
      });
    } else {
      pushFlag({
        category: "contract",
        severity: "high",
        title: "Unverified contract",
        description:
          `The source isn’t verified on ${evidence.contract.explorerName ?? "the explorer"}, so you can’t easily read what the code can do.`,
        evidence: contract.error ?? "Contract source not verified",
      });
    }
  }

  if (contract.isProxy) {
    const unclearImplementation = !contract.implementation;
    if (unclearImplementation) {
      pushFlag({
        category: "contract",
        severity: "high",
        title: "Proxy with no clear implementation",
        description:
          "This looks like a proxy, but no implementation address came back — that’s opaque.",
        evidence: "Proxy flag set with empty implementation field",
      });
    } else if (contract.verified) {
      pushFlag({
        category: "contract",
        severity: "low",
        title: "Verified upgradeable proxy",
        description:
          "It’s a verified proxy with a known implementation. Admins may still be able to upgrade it — common for big tokens, still worth knowing.",
        evidence: `Implementation: ${contract.implementation}`,
      });
    } else {
      pushFlag({
        category: "contract",
        severity: "medium",
        title: "Upgradeable proxy",
        description: `Proxy points at ${contract.implementation}. Check who can upgrade it before you trust it long term.`,
        evidence: `Implementation: ${contract.implementation}`,
      });
    }
  }

  if (holders.available) {
    if (
      holders.top10Concentration !== undefined &&
      holders.top10Concentration >= SCORING_THRESHOLDS.top10High
    ) {
      if (!deepVerified) {
        pushFlag({
          category: "holders",
          severity: "high",
          title: "Top 10 hold a lot of supply",
          description:
            "A small set of wallets owns a big chunk of supply. That can swing price if they sell.",
          evidence: `Top 10 holders: ${holders.top10Concentration.toFixed(1)}% of supply`,
        });
      } else {
        pushFlag({
          category: "holders",
          severity: "low",
          title: "Top wallets hold a large share",
          description:
            "Common on wrapped majors (exchanges and bridges). Still good to know who’s large.",
          evidence: `Top 10 holders: ${holders.top10Concentration.toFixed(1)}% of supply`,
        });
      }
    } else if (
      holders.top10Concentration !== undefined &&
      holders.top10Concentration >= SCORING_THRESHOLDS.top10Moderate
    ) {
      pushFlag({
        category: "holders",
        severity: deepVerified ? "low" : "medium",
        title: "Top 10 concentration is elevated",
        description:
          "Ownership is a bit top-heavy. Glance at the biggest wallets before you size in.",
        evidence: `Top 10 holders: ${holders.top10Concentration.toFixed(1)}% of supply`,
      });
    }

    if (
      holders.top25Concentration !== undefined &&
      holders.top25Concentration >= SCORING_THRESHOLDS.top25High &&
      !deepVerified
    ) {
      pushFlag({
        category: "holders",
        severity: "medium",
        title: "Top 25 still control most supply",
        description:
          "Even beyond the top 10, supply sits with a fairly small set of wallets.",
        evidence: `Top 25 holders: ${holders.top25Concentration.toFixed(1)}% of supply`,
      });
    }

    if (
      holders.totalHolders !== undefined &&
      holders.totalHolders < SCORING_THRESHOLDS.holderCountLow
    ) {
      pushFlag({
        category: "holders",
        severity: deepVerified ? "low" : "medium",
        title: "Not many holders",
        description:
          "A small holder count often means thinner ownership and less community depth.",
        evidence: `Total holders: ${holders.totalHolders.toLocaleString()}`,
      });
    }
  } else if (holders.error) {
    const checksUnavailable =
      /not available|isn.?t available|aren.?t available|aren.?t wired|unavailable for this chain/i.test(
        holders.error,
      );
    // Market-only chains already surface “contract check unavailable” — don’t stack
    // another low flag that bumps majors like SOL for missing Moralis coverage.
    if (!checksUnavailable) {
      pushFlag({
        category: "holders",
        severity: "low",
        title: "Holder data missing",
        description: "I couldn’t pull holder distribution for this lookup.",
        evidence: holders.error,
      });
    }
  }

  if (market.available) {
    const liquidity = market.liquidityUsd ?? 0;
    const volume = market.volume24h ?? 0;
    const fdv = market.fdv ?? 0;

    if (liquidity < SCORING_THRESHOLDS.liquidityVeryLow) {
      pushFlag({
        category: "liquidity",
        severity: "high",
        title: "Very thin liquidity",
        description:
          "The pool is small. Selling into it can move the price a lot.",
        evidence: `Best-pair liquidity: $${liquidity.toLocaleString()}`,
      });
    } else if (liquidity < SCORING_THRESHOLDS.liquidityLow) {
      pushFlag({
        category: "liquidity",
        severity: "medium",
        title: "Liquidity is on the low side",
        description: "There’s a pool, but larger trades may still slip.",
        evidence: `Best-pair liquidity: $${liquidity.toLocaleString()}`,
      });
    }

    const applyLiquidityToFdv =
      fdv > 0 &&
      liquidity > 0 &&
      fdv < SCORING_THRESHOLDS.fdvLiquidityCheckMax &&
      liquidity / fdv < SCORING_THRESHOLDS.volumeToLiquidityLow;

    if (applyLiquidityToFdv) {
      pushFlag({
        category: "liquidity",
        severity: softenSeverity("medium", deepVerified ? 1 : 0),
        title: "DEX liquidity thin vs valuation",
        description:
          "The stated valuation is high compared with the DEX liquidity I can see (CEX liquidity isn’t in this check).",
        evidence: `FDV: $${fdv.toLocaleString()}, liquidity: $${liquidity.toLocaleString()}`,
      });
    }

    const weakTurnover =
      volume > 0 &&
      liquidity > 0 &&
      volume / liquidity < SCORING_THRESHOLDS.volumeToLiquidityActivity;
    const thinEnoughForActivityFlag =
      liquidity < SCORING_THRESHOLDS.activityFlagMaxLiquidity ||
      (fdv > 0 && fdv < SCORING_THRESHOLDS.fdvLiquidityCheckMax);

    if (weakTurnover && thinEnoughForActivityFlag && !deepVerified) {
      pushFlag({
        category: "liquidity",
        severity:
          liquidity < SCORING_THRESHOLDS.liquidityLow ? "medium" : "low",
        title: "Quiet trading vs pool size",
        description:
          "24h volume is soft next to the liquidity on this thin market — could just be a slow day, still worth noticing.",
        evidence: `24h volume: $${volume.toLocaleString()}, liquidity: $${liquidity.toLocaleString()}`,
      });
    }
  } else {
    pushFlag({
      category: "liquidity",
      severity: "high",
      title: "No meaningful DEX market",
      description:
        "I didn’t find active pairs, so price discovery and exits look limited here.",
      evidence: market.error ?? "DexScreener returned zero pairs",
    });
  }

  const score = clampScore(riskScore);
  const riskLevel = labelFromScore(score);

  return {
    riskLevel,
    riskLabel: RISK_LABELS[riskLevel],
    riskScore: score,
    redFlags,
  };
}
