import { chainDisplayName } from "../chains";
import { checklistValueLabel } from "../evidence/contractChecklist";
import { formatHolderType } from "../evidence/holderLabels";
import { publicHoldersStatus } from "../evidence/holdersCopy";
import {
  formatAddress,
  formatPercent,
  formatTokenPrice,
  formatUsd,
} from "../validation";
import type {
  HolderLabelType,
  TokenEvidence,
  TrustMemo,
} from "../types";

export interface SnapshotItem {
  label: string;
  value: string;
}

export interface FactRow {
  label: string;
  value: string;
}

export interface HolderRow {
  address: string;
  percentage: number;
  label?: string;
  labelType?: HolderLabelType;
  labelNote?: string;
  isContract?: boolean;
}

function factValue(facts: string[], prefix: string): string | undefined {
  const match = facts.find((fact) => fact.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
}

function factsStartingWith(facts: string[], prefixes: string[]): FactRow[] {
  return facts
    .filter((fact) => prefixes.some((prefix) => fact.startsWith(prefix)))
    .map((fact) => {
      const colon = fact.indexOf(":");
      if (colon === -1) return { label: fact, value: "" };
      return {
        label: fact.slice(0, colon).trim(),
        value: fact.slice(colon + 1).trim(),
      };
    });
}

/** Compact market/chain glance for the open Summary section. */
export function buildSnapshot(
  memo: TrustMemo,
  evidence?: TokenEvidence,
): SnapshotItem[] {
  if (evidence?.market) {
    const items: SnapshotItem[] = [
      { label: "Chain", value: chainDisplayName(evidence.chain) },
    ];
    if (evidence.market.priceUsd !== undefined) {
      items.push({
        label: "Price",
        value: formatTokenPrice(evidence.market.priceUsd),
      });
    }
    if (evidence.market.liquidityUsd !== undefined) {
      items.push({
        label: "Liquidity",
        value: formatUsd(evidence.market.liquidityUsd),
      });
    }
    if (evidence.market.volume24h !== undefined) {
      items.push({
        label: "24h volume",
        value: formatUsd(evidence.market.volume24h),
      });
    }
    if (evidence.holders.totalHolders !== undefined) {
      items.push({
        label: "Holders",
        value: evidence.holders.totalHolders.toLocaleString(),
      });
    }
    if (evidence.holders.top10Concentration !== undefined) {
      items.push({
        label: "Top 10",
        value: formatPercent(evidence.holders.top10Concentration),
      });
    }
    return items.filter((item) => item.value && item.value !== "—");
  }

  return [
    { label: "Chain", value: factValue(memo.keyFacts, "Chain:") },
    { label: "Price", value: factValue(memo.keyFacts, "Price:") },
    {
      label: "Holders",
      value: factValue(memo.keyFacts, "Total holders:"),
    },
    {
      label: "Top 10",
      value: factValue(memo.keyFacts, "Top 10 concentration:"),
    },
    {
      label: "Liquidity",
      value: factValue(memo.keyFacts, "Best-pair liquidity:"),
    },
    { label: "24h volume", value: factValue(memo.keyFacts, "24h volume:") },
  ].filter((item): item is SnapshotItem => Boolean(item.value));
}

export function buildHolderRows(
  memo: TrustMemo,
  evidence?: TokenEvidence,
): {
  rows: FactRow[];
  topHolders: HolderRow[];
  available: boolean;
  error?: string;
} {
  if (evidence) {
    const rows: FactRow[] = [];
    if (evidence.holders.totalHolders !== undefined) {
      rows.push({
        label: "Total holders",
        value: evidence.holders.totalHolders.toLocaleString(),
      });
    }
    if (evidence.holders.top10Concentration !== undefined) {
      rows.push({
        label: "Top 10 concentration",
        value: formatPercent(evidence.holders.top10Concentration),
      });
    }
    if (evidence.holders.top25Concentration !== undefined) {
      rows.push({
        label: "Top 25 concentration",
        value: formatPercent(evidence.holders.top25Concentration),
      });
    }
    const dist = evidence.holders.distribution;
    if (dist && dist.labeledNonWhalePct > 0) {
      rows.push({
        label: "Burn / exchange / LP (top 10)",
        value: `${formatPercent(dist.burnedPct)} / ${formatPercent(dist.exchangePct)} / ${formatPercent(dist.lpPct)}`,
      });
      if (dist.effectiveWhalePct !== undefined) {
        rows.push({
          label: "Effective whale slice",
          value: formatPercent(dist.effectiveWhalePct),
        });
      }
    }
    return {
      rows,
      topHolders: evidence.holders.topHolders.slice(0, 10),
      available: evidence.holders.available,
      // Never leak Solscan / API-key internals into the card.
      error: evidence.holders.available
        ? undefined
        : publicHoldersStatus({
            chain: evidence.chain,
            available: false,
            error: evidence.holders.error,
          }),
    };
  }

  const rows = factsStartingWith(memo.keyFacts, [
    "Total holders:",
    "Top 10 concentration:",
    "Top 25 concentration:",
    "Top-10 labeled non-whale:",
    "Effective whale",
    "Holder data:",
    "Top holders:",
  ]);

  return {
    rows,
    topHolders: [],
    available: rows.length > 0 && !rows.some((r) => r.label === "Holder data"),
  };
}

export function buildContractRows(
  memo: TrustMemo,
  evidence?: TokenEvidence,
): FactRow[] {
  if (evidence) {
    const explorer = evidence.contract.explorerName ?? "Explorer";
    const rows: FactRow[] = [
      { label: "Address", value: evidence.tokenAddress },
      {
        label: `Verified on ${explorer}`,
        value: evidence.contract.verified ? "Yes" : "No",
      },
    ];

    if (evidence.contract.checklist && evidence.contract.checklist.length > 0) {
      for (const item of evidence.contract.checklist) {
        rows.push({
          label: item.label,
          value: checklistValueLabel(item.value),
        });
      }
    } else if (evidence.chain === "sol") {
      rows.push(
        {
          label: "Mint authority",
          value:
            evidence.contract.mintAuthority === null
              ? "Revoked"
              : (evidence.contract.mintAuthority ?? "Unknown"),
        },
        {
          label: "Freeze authority",
          value:
            evidence.contract.freezeAuthority === null
              ? "Revoked"
              : (evidence.contract.freezeAuthority ?? "Unknown"),
        },
      );
    } else {
      rows.push({
        label: "Proxy contract",
        value: evidence.contract.isProxy ? "Yes" : "No",
      });
      if (evidence.contract.implementation) {
        rows.push({
          label: "Implementation",
          value: evidence.contract.implementation,
        });
      }
    }

    if (evidence.contract.compilerVersion) {
      rows.push({
        label: "Compiler",
        value: evidence.contract.compilerVersion,
      });
    }
    if (evidence.contract.solidityClassName) {
      rows.push({
        label: "Solidity class",
        value: evidence.contract.solidityClassName,
      });
    }

    if (evidence.contract.error) {
      rows.push({ label: "Note", value: evidence.contract.error });
    }

    return rows;
  }

  return factsStartingWith(memo.keyFacts, [
    "Token address:",
    "Verified on",
    "Contract checklist:",
    "Mint authority:",
    "Freeze authority:",
    "Proxy contract:",
    "Proxy implementation:",
  ]);
}

export function buildLiquidityRows(
  memo: TrustMemo,
  evidence?: TokenEvidence,
): FactRow[] {
  if (evidence) {
    const rows: FactRow[] = [];
    if (evidence.market.available) {
      rows.push(
        {
          label: "Best-pair liquidity",
          value: formatUsd(evidence.market.liquidityUsd),
        },
        {
          label: "24h volume",
          value: formatUsd(evidence.market.volume24h),
        },
        {
          label: "Active pairs",
          value: String(evidence.market.pairCount),
        },
      );
      if (evidence.market.dexId) {
        rows.push({ label: "Primary DEX", value: evidence.market.dexId });
      }
      if (evidence.market.bestPairAddress) {
        rows.push({
          label: "Best pair",
          value: evidence.market.bestPairAddress,
        });
      }
    } else {
      rows.push({
        label: "Market data",
        value: evidence.market.error ?? "Unavailable",
      });
    }

    const lock = evidence.market.liquidityLock;
    if (lock) {
      rows.push({
        label: "Lock status",
        value:
          lock.status === "unknown"
            ? "Unknown"
            : lock.status.charAt(0).toUpperCase() + lock.status.slice(1),
      });
      rows.push({ label: "Lock detail", value: lock.summary });
      if (lock.provider) {
        rows.push({ label: "Locker", value: lock.provider });
      }
      if (lock.lockedPct !== undefined) {
        rows.push({
          label: "Locked (reported)",
          value: formatPercent(lock.lockedPct),
        });
      }
      if (lock.source) {
        rows.push({ label: "Lock source", value: lock.source });
      }
    }

    return rows;
  }

  return factsStartingWith(memo.keyFacts, [
    "Best-pair liquidity:",
    "24h volume:",
    "Active DEX pairs",
    "Primary DEX:",
    "Liquidity lock:",
    "Market data:",
  ]);
}

export function formatHolderLabel(holder: HolderRow): string {
  const base = formatAddress(holder.address);
  const type = holder.labelType
    ? formatHolderType(holder.labelType)
    : holder.isContract
      ? "contract"
      : undefined;
  const name = holder.label?.trim();
  if (type && name) return `${base} [${type}: ${name}]`;
  if (type) return `${base} [${type}]`;
  if (name) return `${base} (${name})`;
  return base;
}
