import { ETH_ADDRESS_REGEX, SOLANA_ADDRESS_REGEX } from "./constants";

export function isEvmAddress(input: string): boolean {
  return ETH_ADDRESS_REGEX.test(input.trim());
}

export function isSolanaAddress(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.startsWith("0x")) return false;
  return SOLANA_ADDRESS_REGEX.test(trimmed);
}

/** Preserve Solana base58 case; lowercase EVM hex. */
export function normalizeTokenAddress(input: string): string {
  const trimmed = input.trim();
  if (isEvmAddress(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}

/**
 * Compare token addresses correctly per chain family.
 * EVM is case-insensitive; Solana base58 is case-sensitive.
 */
export function addressesEqual(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (isEvmAddress(left) && isEvmAddress(right)) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

export function isValidTokenAddress(input: string): boolean {
  const trimmed = input.trim();
  return isEvmAddress(trimmed) || isSolanaAddress(trimmed);
}

/** Ticker-like: PEPE, USDC, CASHCAT — not a sentence. */
export function isTickerQuery(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 12) return false;
  if (trimmed.includes(" ")) return false;
  if (trimmed.startsWith("0x")) return false;
  if (isSolanaAddress(trimmed)) return false;
  return /^[A-Za-z][A-Za-z0-9.]{0,11}$/.test(trimmed);
}

export function formatAddress(address: string, chars = 6): string {
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function formatUsd(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

/** Token unit price — keeps enough decimals for meme coins like PEPE */
export function formatTokenPrice(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toPrecision(4)}`;
}

export function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

export function parseUserInput(
  raw: string,
  options?: { allowTicker?: boolean },
): {
  type: "token" | "ticker" | "follow_up" | "invalid";
  value: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "invalid", value: "" };

  const evmMatch = trimmed.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch && isEvmAddress(evmMatch[0])) {
    return { type: "token", value: normalizeTokenAddress(evmMatch[0]) };
  }

  if (isValidTokenAddress(trimmed)) {
    return { type: "token", value: normalizeTokenAddress(trimmed) };
  }

  if (options?.allowTicker !== false && isTickerQuery(trimmed)) {
    return { type: "ticker", value: trimmed.toUpperCase() };
  }

  return { type: "follow_up", value: trimmed };
}
