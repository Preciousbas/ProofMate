/**
 * Short, product-grounded answers for definitional questions that don't
 * need an analyzed token session (e.g. "what does verified mean?").
 */

export interface GlossaryEntry {
  id: string;
  /** Match against lowercased trimmed input */
  match: (q: string) => boolean;
  answer: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "verified",
    match: (q) =>
      /what does verified mean/.test(q) ||
      /what(?:'s| is) (?:a )?verified (?:contract|source|code)/.test(q) ||
      /explain verified/.test(q) ||
      /meaning of verified/.test(q),
    answer: [
      "Verified usually means the contract source is published and matched on a block explorer (Etherscan and similar).",
      "On Solana, ProofMate only treats Verified as Yes for a Solscan curated listing (or WSOL), not just because mint and freeze are revoked.",
      "Verified isn't the same as safe. Plenty of risky tokens are verified. Unverified just makes the code harder to check from here.",
    ].join("\n\n"),
  },
  {
    id: "liquidity",
    match: (q) =>
      /what does liquidity mean/.test(q) ||
      /what(?:'s| is) (?:dex )?liquidity/.test(q) ||
      /explain liquidity/.test(q),
    answer: [
      "Liquidity is how much capital sits in the DEX pool(s) trading this token.",
      "Thin liquidity means small buys or sells can move the price a lot, and exits can get costly. Deeper liquidity usually makes pricing steadier — it’s still not a safety stamp.",
    ].join("\n\n"),
  },
  {
    id: "holders",
    match: (q) =>
      /what does (?:holder|holders|concentration) mean/.test(q) ||
      /what(?:'s| is) holder concentration/.test(q) ||
      /explain (?:top )?holders/.test(q),
    answer: [
      "Holder concentration is how much of the supply sits in the largest wallets.",
      "If a few addresses own most of it, they can dump or move price hard. Exchange, LP, or burn wallets can look concentrated for boring reasons — I label those when I can, then show an “effective whale” slice after taking burn/exchange/LP out.",
    ].join("\n\n"),
  },
  {
    id: "liquidity-lock",
    match: (q) =>
      /what does (?:liquidity |lp )?lock mean/.test(q) ||
      /what(?:'s| is) (?:a )?(?:liquidity |lp )?lock/.test(q) ||
      /explain (?:liquidity |lp )?lock/.test(q),
    answer: [
      "A liquidity lock means LP tokens sit in a locker contract (Unicrypt, Team Finance, and similar) for a while so the pool can’t be pulled instantly.",
      "I only report lock status when a public source makes it findable. Unknown isn’t the same as unlocked — check the locker site yourself if it matters.",
    ].join("\n\n"),
  },
  {
    id: "contract-checklist",
    match: (q) =>
      /what does (?:the )?checklist mean/.test(q) ||
      /what(?:'s| is) (?:the )?contract checklist/.test(q) ||
      /explain (?:contract )?checklist/.test(q),
    answer: [
      "The contract checklist is a short yes/no/unknown list from verified source or ABI — upgradeable, ownership renounced, mint, blacklist, pause, tax, max wallet, and so on.",
      "Unknown means I couldn’t confirm it from public verified data. Yes or no still isn’t a full audit.",
    ].join("\n\n"),
  },
  {
    id: "risk-score",
    match: (q) =>
      /what does (?:the )?risk score mean/.test(q) ||
      /what(?:'s| is) (?:a |the )?risk score/.test(q) ||
      /explain (?:the )?risk score/.test(q),
    answer: [
      "The risk score is my 0–100 caution meter from public data — contract checks, holders, and market signals. It’s not a price prediction.",
      "Higher just means more reasons to dig deeper. I won’t call a token “safe” or a “scam.”",
    ].join("\n\n"),
  },
  {
    id: "proxy",
    match: (q) =>
      /what does proxy mean/.test(q) ||
      /what(?:'s| is) (?:a )?proxy (?:contract)?/.test(q) ||
      /explain proxy/.test(q),
    answer: [
      "A proxy contract forwards calls to a separate implementation. Admins can often upgrade that logic later.",
      "Proxies are common for majors and upgradeable apps. On unknown tokens, that upgradeability means the rules can change after someone buys in.",
    ].join("\n\n"),
  },
];

/** Returns a glossary answer when the message is clearly definitional. */
export function answerGlossaryQuestion(raw: string): string | null {
  const q = raw.trim().toLowerCase().replace(/\?+$/, "").trim();
  if (!q) return null;
  for (const entry of GLOSSARY) {
    if (entry.match(q)) return entry.answer;
  }
  return null;
}
