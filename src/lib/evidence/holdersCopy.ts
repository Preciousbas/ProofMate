/**
 * User-facing copy when holder distribution couldn't be loaded.
 * Never mention API keys, Solscan Pro, or provider wiring gaps.
 */

export const HOLDERS_NO_EVIDENCE = "Couldn't get holders";

/** True when an internal error must not be shown to the user. */
export function isInternalHoldersError(error?: string): boolean {
  if (!error) return false;
  return /solscan|SOLSCAN|api.?key|holder feed|pro-api|pro api/i.test(error);
}

/**
 * Public holders status line for memos / cards / reports.
 * Solana missing data → short neutral copy (never leak Pro/API hints).
 */
export function publicHoldersStatus(options: {
  chain?: string;
  available: boolean;
  error?: string;
}): string {
  if (options.available) return "";
  if (options.chain === "sol" || isInternalHoldersError(options.error)) {
    return HOLDERS_NO_EVIDENCE;
  }
  if (options.error && !isInternalHoldersError(options.error)) {
    return "Couldn't get holders";
  }
  return HOLDERS_NO_EVIDENCE;
}
