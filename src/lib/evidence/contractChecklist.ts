import type { ChecklistValue, ContractChecklistItem } from "../types";

export interface ContractSourceInput {
  verified: boolean;
  isProxy: boolean;
  implementation?: string;
  sourceCode?: string;
  abi?: string;
  solidityClassName?: string;
  /** Solana */
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  chain?: string;
}

interface FeatureHit {
  present: boolean;
  detail?: string;
}

function sourceBundle(input: ContractSourceInput): string {
  const parts = [input.sourceCode ?? "", input.abi ?? "", input.solidityClassName ?? ""];
  return parts.join("\n").toLowerCase();
}

function hasAny(haystack: string, needles: string[]): FeatureHit {
  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) {
      return { present: true, detail: `Matched \`${needle}\` in verified source/ABI` };
    }
  }
  return { present: false };
}

function ownershipRenounced(haystack: string, source: string): ChecklistValue {
  // Strong signals first
  if (
    /owner\s*=\s*address\s*\(\s*0\s*\)/.test(source) ||
    /_owner\s*=\s*address\s*\(\s*0\s*\)/.test(source) ||
    /renounceownership\s*\(/.test(haystack)
  ) {
    // Presence of renounceOwnership alone ≠ renounced; look for zero-owner assignments in constructors / comments is weak.
    // Prefer: Ownable with owner() returning zero is not available without eth_call.
    // Heuristic: only "yes" if source clearly sets owner to address(0) permanently.
    if (
      /(?:owner|_owner)\s*=\s*address\s*\(\s*0\s*\)/.test(source) &&
      !/transferownership/.test(haystack)
    ) {
      return "yes";
    }
  }
  if (/onlyowner/.test(haystack) || /function\s+owner\s*\(/.test(haystack)) {
    return "no";
  }
  if (/ownable|accesscontrol|ownable2step/.test(haystack)) {
    return "no";
  }
  return "unknown";
}

function detectMint(haystack: string): FeatureHit {
  return hasAny(haystack, [
    "function mint(",
    "function mintto(",
    "_mint(",
    "mint(address",
    '"name":"mint"',
  ]);
}

function detectBlacklist(haystack: string): FeatureHit {
  return hasAny(haystack, [
    "blacklist",
    "isblacklisted",
    "addblacklist",
    "blacklisted",
    "banned",
    "blocklist",
  ]);
}

function detectPause(haystack: string): FeatureHit {
  return hasAny(haystack, [
    "pausable",
    "function pause(",
    "whennotpaused",
    "whenpaused",
    "_pause(",
    '"name":"pause"',
  ]);
}

function detectTax(haystack: string): FeatureHit {
  return hasAny(haystack, [
    "takefee",
    "transferfee",
    "buytax",
    "selltax",
    "taxfee",
    "marketingfee",
    "liquidityfee",
    "reflectionfee",
    "totalfee",
    "_tax",
    "settaxes",
    "setfee",
  ]);
}

function detectMaxWallet(haystack: string): FeatureHit {
  return hasAny(haystack, [
    "maxwallet",
    "maxtransaction",
    "maxtx",
    "maxamount",
    "antiwhale",
    "maxhold",
    "_maxwallet",
  ]);
}

function item(
  id: string,
  label: string,
  value: ChecklistValue,
  detail?: string,
): ContractChecklistItem {
  return { id, label, value, detail };
}

/**
 * Build a short yes/no/unknown checklist from verified source/ABI (EVM)
 * or mint/freeze authorities (Solana). Never invent when source is missing.
 */
export function buildContractChecklist(
  input: ContractSourceInput,
): ContractChecklistItem[] {
  if (input.chain === "sol") {
    const mint = input.mintAuthority;
    const freeze = input.freezeAuthority;
    return [
      item(
        "mint_authority",
        "Mint authority active",
        mint === null ? "no" : mint === undefined ? "unknown" : "yes",
        mint === null
          ? "Mint authority revoked"
          : mint
            ? `Mint authority: ${mint}`
            : "Mint authority not available",
      ),
      item(
        "freeze_authority",
        "Freeze authority active",
        freeze === null ? "no" : freeze === undefined ? "unknown" : "yes",
        freeze === null
          ? "Freeze authority revoked"
          : freeze
            ? `Freeze authority: ${freeze}`
            : "Freeze authority not available",
      ),
      item(
        "upgradeable",
        "Upgradeable proxy",
        "no",
        "Solana SPL mints are not EVM proxies",
      ),
    ];
  }

  if (!input.verified || (!input.sourceCode && !input.abi)) {
    return [
      item(
        "verified",
        "Source verified",
        input.verified ? "yes" : "no",
        input.verified
          ? "Verified, but source/ABI text wasn’t returned for deeper checks"
          : "Unverified — checklist items stay unknown",
      ),
      item("upgradeable", "Upgradeable / proxy", input.isProxy ? "yes" : "unknown", input.isProxy
        ? input.implementation
          ? `Proxy implementation: ${input.implementation}`
          : "Proxy flag set"
        : "Need verified source to confirm upgrade paths"),
      item("ownership_renounced", "Ownership renounced", "unknown"),
      item("mint", "Mint function", "unknown"),
      item("blacklist", "Blacklist / ban", "unknown"),
      item("pause", "Pause trading", "unknown"),
      item("tax", "Transfer tax / fees", "unknown"),
      item("max_wallet", "Max wallet / anti-whale", "unknown"),
    ];
  }

  const haystack = sourceBundle(input);
  const sourceRaw = (input.sourceCode ?? "").toLowerCase();
  const mint = detectMint(haystack);
  const blacklist = detectBlacklist(haystack);
  const pause = detectPause(haystack);
  const tax = detectTax(haystack);
  const maxWallet = detectMaxWallet(haystack);
  const renounced = ownershipRenounced(haystack, sourceRaw);

  const upgradeable: ChecklistValue = input.isProxy
    ? "yes"
    : hasAny(haystack, [
        "upgradeable",
        "uupsUpgradeable",
        "transparentUpgradeableProxy",
        "delegatecall",
        "proxiableuuid",
      ]).present
      ? "yes"
      : "no";

  return [
    item(
      "verified",
      "Source verified",
      "yes",
      input.solidityClassName
        ? `Class: ${input.solidityClassName}`
        : "Source available on explorer",
    ),
    item(
      "upgradeable",
      "Upgradeable / proxy",
      upgradeable,
      input.isProxy
        ? input.implementation
          ? `Proxy → ${input.implementation}`
          : "Proxy flag set"
        : upgradeable === "yes"
          ? "Upgrade patterns found in source"
          : "No proxy/upgrade pattern spotted in verified source",
    ),
    item(
      "ownership_renounced",
      "Ownership renounced",
      renounced,
      renounced === "yes"
        ? "Owner appears set to address(0) in source"
        : renounced === "no"
          ? "Ownable / onlyOwner patterns present"
          : "Could not determine owner status from source alone",
    ),
    item(
      "mint",
      "Mint function",
      mint.present ? "yes" : "no",
      mint.detail ?? "No mint-style function spotted in verified source/ABI",
    ),
    item(
      "blacklist",
      "Blacklist / ban",
      blacklist.present ? "yes" : "no",
      blacklist.detail ?? "No blacklist-style symbols spotted",
    ),
    item(
      "pause",
      "Pause trading",
      pause.present ? "yes" : "no",
      pause.detail ?? "No pause/pausable symbols spotted",
    ),
    item(
      "tax",
      "Transfer tax / fees",
      tax.present ? "yes" : "no",
      tax.detail ?? "No fee/tax symbols spotted",
    ),
    item(
      "max_wallet",
      "Max wallet / anti-whale",
      maxWallet.present ? "yes" : "no",
      maxWallet.detail ?? "No max-wallet symbols spotted",
    ),
  ];
}

export function checklistValueLabel(value: ChecklistValue): string {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  return "Unknown";
}
