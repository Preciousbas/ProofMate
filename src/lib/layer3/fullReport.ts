import { DISCLAIMER } from "../constants";
import { chainDisplayName } from "../chains";
import { publicHoldersStatus } from "../evidence/holdersCopy";
import {
  buildContractRows,
  buildHolderRows,
  formatHolderLabel,
} from "../memo/sections";
import {
  formatAddress,
  formatPercent,
  formatTokenPrice,
  formatUsd,
} from "../validation";
import type { TokenEvidence, TrustMemo } from "../types";

function tokenHeading(memo: TrustMemo, evidence: TokenEvidence): string {
  const symbol = memo.tokenSymbol ?? evidence.market.symbol;
  const name = memo.tokenName ?? evidence.market.name;
  if (name && symbol) return `${name} (${symbol})`;
  return name ?? symbol ?? formatAddress(memo.tokenAddress);
}

/**
 * Long-form research report (Layer 3).
 * Expands the full evidence pack into one chat message — not part of the
 * default analyze path.
 */
export function buildFullReport(
  memo: TrustMemo,
  evidence: TokenEvidence,
): string {
  const title = tokenHeading(memo, evidence);
  const chain = chainDisplayName(evidence.chain);
  const holders = buildHolderRows(memo, evidence);
  const contractRows = buildContractRows(memo, evidence);

  const lines: string[] = [
    `Full research report: ${title}`,
    "",
    "Here's the expanded view of the same public data behind the trust memo. Not an audit, and not financial advice.",
    "",
    "1. Verdict",
    `- Risk score: ${memo.riskScore}/100 (${memo.riskLabel})`,
    `- Summary: ${memo.summary}`,
  ];

  if (memo.recommendation) {
    lines.push(`- Next step: ${memo.recommendation}`);
  }

  lines.push("", "2. Snapshot");
  lines.push(`- Chain: ${chain}`);
  lines.push(`- Address: ${memo.tokenAddress}`);
  if (evidence.market.priceUsd !== undefined) {
    lines.push(`- Price: ${formatTokenPrice(evidence.market.priceUsd)}`);
  }
  if (evidence.market.liquidityUsd !== undefined) {
    lines.push(`- Best-pair liquidity: ${formatUsd(evidence.market.liquidityUsd)}`);
  }
  if (evidence.market.volume24h !== undefined) {
    lines.push(`- 24h volume: ${formatUsd(evidence.market.volume24h)}`);
  }
  if (evidence.market.marketCap !== undefined) {
    lines.push(`- Market cap: ${formatUsd(evidence.market.marketCap)}`);
  }
  if (evidence.market.fdv !== undefined) {
    lines.push(`- FDV: ${formatUsd(evidence.market.fdv)}`);
  }

  lines.push("", "3. Red flags");
  if (memo.redFlags.length === 0) {
    lines.push("- No red flags in this check.");
  } else {
    for (const flag of memo.redFlags) {
      lines.push(
        `- [${flag.severity}] ${flag.title} (${flag.category}): ${flag.description}`,
      );
      if (flag.evidence) {
        lines.push(`  Evidence: ${flag.evidence}`);
      }
    }
  }

  lines.push("", "4. Holders");
  if (!holders.available) {
    lines.push(
      `- ${publicHoldersStatus({
        chain: evidence.chain,
        available: false,
        error: holders.error,
      })}.`,
    );
  } else {
    for (const row of holders.rows) {
      lines.push(`- ${row.label}: ${row.value}`);
    }
    const dist = evidence.holders.distribution;
    if (dist) {
      lines.push(
        `- Among labeled top holders: burn ${formatPercent(dist.burnedPct)}, exchange ${formatPercent(dist.exchangePct)}, LP ${formatPercent(dist.lpPct)}, unknown ${formatPercent(dist.unknownPct)}.`,
      );
      if (dist.effectiveWhalePct !== undefined) {
        lines.push(
          `- Effective whale slice (top-10 minus burn/exchange/LP): ${formatPercent(dist.effectiveWhalePct)}.`,
        );
      }
    }
    const top = evidence.holders.topHolders.slice(0, 10);
    if (top.length > 0) {
      lines.push("- Top holders:");
      top.forEach((holder, index) => {
        const labelNote = holder.labelNote ? ` — ${holder.labelNote}` : "";
        lines.push(
          `  ${index + 1}. ${formatHolderLabel(holder)} · ${formatPercent(holder.percentage)}${labelNote}`,
        );
      });
    }
  }

  lines.push("", "5. Liquidity");
  if (!evidence.market.available) {
    lines.push(
      `- Market data unavailable${evidence.market.error ? ` (${evidence.market.error})` : ""}.`,
    );
  } else {
    lines.push(
      `- Pairs seen: ${evidence.market.pairCount}`,
      `- DEX: ${evidence.market.dexId ?? "Unknown"}`,
    );
    const lock = evidence.market.liquidityLock;
    if (lock) {
      lines.push(`- Lock status: ${lock.status} — ${lock.summary}`);
      if (lock.provider) lines.push(`- Lock provider: ${lock.provider}`);
      if (lock.lockedPct !== undefined) {
        lines.push(`- Locked share: ~${lock.lockedPct.toFixed(0)}%`);
      }
      if (lock.unlockAt) lines.push(`- Unlock: ${lock.unlockAt}`);
    } else {
      lines.push("- Lock status: unknown for this token.");
    }
  }

  lines.push("", "6. Contract");
  for (const row of contractRows) {
    lines.push(`- ${row.label}: ${row.value}`);
  }
  const checklist = evidence.contract.checklist;
  if (checklist && checklist.length > 0) {
    lines.push("- Checklist:");
    for (const item of checklist) {
      const detail = item.detail ? ` — ${item.detail}` : "";
      lines.push(`  · ${item.label}: ${item.value}${detail}`);
    }
  }

  if (memo.facts.length > 0) {
    lines.push("", "7. Facts (from evidence)");
    for (const fact of memo.facts) {
      lines.push(`- ${fact}`);
    }
  }

  if (memo.inferences.length > 0) {
    lines.push("", "8. Inferences (not raw facts)");
    for (const inference of memo.inferences) {
      lines.push(`- ${inference}`);
    }
  }

  const sources = Array.from(
    new Set([...memo.sources, ...evidence.sources]),
  ).filter(Boolean);
  if (sources.length > 0) {
    lines.push("", "9. Sources");
    for (const source of sources) {
      lines.push(`- ${source}`);
    }
  }

  lines.push(
    "",
    "10. Disclaimer",
    DISCLAIMER,
    "",
    `Generated ${memo.generatedAt}. Evidence fetched ${evidence.fetchedAt}.`,
  );

  return lines.join("\n");
}
