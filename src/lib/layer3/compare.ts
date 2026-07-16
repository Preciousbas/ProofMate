import { chainDisplayName } from "../chains";
import {
  formatAddress,
  formatPercent,
  formatUsd,
} from "../validation";
import type { TokenEvidence, TrustMemo } from "../types";

function tokenLabel(memo: TrustMemo, evidence: TokenEvidence): string {
  const symbol = memo.tokenSymbol ?? evidence.market.symbol;
  const name = memo.tokenName ?? evidence.market.name;
  if (symbol && name && symbol !== name) return `${name} (${symbol})`;
  return symbol ?? name ?? formatAddress(memo.tokenAddress);
}

function shortLabel(memo: TrustMemo, evidence: TokenEvidence): string {
  return (
    memo.tokenSymbol ??
    evidence.market.symbol ??
    formatAddress(memo.tokenAddress)
  );
}

function verifiedLine(evidence: TokenEvidence): string {
  if (evidence.chain === "sol") {
    const mint =
      evidence.contract.mintAuthority === null
        ? "mint revoked"
        : evidence.contract.mintAuthority
          ? "mint active"
          : "mint unknown";
    return evidence.contract.verified
      ? `Listed on explorer · ${mint}`
      : `Explorer check incomplete · ${mint}`;
  }
  const proxy = evidence.contract.isProxy ? "proxy" : "not a proxy";
  return evidence.contract.verified
    ? `Verified · ${proxy}`
    : `Unverified · ${proxy}`;
}

function lockLine(evidence: TokenEvidence): string {
  const lock = evidence.market.liquidityLock;
  if (!lock) return "Unknown";
  if (lock.status === "unknown") return lock.summary || "Unknown";
  const pct =
    lock.lockedPct !== undefined ? ` (~${lock.lockedPct.toFixed(0)}%)` : "";
  const provider = lock.provider ? ` via ${lock.provider}` : "";
  return `${lock.status}${pct}${provider}`;
}

function cell(value: string | undefined): string {
  return value && value.trim() ? value : "Unavailable";
}

/**
 * Side-by-side research comparison (Layer 3).
 * Keeps the primary token as the “active” reference; secondary is the peer.
 */
export function buildComparisonMessage(
  primary: { memo: TrustMemo; evidence: TokenEvidence },
  secondary: { memo: TrustMemo; evidence: TokenEvidence },
  options?: { freeFormPair?: boolean },
): string {
  const aName = tokenLabel(primary.memo, primary.evidence);
  const bName = tokenLabel(secondary.memo, secondary.evidence);
  const a = shortLabel(primary.memo, primary.evidence);
  const b = shortLabel(secondary.memo, secondary.evidence);

  const rows: { metric: string; left: string; right: string }[] = [
    {
      metric: "Risk score",
      left: `${primary.memo.riskScore}/100 · ${primary.memo.riskLabel}`,
      right: `${secondary.memo.riskScore}/100 · ${secondary.memo.riskLabel}`,
    },
    {
      metric: "Chain",
      left: chainDisplayName(primary.evidence.chain),
      right: chainDisplayName(secondary.evidence.chain),
    },
    {
      metric: "Contract",
      left: verifiedLine(primary.evidence),
      right: verifiedLine(secondary.evidence),
    },
    {
      metric: "Top 10 holders",
      left: cell(
        primary.evidence.holders.top10Concentration !== undefined
          ? formatPercent(primary.evidence.holders.top10Concentration)
          : undefined,
      ),
      right: cell(
        secondary.evidence.holders.top10Concentration !== undefined
          ? formatPercent(secondary.evidence.holders.top10Concentration)
          : undefined,
      ),
    },
    {
      metric: "DEX liquidity",
      left: cell(
        primary.evidence.market.liquidityUsd !== undefined
          ? formatUsd(primary.evidence.market.liquidityUsd)
          : undefined,
      ),
      right: cell(
        secondary.evidence.market.liquidityUsd !== undefined
          ? formatUsd(secondary.evidence.market.liquidityUsd)
          : undefined,
      ),
    },
    {
      metric: "24h volume",
      left: cell(
        primary.evidence.market.volume24h !== undefined
          ? formatUsd(primary.evidence.market.volume24h)
          : undefined,
      ),
      right: cell(
        secondary.evidence.market.volume24h !== undefined
          ? formatUsd(secondary.evidence.market.volume24h)
          : undefined,
      ),
    },
    {
      metric: "Liquidity lock",
      left: lockLine(primary.evidence),
      right: lockLine(secondary.evidence),
    },
    {
      metric: "High-severity flags",
      left: String(
        primary.memo.redFlags.filter((f) => f.severity === "high").length,
      ),
      right: String(
        secondary.memo.redFlags.filter((f) => f.severity === "high").length,
      ),
    },
  ];

  const lines = [
    `Here’s ${aName} vs ${bName}, side by side.`,
    "",
    "Same public checks on both. I can't recommend buying or selling either one. This is just the research so you can decide.",
    "",
  ];

  for (const row of rows) {
    lines.push(row.metric);
    lines.push(`- ${a}: ${row.left}`);
    lines.push(`- ${b}: ${row.right}`);
    lines.push("");
  }

  const aHigh = primary.memo.redFlags.filter((f) => f.severity === "high");
  const bHigh = secondary.memo.redFlags.filter((f) => f.severity === "high");

  if (aHigh.length || bHigh.length) {
    lines.push("Notable high-severity flags");
    if (aHigh.length) {
      lines.push(`- ${a}: ${aHigh.map((f) => f.title).join("; ")}`);
    } else {
      lines.push(`- ${a}: none in this check`);
    }
    if (bHigh.length) {
      lines.push(`- ${b}: ${bHigh.map((f) => f.title).join("; ")}`);
    } else {
      lines.push(`- ${b}: none in this check`);
    }
    lines.push("");
  }

  if (options?.freeFormPair) {
    lines.push(
      "Paste a ticker to dig into one side, or run /compare again with another pair.",
    );
  } else {
    lines.push(
      `Primary session stays on ${a}. Paste a ticker to switch focus, or run /compare again.`,
    );
  }

  return lines.join("\n").trim();
}

export const COMPARE_PROMPT_MESSAGE =
  "What should I compare? Name one peer (`/compare DOGE`) or both sides — e.g. PEPE vs DOGE.";
