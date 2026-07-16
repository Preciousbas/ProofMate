import { RISK_LABELS, SCORING_THRESHOLDS } from "../constants";
import { shouldSoftenForLabeledNonWhales } from "../evidence/holderLabels";
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

/**
 * Trusted majors with deep markets: soften CEX/bridge concentration heavily.
 * Verification is preferred but not required — Solana majors often lack a
 * full explorer verification path without Pro APIs.
 */
function canSoftenConcentration(
  evidence: TokenEvidence,
  assetClass: AssetClass,
): boolean {
  if (assetClass !== "trusted_major") return false;
  const liq = evidence.market.liquidityUsd ?? 0;
  if (liq >= SCORING_THRESHOLDS.bluechipMinLiquidity) return true;
  // Still soften known majors when market data is thin but the address is curated.
  return evidence.market.available || liq > 0;
}

/**
 * Evidence-based “established meme” — not a PEPE whitelist.
 * Verified + deep liquidity (+ holders when we have them). Thin/unverified
 * clones stay on the harsh checklist path.
 */
export function isEstablishedMemecoin(
  evidence: TokenEvidence,
  assetClass: AssetClass = classifyAsset(evidence),
): boolean {
  if (assetClass !== "memecoin") return false;
  if (!evidence.contract.verified) return false;
  const liq = evidence.market.liquidityUsd ?? 0;
  if (liq < SCORING_THRESHOLDS.establishedMemeMinLiquidity) return false;

  const holders = evidence.holders;
  if (holders.available && holders.totalHolders !== undefined) {
    return holders.totalHolders >= SCORING_THRESHOLDS.establishedMemeMinHolders;
  }
  // No holder feed (common on Solana without Pro): deep verified liquidity alone.
  return true;
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
  const isTrustedMajor = assetClass === "trusted_major";
  const establishedMeme = isEstablishedMemecoin(evidence, assetClass);
  const softMajor = canSoftenConcentration(evidence, assetClass);
  /** Soften mint / blacklist / unlock / pause the way majors soften freeze. */
  const softChecklist = isTrustedMajor || establishedMeme;

  const pushFlag = (flag: RedFlag, points?: number) => {
    redFlags.push(flag);
    riskScore += points ?? basePoints(flag.severity);
  };

  // Memecoins start with a floor — clean explorer data still isn't "low risk".
  if (assetClass === "memecoin") {
    pushFlag(
      {
        category: "holders",
        severity: "medium",
        title: "Looks like a meme / speculative token",
        description:
          "Even when the explorer looks clean and the pool looks liquid, this kind of token is still mostly speculation. That alone keeps it out of low caution.",
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

    if (evidence.chain === "sol") {
      // Solana has no EVM-style source verify. Verified=Yes only from Solscan
      // curated listing / WSOL.
      const mint = contract.mintAuthority;
      const freeze = contract.freezeAuthority;
      const bothRevoked = mint === null && freeze === null;
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: bothRevoked
            ? "Not marked verified on Solscan"
            : "Couldn't confirm Solscan verification",
          description: bothRevoked
            ? "Mint and freeze look revoked, which is common. That still isn't the same as Solscan calling it a verified listing, so Verified stays No here."
            : "I couldn't confirm Solscan lists this as verified. Check mint and freeze on Solscan yourself.",
          evidence: bothRevoked
            ? "Mint authority: revoked; freeze authority: revoked; Solscan verified: no"
            : (contract.error ?? "Solscan verified listing not confirmed"),
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    } else if (isTrustedMajor || checksUnavailable) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: checksUnavailable
            ? "Couldn't check the contract here"
            : "Couldn't fully confirm verification",
          description: checksUnavailable
            ? "This chain doesn't have explorer verification wired up yet, so I can't confirm source code from here."
            : "I couldn't fully confirm verified source on the explorer for this known major. I'm treating that as incomplete data, not a scare flag.",
          evidence: contract.error ?? "Explorer verification incomplete",
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    } else {
      pushFlag({
        category: "contract",
        severity: "high",
        title: "Unverified contract",
        description: `Source isn't verified on ${evidence.contract.explorerName ?? "the explorer"}, so you can't easily read what the code can do.`,
        evidence: contract.error ?? "Contract source not verified",
      });
    }
  }

  if (contract.isProxy) {
    const unclearImplementation = !contract.implementation;
    if (unclearImplementation && isTrustedMajor) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Proxy details incomplete",
          description:
            "This known major looks like a proxy, but I didn't get a clean implementation address back. Incomplete data, not a scare flag on its own.",
          evidence: "Proxy flag set with empty implementation field",
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    } else if (unclearImplementation) {
      pushFlag({
        category: "contract",
        severity: "high",
        title: "Proxy with no clear implementation",
        description:
          "This looks like a proxy, but no implementation address came back. That's hard to read from here.",
        evidence: "Proxy flag set with empty implementation field",
      });
    } else if (contract.verified && softMajor) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Verified upgradeable proxy",
          description:
            "It's a verified proxy with a known implementation. Admins may still upgrade it. Common for majors; still worth knowing.",
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
    } else if (isTrustedMajor) {
      pushFlag(
        {
          category: "contract",
          severity: "low",
          title: "Upgradeable proxy",
          description:
            "Proxy pattern on a known major. Admins may upgrade. Common for stables; scored lightly here.",
          evidence: `Implementation: ${contract.implementation}`,
        },
        SCORING_THRESHOLDS.pointsInfo,
      );
    } else {
      pushFlag({
        category: "contract",
        severity: "medium",
        title: "Upgradeable proxy",
        description: `Proxy points at ${contract.implementation}. Check who can upgrade it before you trust it for long.`,
        evidence: `Implementation: ${contract.implementation}`,
      });
    }
  }

  // Checklist-driven flags (only when we have a clear yes from source/ABI).
  const checklist = contract.checklist ?? [];
  const check = (id: string) => checklist.find((item) => item.id === id);

  const mintItem = check("mint") ?? check("mint_authority");
  if (mintItem?.value === "yes" && !isTrustedMajor) {
    pushFlag(
      {
        category: "contract",
        severity: establishedMeme ? "low" : "medium",
        title:
          mintItem.id === "mint_authority"
            ? "Mint authority still active"
            : "Mint function present",
        description: establishedMeme
          ? "Source shows a mint path. Common on older memes. Still check who controls it; I'm not scoring it like a fresh unverified mint."
          : mintItem.id === "mint_authority"
            ? "Someone can still mint new supply unless that authority is revoked."
            : "Verified source shows a mint path, so supply may not be fixed.",
        evidence: mintItem.detail ?? mintItem.label,
      },
      establishedMeme
        ? SCORING_THRESHOLDS.pointsLow
        : SCORING_THRESHOLDS.pointsMedium,
    );
  }

  const freezeItem = check("freeze_authority");
  if (freezeItem?.value === "yes") {
    // Stables / majors often keep freeze — note it, don’t flood the score.
    pushFlag(
      {
        category: "contract",
        severity: softChecklist ? "low" : "medium",
        title: "Freeze authority still active",
        description: isTrustedMajor
          ? "Freeze authority exists (common on regulated stables). Worth knowing; not scored like a random mint."
          : establishedMeme
            ? "Freeze authority exists. On a deep, verified meme I'm noting it, not maxing the score for it."
            : "Accounts can potentially be frozen by the current freeze authority.",
        evidence: freezeItem.detail ?? freezeItem.label,
      },
      softChecklist
        ? SCORING_THRESHOLDS.pointsInfo
        : SCORING_THRESHOLDS.pointsMedium,
    );
  }

  const blacklistItem = check("blacklist");
  if (blacklistItem?.value === "yes") {
    pushFlag(
      {
        category: "contract",
        severity: softChecklist ? "low" : "medium",
        title: "Blacklist capability",
        description: isTrustedMajor
          ? "Blacklist / block capability exists (common on USDC-style stables for compliance). Info only for known majors."
          : establishedMeme
            ? "Blacklist / block capability exists. Noted for this deep verified meme; not weighted like a thin unknown token."
            : "Source suggests addresses can be blocked from transferring.",
        evidence: blacklistItem.detail ?? blacklistItem.label,
      },
      softChecklist
        ? SCORING_THRESHOLDS.pointsInfo
        : SCORING_THRESHOLDS.pointsMedium,
    );
  }

  const pauseItem = check("pause");
  if (pauseItem?.value === "yes" && !softChecklist) {
    pushFlag(
      {
        category: "contract",
        severity: "low",
        title: "Pausable transfers",
        description: "An admin may be able to pause trading or transfers.",
        evidence: pauseItem.detail ?? pauseItem.label,
      },
      SCORING_THRESHOLDS.pointsLow,
    );
  } else if (pauseItem?.value === "yes" && establishedMeme && !isTrustedMajor) {
    pushFlag(
      {
        category: "contract",
        severity: "low",
        title: "Pausable transfers",
        description:
          "Transfers may be pausable. On a deep verified meme that's an info note, not a score dump.",
        evidence: pauseItem.detail ?? pauseItem.label,
      },
      SCORING_THRESHOLDS.pointsInfo,
    );
  }

  const taxItem = check("tax");
  if (taxItem?.value === "yes") {
    pushFlag(
      {
        category: "contract",
        severity: "low",
        title: "Transfer tax / fee logic",
        description:
          "Fee or tax symbols showed up in verified source. Check buy/sell impact yourself.",
        evidence: taxItem.detail ?? taxItem.label,
      },
      SCORING_THRESHOLDS.pointsLow,
    );
  }

  const ownershipItem = check("ownership_renounced");
  if (ownershipItem?.value === "no" && contract.verified && !softMajor) {
    pushFlag(
      {
        category: "contract",
        severity: "low",
        title: "Owner not renounced",
        description:
          "Ownable / onlyOwner patterns are present. An admin may still control privileged functions.",
        evidence: ownershipItem.detail ?? ownershipItem.label,
      },
      SCORING_THRESHOLDS.pointsInfo + 2,
    );
  }

  const softLabeled = shouldSoftenForLabeledNonWhales(
    holders.distribution,
    holders.top10Concentration,
  );
  const softConcentration = softMajor || softLabeled;

  if (holders.available && holders.top10Concentration !== undefined) {
    const top10 = holders.top10Concentration;
    const dist = holders.distribution;
    const evidenceParts = [`Top 10 holders: ${top10.toFixed(1)}% of supply`];
    if (dist && dist.labeledNonWhalePct > 0) {
      evidenceParts.push(
        `of which burn ${dist.burnedPct.toFixed(1)}% / exchange ${dist.exchangePct.toFixed(1)}% / LP ${dist.lpPct.toFixed(1)}%`,
      );
      if (dist.effectiveWhalePct !== undefined) {
        evidenceParts.push(
          `effective unlabeled/whale slice ≈ ${dist.effectiveWhalePct.toFixed(1)}%`,
        );
      }
    }

    if (top10 >= SCORING_THRESHOLDS.top10Moderate) {
      const pts = concentrationPoints(top10, softConcentration);
      if (pts > 0) {
        const severity: RedFlag["severity"] = softConcentration
          ? softLabeled && !softMajor
            ? top10 >= SCORING_THRESHOLDS.top10High
              ? "medium"
              : "low"
            : "low"
          : top10 >= SCORING_THRESHOLDS.top10High
            ? "high"
            : "medium";
        pushFlag(
          {
            category: "holders",
            severity,
            title: softLabeled && !softMajor
              ? "Top 10 looks heavy, but a lot is burn/exchange/LP"
              : softMajor
                ? "Top wallets hold a large share"
                : top10 >= SCORING_THRESHOLDS.top10High
                  ? "Top 10 hold a lot of supply"
                  : "Top 10 concentration is elevated",
            description: softLabeled && !softMajor
              ? "Raw top-10 share looks high, but a large slice is burn, exchange, or LP. Effective whale risk is lower than the headline number."
              : softMajor
                ? "Common on wrapped majors and stables (exchanges/bridges). Still good to know who's large."
                : "A small set of wallets owns a big chunk of supply. That can swing price if they sell.",
            evidence: evidenceParts.join("; "),
          },
          pts,
        );
      }
    }

    if (
      holders.top25Concentration !== undefined &&
      holders.top25Concentration >= SCORING_THRESHOLDS.top25High &&
      !softConcentration
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
        softConcentration ? 2 : 8,
        Math.min(
          softConcentration ? 6 : 20,
          Math.round(
            ((SCORING_THRESHOLDS.holderCountLow - holders.totalHolders) /
              SCORING_THRESHOLDS.holderCountLow) *
              (softConcentration ? 6 : 20),
          ),
        ),
      );
      pushFlag(
        {
          category: "holders",
          severity: softConcentration ? "low" : "medium",
          title: "Not many holders",
          description:
            "A small holder count often means thinner ownership and less community depth behind it.",
          evidence: `Total holders: ${holders.totalHolders.toLocaleString()}`,
        },
        scarcity,
      );
    }
  } else if (holders.error || !holders.available) {
    const raw = holders.error ?? "";
    const checksUnavailable =
      /not available|isn.?t available|aren.?t available|aren.?t wired|unavailable for this chain|no evidence yet|couldn.?t get holders|solana holder|solscan/i.test(
        raw,
      );
    // Missing holder feeds (esp. Solana without Pro) must not nuke majors —
    // and never put API-key hints into the memo evidence string.
    if (!checksUnavailable && !isTrustedMajor && evidence.chain !== "sol") {
      pushFlag(
        {
          category: "holders",
          severity: "low",
          title: "Couldn't get holder data",
          description: "I couldn't pull holder distribution for this one.",
          evidence: "Holder distribution unavailable",
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
            "The stated valuation looks high next to the DEX liquidity I can see. CEX liquidity isn't in this check.",
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
            "24h volume is soft next to the liquidity on this thin market. Could just be a slow day; still worth noticing.",
          evidence: `24h volume: $${volume.toLocaleString()}, liquidity: $${liquidity.toLocaleString()}`,
        },
        pts,
      );
    }

    const lock = market.liquidityLock;
    if (lock?.status === "unlocked" && !softMajor) {
      pushFlag(
        {
          category: "liquidity",
          severity: establishedMeme ? "low" : "medium",
          title: "LP does not look locked",
          description: establishedMeme
            ? "No clear LP lock showed up in public data. For a deep verified pool that's less about an instant rug and more \"I can't prove it's locked.\""
            : "Public LP data doesn't show a meaningful lock. That doesn't prove a rug. It just means lock status isn't comforting.",
          evidence: lock.evidence ?? lock.summary,
        },
        establishedMeme
          ? SCORING_THRESHOLDS.pointsLow
          : SCORING_THRESHOLDS.pointsMedium,
      );
    } else if (lock?.status === "partial" && !softMajor) {
      pushFlag(
        {
          category: "liquidity",
          severity: "low",
          title: "LP only partially locked",
          description:
            "Some liquidity looks locked; the rest may still be withdrawable.",
          evidence: lock.evidence ?? lock.summary,
        },
        SCORING_THRESHOLDS.pointsLow,
      );
    }
  } else {
    pushFlag({
      category: "liquidity",
      severity: "high",
      title: "No meaningful DEX market",
      description:
        "I didn't find active pairs, so price discovery and exits look limited here.",
      evidence: market.error ?? "DexScreener returned zero pairs",
    });
  }

  let score = clampScore(riskScore);

  // Hard floor: memecoins never land in the low band.
  if (assetClass === "memecoin") {
    score = Math.max(score, SCORING_THRESHOLDS.scoreModerateMin);
  }

  // Soft ceiling: deep verified memes stay speculative without sharing the
  // same 100-cap dump as thin unverified clones.
  if (establishedMeme) {
    score = Math.min(score, SCORING_THRESHOLDS.establishedMemeScoreCap);
  }

  const riskLevel = labelFromScore(score);

  return {
    riskLevel,
    riskLabel: RISK_LABELS[riskLevel],
    riskScore: score,
    redFlags,
  };
}
