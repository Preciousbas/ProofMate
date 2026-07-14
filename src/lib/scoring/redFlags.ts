import { RISK_LABELS, SCORING_THRESHOLDS } from "../constants";
import type { RedFlag, RiskLevel, ScoringResult, TokenEvidence } from "../types";
import { classifyAsset, type AssetClass } from "./assetClass";

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelFromScore(score: number): RiskLevel {
  if (score >= SCORING_THRESHOLDS.scoreHighMin) return "high";
  if (score >= SCORING_THRESHOLDS.scoreModerateMin) return "moderate";
  return "low";
}

/** Only trusted majors with deep verified markets get concentration softened. */
function canSoftenConcentration(
  evidence: TokenEvidence,
  assetClass: AssetClass,
): boolean {
  if (assetClass !== "trusted_major") return false;
  if (!evidence.contract.verified) return false;
  return (
    (evidence.market.liquidityUsd ?? 0) >= SCORING_THRESHOLDS.bluechipMinLiquidity
  );
}

function softenSeverity(
  severity: RedFlag["severity"],
  steps: number,
): RedFlag["severity"] {
  const order: RedFlag["severity"][] = ["high", "medium", "low"];
  const idx = Math.min(order.length - 1, order.indexOf(severity) + steps);
  return order[idx];
}

function basePoints(severity: RedFlag["severity"]): number {
  if (severity === "high") return SCORING_THRESHOLDS.pointsHigh;
  if (severity === "medium") return SCORING_THRESHOLDS.pointsMedium;
  return SCORING_THRESHOLDS.pointsLow;
}

/**
 * Continuous concentration contribution so scores aren’t stuck on fixed 8/30/60.
 * Soft mode (trusted majors): small info bump. Full mode: material risk.
 */
function concentrationPoints(top10: number, soft: boolean): number {
  if (soft) {
    // 30% → ~3, 50% → ~6, 80% → ~12
    return Math.max(0, Math.min(14, Math.round((top10 - 22) * 0.2)));
  }
  // 30% → ~8, 50% → ~28, 70% → ~45, 90% → ~55
  return Math.max(0, Math.min(55, Math.round((top10 - 22) * 1.05)));
}

function liquidityThinPoints(liquidity: number): number {
  if (liquidity < SCORING_THRESHOLDS.liquidityVeryLow) {
    // $0 → 52, $10k → 42
    return Math.max(
      38,
      Math.min(
        55,
        Math.round(
          55 - (liquidity / SCORING_THRESHOLDS.liquidityVeryLow) * 12,
        ),
      ),
    );
  }
  if (liquidity < SCORING_THRESHOLDS.liquidityLow) {
    // $10k → 28, $50k → 16
    const span =
      SCORING_THRESHOLDS.liquidityLow - SCORING_THRESHOLDS.liquidityVeryLow;
    const t =
      (liquidity - SCORING_THRESHOLDS.liquidityVeryLow) / Math.max(1, span);
    return Math.round(28 - t * 12);
  }
  return 0;
}

export function scoreEvidence(evidence: TokenEvidence): ScoringResult {
  const redFlags: RedFlag[] = [];
  let riskScore = 0;

  const { contract, holders, market } = evidence;
  const assetClass = classifyAsset(evidence);
  const softMajor = canSoftenConcentration(evidence, assetClass);

  const pushFlag = (flag: RedFlag, points?: number) => {
    redFlags.push(flag);
    riskScore += points ?? basePoints(flag.severity);
  };

  // Memecoins start with a structural floor — explorer “clean” ≠ low risk.
  if (assetClass === "memecoin") {
    pushFlag(
      {
        category: "holders",
        severity: "medium",
        title: "Speculative memecoin profile",
        description:
          "Community / meme tokens can look verified and liquid and still be pure speculation. That alone keeps them out of low caution.",
        evidence: `Asset class: memecoin (${market.symbol ?? evidence.tokenAddress})`,
      },
      SCORING_THRESHOLDS.memeBaselinePoints,
    );
  }

  if (!contract.verified) {
    const checksUnavailable =
      Boolean(contract.error) &&
      /not available|isn.?t available|aren.?t available|unavailable for this chain/i.test(
        contract.error ?? "",
      );

    if (checksUnavailable) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Contract check unavailable",
          description:
            "This chain doesn’t have explorer verification wired up yet, so I can’t confirm source code from here.",
          evidence: contract.error ?? "No explorer verification for this chain",
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    } else {
      pushFlag({
        category: "contract",
        severity: "high",
        title: "Unverified contract",
        description: `The source isn’t verified on ${evidence.contract.explorerName ?? "the explorer"}, so you can’t easily read what the code can do.`,
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
    } else if (contract.verified && softMajor) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Verified upgradeable proxy",
          description:
            "It’s a verified proxy with a known implementation. Admins may still upgrade it — common for majors, still worth knowing.",
          evidence: `Implementation: ${contract.implementation}`,
        },
        SCORING_THRESHOLDS.pointsInfo + 1,
      );
    } else if (contract.verified) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Verified upgradeable proxy",
          description:
            "Verified proxy with a known implementation. Check who can upgrade it.",
          evidence: `Implementation: ${contract.implementation}`,
        },
        SCORING_THRESHOLDS.pointsLow,
      );
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

  if (holders.available && holders.top10Concentration !== undefined) {
    const top10 = holders.top10Concentration;
    if (top10 >= SCORING_THRESHOLDS.top10Moderate) {
      const pts = concentrationPoints(top10, softMajor);
      if (pts > 0) {
        const severity: RedFlag["severity"] = softMajor
          ? "low"
          : top10 >= SCORING_THRESHOLDS.top10High
            ? "high"
            : "medium";
        pushFlag(
          {
            category: "holders",
            severity,
            title: softMajor
              ? "Top wallets hold a large share"
              : top10 >= SCORING_THRESHOLDS.top10High
                ? "Top 10 hold a lot of supply"
                : "Top 10 concentration is elevated",
            description: softMajor
              ? "Common on wrapped majors and stables (exchanges/bridges). Still good to know who’s large."
              : "A small set of wallets owns a big chunk of supply. That can swing price if they sell.",
            evidence: `Top 10 holders: ${top10.toFixed(1)}% of supply`,
          },
          pts,
        );
      }
    }

    if (
      holders.top25Concentration !== undefined &&
      holders.top25Concentration >= SCORING_THRESHOLDS.top25High &&
      !softMajor
    ) {
      const extra = Math.max(
        8,
        Math.min(
          22,
          Math.round((holders.top25Concentration - 65) * 0.7),
        ),
      );
      pushFlag(
        {
          category: "holders",
          severity: "medium",
          title: "Top 25 still control most supply",
          description:
            "Even beyond the top 10, supply sits with a fairly small set of wallets.",
          evidence: `Top 25 holders: ${holders.top25Concentration.toFixed(1)}% of supply`,
        },
        extra,
      );
    }

    if (
      holders.totalHolders !== undefined &&
      holders.totalHolders < SCORING_THRESHOLDS.holderCountLow
    ) {
      const scarcity = Math.max(
        softMajor ? 2 : 8,
        Math.min(
          softMajor ? 6 : 20,
          Math.round(
            ((SCORING_THRESHOLDS.holderCountLow - holders.totalHolders) /
              SCORING_THRESHOLDS.holderCountLow) *
              (softMajor ? 6 : 20),
          ),
        ),
      );
      pushFlag(
        {
          category: "holders",
          severity: softMajor ? "low" : "medium",
          title: "Not many holders",
          description:
            "A small holder count often means thinner ownership and less community depth.",
          evidence: `Total holders: ${holders.totalHolders.toLocaleString()}`,
        },
        scarcity,
      );
    }
  } else if (holders.error) {
    const checksUnavailable =
      /not available|isn.?t available|aren.?t available|aren.?t wired|unavailable for this chain/i.test(
        holders.error,
      );
    if (!checksUnavailable) {
      pushFlag(
        {
          category: "holders",
          severity: "low",
          title: "Holder data missing",
          description: "I couldn’t pull holder distribution for this lookup.",
          evidence: holders.error,
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    }
  }

  if (market.available) {
    const liquidity = market.liquidityUsd ?? 0;
    const volume = market.volume24h ?? 0;
    const fdv = market.fdv ?? 0;

    const liqPts = liquidityThinPoints(liquidity);
    if (liqPts >= 38) {
      pushFlag(
        {
          category: "liquidity",
          severity: "high",
          title: "Very thin liquidity",
          description:
            "The pool is small. Selling into it can move the price a lot.",
          evidence: `Best-pair liquidity: $${liquidity.toLocaleString()}`,
        },
        liqPts,
      );
    } else if (liqPts > 0) {
      pushFlag(
        {
          category: "liquidity",
          severity: "medium",
          title: "Liquidity is on the low side",
          description: "There’s a pool, but larger trades may still slip.",
          evidence: `Best-pair liquidity: $${liquidity.toLocaleString()}`,
        },
        liqPts,
      );
    }

    const applyLiquidityToFdv =
      fdv > 0 &&
      liquidity > 0 &&
      fdv < SCORING_THRESHOLDS.fdvLiquidityCheckMax &&
      liquidity / fdv < SCORING_THRESHOLDS.volumeToLiquidityLow;

    if (applyLiquidityToFdv) {
      const ratio = liquidity / fdv;
      const pts = Math.max(
        softMajor ? 4 : 12,
        Math.min(
          softMajor ? 10 : 26,
          Math.round((SCORING_THRESHOLDS.volumeToLiquidityLow - ratio) * 400),
        ),
      );
      pushFlag(
        {
          category: "liquidity",
          severity: softenSeverity("medium", softMajor ? 1 : 0),
          title: "DEX liquidity thin vs valuation",
          description:
            "The stated valuation is high compared with the DEX liquidity I can see (CEX liquidity isn’t in this check).",
          evidence: `FDV: $${fdv.toLocaleString()}, liquidity: $${liquidity.toLocaleString()}`,
        },
        pts,
      );
    }

    const weakTurnover =
      volume > 0 &&
      liquidity > 0 &&
      volume / liquidity < SCORING_THRESHOLDS.volumeToLiquidityActivity;
    const thinEnoughForActivityFlag =
      liquidity < SCORING_THRESHOLDS.activityFlagMaxLiquidity ||
      (fdv > 0 && fdv < SCORING_THRESHOLDS.fdvLiquidityCheckMax);

    if (weakTurnover && thinEnoughForActivityFlag && !softMajor) {
      const turnover = volume / liquidity;
      const pts = Math.max(
        4,
        Math.min(
          14,
          Math.round(
            (SCORING_THRESHOLDS.volumeToLiquidityActivity - turnover) * 200,
          ),
        ),
      );
      pushFlag(
        {
          category: "liquidity",
          severity:
            liquidity < SCORING_THRESHOLDS.liquidityLow ? "medium" : "low",
          title: "Quiet trading vs pool size",
          description:
            "24h volume is soft next to the liquidity on this thin market — could just be a slow day, still worth noticing.",
          evidence: `24h volume: $${volume.toLocaleString()}, liquidity: $${liquidity.toLocaleString()}`,
        },
        pts,
      );
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

  let score = clampScore(riskScore);

  // Hard floor: memecoins never land in the low band.
  if (assetClass === "memecoin") {
    score = Math.max(score, SCORING_THRESHOLDS.scoreModerateMin);
  }

  const riskLevel = labelFromScore(score);

  return {
    riskLevel,
    riskLabel: RISK_LABELS[riskLevel],
    riskScore: score,
    redFlags,
  };
}
