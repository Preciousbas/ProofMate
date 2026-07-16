/**
 * Plain confirmation after the user picks a token (or both sides of a compare).
 */

export interface UsingTokenRef {
  symbol: string;
  chainLabel: string;
}

/** Single pick: “Using USDC on Ethereum.” */
export function formatUsingSingle(token: UsingTokenRef): string {
  return `Using ${token.symbol} on ${token.chainLabel}.`;
}

/**
 * Compare picks:
 * - different chains → “Using USDC on Ethereum and CASHCAT on Solana.”
 * - same chain → “Using USDC and CASHCAT on Ethereum.”
 */
export function formatUsingCompare(
  left: UsingTokenRef,
  right: UsingTokenRef,
): string {
  if (left.chainLabel === right.chainLabel) {
    return `Using ${left.symbol} and ${right.symbol} on ${left.chainLabel}.`;
  }
  return `Using ${left.symbol} on ${left.chainLabel} and ${right.symbol} on ${right.chainLabel}.`;
}
