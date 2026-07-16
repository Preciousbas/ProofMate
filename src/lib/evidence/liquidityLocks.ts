import { fetchJson } from "../http";
import type { LiquidityLockInfo, LiquidityLockStatus } from "../types";

/**
 * Known LP locker / vault contracts (non-exhaustive).
 * Matching LP-token holders against these is a positive lock signal only —
 * absence never means unlocked.
 */
const KNOWN_LOCKERS: Array<{ address: string; name: string; chains?: string[] }> = [
  // Unicrypt / UNCX (ETH)
  { address: "0x663a5c229c09b049e36dcc11c9d7d10abe9c40c4", name: "Unicrypt", chains: ["eth"] },
  { address: "0xdba68f07d1b7ca219f78ae8582c213d975c25caf", name: "Unicrypt V2", chains: ["eth"] },
  { address: "0x17e68aec305fda09385379883e1a7e0ba27f3bc7", name: "UNCX", chains: ["eth"] },
  // Team Finance
  { address: "0xe2fe530c047f2d85298b07d9333c05737f1435fb", name: "Team Finance", chains: ["eth"] },
  { address: "0x7f8120b5cb9dda3b079141a960f0b0ebd3dfb6c7", name: "Team Finance", chains: ["eth", "bsc", "base"] },
  // PinkSale / DxSale style (common lockers)
  { address: "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe", name: "PinkLock", chains: ["bsc"] },
  { address: "0x7ee058420e5937496f5a2096f04caa7721cf70cc", name: "PinkLock", chains: ["eth", "bsc", "base"] },
  // Mudra / Floki locker
  { address: "0x000c40ce98b91e404b40db092ee2149377eb48ef", name: "Mudra Locker", chains: ["eth", "bsc"] },
];

interface GoPlusLpHolder {
  address?: string;
  tag?: string;
  is_locked?: number | string | boolean;
  percent?: string;
  is_contract?: number | string;
}

interface GoPlusTokenSecurity {
  lp_holders?: GoPlusLpHolder[];
  holder_count?: string;
  is_in_dex?: string;
}

interface GoPlusResponse {
  code?: number;
  message?: string;
  result?: Record<string, GoPlusTokenSecurity>;
}

/** GoPlus chain ids for their token_security endpoint. */
const GOPLUS_CHAIN: Record<string, string> = {
  eth: "1",
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  optimism: "10",
  polygon: "137",
  avalanche: "43114",
};

function unknownLock(reason: string): LiquidityLockInfo {
  return {
    status: "unknown",
    summary:
      "Liquidity lock status unknown — no reliable lock signal from public sources for this pair.",
    evidence: reason,
  };
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

function parsePct(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  // GoPlus often uses 0–1 fractions
  return n <= 1 ? n * 100 : n;
}

/**
 * Best-effort LP lock detection.
 * Sources: GoPlus token_security (free, optional) + known locker address matches
 * when LP holder tags are present. Never invents a locked/unlocked status.
 */
export async function detectLiquidityLock(options: {
  tokenAddress: string;
  chain: string;
  pairAddress?: string;
}): Promise<LiquidityLockInfo> {
  const { tokenAddress, chain, pairAddress } = options;
  const goplusChain = GOPLUS_CHAIN[chain];

  if (!goplusChain) {
    return unknownLock(
      pairAddress
        ? `No lock oracle wired for ${chain}; pair ${pairAddress}`
        : `No lock oracle wired for ${chain}`,
    );
  }

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusChain}?contract_addresses=${encodeURIComponent(tokenAddress.toLowerCase())}`;
    const data = await fetchJson<GoPlusResponse>(url);
    const row =
      data.result?.[tokenAddress.toLowerCase()] ??
      data.result?.[Object.keys(data.result ?? {})[0] ?? ""];

    if (!row) {
      return unknownLock(
        data.message
          ? `GoPlus: ${data.message}`
          : "GoPlus returned no token_security row",
      );
    }

    const lpHolders = row.lp_holders ?? [];
    if (lpHolders.length === 0) {
      return unknownLock("GoPlus returned no LP holders to inspect for locks");
    }

    let lockedPct = 0;
    let unlockedPct = 0;
    let provider: string | undefined;
    const evidenceBits: string[] = [];

    for (const holder of lpHolders) {
      const pct = parsePct(holder.percent) ?? 0;
      const addr = (holder.address ?? "").toLowerCase();
      const tag = holder.tag?.trim();
      const known = KNOWN_LOCKERS.find(
        (locker) =>
          locker.address === addr &&
          (!locker.chains || locker.chains.includes(chain)),
      );
      const locked = toBool(holder.is_locked) || Boolean(known);

      if (locked) {
        lockedPct += pct;
        const name = known?.name || tag || "locker";
        provider = provider ?? name;
        evidenceBits.push(
          `${(pct).toFixed(1)}% via ${name}${tag && tag !== name ? ` (${tag})` : ""}`,
        );
      } else {
        unlockedPct += pct;
      }
    }

    lockedPct = Math.round(lockedPct * 10) / 10;
    unlockedPct = Math.round(unlockedPct * 10) / 10;

    if (lockedPct <= 0 && unlockedPct <= 0) {
      return unknownLock("LP holders present but lock flags were empty");
    }

    let status: LiquidityLockStatus;
    if (lockedPct >= 90) status = "locked";
    else if (lockedPct >= 20) status = "partial";
    else if (unlockedPct > 0 && lockedPct < 5) status = "unlocked";
    else status = "unknown";

    if (status === "unknown") {
      return unknownLock(
        `Ambiguous LP lock signal (locked≈${lockedPct}%, other≈${unlockedPct}%)`,
      );
    }

    const summary =
      status === "locked"
        ? `Most LP appears locked${provider ? ` via ${provider}` : ""} (~${lockedPct.toFixed(0)}%).`
        : status === "partial"
          ? `Some LP appears locked${provider ? ` via ${provider}` : ""} (~${lockedPct.toFixed(0)}%); the rest may be unlocked.`
          : `LP holders do not show a meaningful lock (~${lockedPct.toFixed(0)}% flagged locked).`;

    return {
      status,
      summary,
      provider,
      lockedPct: lockedPct > 0 ? lockedPct : undefined,
      source: "GoPlus token_security",
      evidence:
        evidenceBits.slice(0, 4).join("; ") ||
        `locked≈${lockedPct}% unlocked≈${unlockedPct}%`,
    };
  } catch (error) {
    return unknownLock(
      error instanceof Error ? error.message : "Lock lookup failed",
    );
  }
}
