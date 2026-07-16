import { addressesEqual, isEvmAddress } from "../validation";
import type {
  HolderDistributionAggregates,
  HolderLabelType,
  TopHolder,
} from "../types";

/** Well-known dead / burn destinations (EVM). */
const EVM_BURN_ADDRESSES = new Set(
  [
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    "0x0000000000000000000000000000000000000001",
    "0x000000000000000000000000000000000000dEaD",
    "0xdead000000000000000042069420694206942069",
    "0x0000000000000000000000000000000000000369",
  ].map((a) => a.toLowerCase()),
);

/** Common Solana burn / null destinations. */
const SOL_BURN_ADDRESSES = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "11111111111111111111111111111111",
]);

const EXCHANGE_PATTERNS: RegExp[] = [
  /\bbinance\b/i,
  /\bcoinbase\b/i,
  /\bkraken\b/i,
  /\bokx\b/i,
  /\bbybit\b/i,
  /\bkucoin\b/i,
  /\bhuobi\b/i,
  /\bhtx\b/i,
  /\bgate\.?io\b/i,
  /\bbitfinex\b/i,
  /\bcrypto\.?com\b/i,
  /\bgemini\b/i,
  /\bmexc\b/i,
  /\bbitget\b/i,
  /\bupbit\b/i,
  /\bbithumb\b/i,
  /\bbittrex\b/i,
  /\bpoloniex\b/i,
  /\bbitstamp\b/i,
  /\bftx\b/i,
  /\bcxb\b/i,
  /\bbinstrader\b/i,
  /\bhot\s*wallet\b/i,
  /\bcold\s*wallet\b/i,
  /\bexchange\b/i,
  /\bcustod(y|ial)\b/i,
];

const LP_PATTERNS: RegExp[] = [
  /\buniswap\b/i,
  /\bsushiswap\b/i,
  /\bpancake\b/i,
  /\baerodrome\b/i,
  /\bvelodrome\b/i,
  /\bcurve\b/i,
  /\bbalancer\b/i,
  /\btrader\s*joe\b/i,
  /\braydium\b/i,
  /\borca\b/i,
  /\bliquidity\b/i,
  /\b\blp\b/i,
  /\bpool\b/i,
  /\bpair\b/i,
  /\bv2\s*pool\b/i,
  /\bv3\s*pool\b/i,
];

const TEAM_PATTERNS: RegExp[] = [
  /\bteam\b/i,
  /\btreasury\b/i,
  /\bfoundation\b/i,
  /\bmultisig\b/i,
  /\bvesting\b/i,
  /\bdeployer\b/i,
  /\bdeveloper\b/i,
  /\badmin\b/i,
  /\bdao\b/i,
  /\breserve\b/i,
];

const BURN_PATTERNS: RegExp[] = [
  /\bburn\b/i,
  /\bdead\b/i,
  /\bnull\s*address\b/i,
  /\bblack\s*hole\b/i,
];

const LABEL_NOTES: Record<HolderLabelType, string> = {
  burn: "Burn / dead address. Usually not a sellable whale.",
  exchange: "Exchange / custody wallet. Dumps look different from a single whale.",
  lp: "DEX liquidity pool. Held for trading, not private ownership.",
  contract: "On-chain contract. Check what it does before treating it as a whale.",
  team: "Team / treasury style label. Still concentrated, often intentional.",
  unknown: "Unlabeled wallet. Treat as a potential whale until you know better.",
};

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function isBurnAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  if (isEvmAddress(trimmed)) {
    return EVM_BURN_ADDRESSES.has(trimmed.toLowerCase());
  }
  return SOL_BURN_ADDRESSES.has(trimmed);
}

function isPairAddress(
  address: string,
  pairAddresses: string[] | undefined,
): boolean {
  if (!pairAddresses?.length) return false;
  return pairAddresses.some((pair) => addressesEqual(pair, address));
}

/**
 * Classify a single holder from API labels + heuristics.
 * Prefer structured API text, then address heuristics, then isContract.
 */
export function classifyHolder(
  holder: Pick<TopHolder, "address" | "label" | "isContract" | "labelType">,
  pairAddresses?: string[],
): { labelType: HolderLabelType; label?: string; labelNote: string } {
  if (holder.labelType && holder.labelType !== "unknown") {
    return {
      labelType: holder.labelType,
      label: holder.label,
      labelNote: LABEL_NOTES[holder.labelType],
    };
  }

  const rawLabel = holder.label?.trim() || "";
  const address = holder.address.trim();

  if (isBurnAddress(address) || (rawLabel && matchesAny(rawLabel, BURN_PATTERNS))) {
    return {
      labelType: "burn",
      label: rawLabel || "Burn address",
      labelNote: LABEL_NOTES.burn,
    };
  }

  if (isPairAddress(address, pairAddresses)) {
    return {
      labelType: "lp",
      label: rawLabel || "DEX LP pair",
      labelNote: LABEL_NOTES.lp,
    };
  }

  if (rawLabel && matchesAny(rawLabel, EXCHANGE_PATTERNS)) {
    return {
      labelType: "exchange",
      label: rawLabel,
      labelNote: LABEL_NOTES.exchange,
    };
  }

  if (rawLabel && matchesAny(rawLabel, LP_PATTERNS)) {
    return {
      labelType: "lp",
      label: rawLabel,
      labelNote: LABEL_NOTES.lp,
    };
  }

  if (rawLabel && matchesAny(rawLabel, TEAM_PATTERNS)) {
    return {
      labelType: "team",
      label: rawLabel,
      labelNote: LABEL_NOTES.team,
    };
  }

  if (holder.isContract === true) {
    return {
      labelType: "contract",
      label: rawLabel || "Contract",
      labelNote: LABEL_NOTES.contract,
    };
  }

  return {
    labelType: "unknown",
    label: rawLabel || undefined,
    labelNote: LABEL_NOTES.unknown,
  };
}

export function enrichTopHolders(
  holders: TopHolder[],
  pairAddresses?: string[],
): TopHolder[] {
  return holders.map((holder) => {
    const classified = classifyHolder(holder, pairAddresses);
    return {
      ...holder,
      label: classified.label ?? holder.label,
      labelType: classified.labelType,
      labelNote: classified.labelNote,
    };
  });
}

function sumByType(
  holders: TopHolder[],
  type: HolderLabelType,
): number {
  return holders
    .filter((h) => (h.labelType ?? "unknown") === type)
    .reduce((sum, h) => sum + (Number.isFinite(h.percentage) ? h.percentage : 0), 0);
}

/**
 * Aggregate labeled supply among the provided top holders (usually top 10).
 * Effective whale % uses top10Concentration when provided so it stays consistent
 * with Moralis summary stats.
 */
export function buildHolderAggregates(
  topHolders: TopHolder[],
  top10Concentration?: number,
): HolderDistributionAggregates | undefined {
  if (topHolders.length === 0) return undefined;

  const slice = topHolders.slice(0, 10);
  const burnedPct = round1(sumByType(slice, "burn"));
  const exchangePct = round1(sumByType(slice, "exchange"));
  const lpPct = round1(sumByType(slice, "lp"));
  const contractPct = round1(sumByType(slice, "contract"));
  const teamPct = round1(sumByType(slice, "team"));
  const unknownPct = round1(sumByType(slice, "unknown"));
  const labeledNonWhalePct = round1(burnedPct + exchangePct + lpPct);

  const top10 =
    top10Concentration ??
    round1(slice.reduce((sum, h) => sum + h.percentage, 0));

  const effectiveWhalePct =
    top10 !== undefined
      ? round1(Math.max(0, top10 - labeledNonWhalePct))
      : undefined;

  return {
    burnedPct,
    exchangePct,
    lpPct,
    contractPct,
    teamPct,
    unknownPct,
    labeledNonWhalePct,
    effectiveWhalePct,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** True when burn/exchange/LP dominate the top-10 enough to soften concentration flags. */
export function shouldSoftenForLabeledNonWhales(
  distribution: HolderDistributionAggregates | undefined,
  top10Concentration: number | undefined,
): boolean {
  if (!distribution || top10Concentration === undefined) return false;
  if (top10Concentration < 30) return false;
  // Soften when ≥55% of the top-10 slice is labeled non-whale, or effective whales < 25%.
  if (distribution.labeledNonWhalePct >= 55) return true;
  if (
    distribution.effectiveWhalePct !== undefined &&
    distribution.effectiveWhalePct < 25 &&
    distribution.labeledNonWhalePct >= 35
  ) {
    return true;
  }
  return false;
}

export function formatHolderType(type: HolderLabelType | undefined): string {
  switch (type) {
    case "burn":
      return "burn";
    case "exchange":
      return "exchange";
    case "lp":
      return "LP";
    case "contract":
      return "contract";
    case "team":
      return "team";
    default:
      return "unknown";
  }
}
