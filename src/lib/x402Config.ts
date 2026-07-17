/** USD price charged per paid skill call (must match ASP listing fee). */
export const X402_PRICE = "$0.01";

/** Human fee string for listing / discovery metadata. */
export const X402_FEE_USDT = "0.01";

const DEFAULT_NETWORK = "eip155:196"; // X Layer mainnet

export function getX402Network(): string {
  return process.env.X402_NETWORK?.trim() || DEFAULT_NETWORK;
}

export function getPayToAddress(): string | null {
  const raw =
    process.env.PAY_TO_ADDRESS?.trim() || process.env.PAY_TO?.trim() || "";
  return raw || null;
}

export function getX402Price(): string {
  return process.env.X402_PRICE?.trim() || X402_PRICE;
}

/**
 * True when OKX facilitator credentials + payee are present.
 * Without these, skill routes fall back to PROOFMATE_API_KEY (or open locally).
 */
export function isX402Configured(): boolean {
  return Boolean(
    process.env.OKX_API_KEY?.trim() &&
      process.env.OKX_SECRET_KEY?.trim() &&
      process.env.OKX_PASSPHRASE?.trim() &&
      getPayToAddress(),
  );
}
