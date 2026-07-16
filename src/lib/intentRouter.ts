import { answerGlossaryQuestion } from "./glossary";
import type { ChatMessage } from "./types";
import {
  addressesEqual,
  isTickerQuery,
  isValidTokenAddress,
  normalizeTokenAddress,
  parseUserInput,
} from "./validation";

export type TokenMention = {
  kind: "token" | "ticker";
  value: string;
  chainId?: string;
};

export type RoutedIntent =
  | { type: "analyze_token"; address: string }
  | { type: "analyze_ticker"; ticker: string }
  | { type: "follow_up"; question: string }
  /** Layer 3 — side-by-side with another token (requires an active session). */
  | { type: "compare"; target: TokenMention }
  /**
   * Layer 3 — free-form A vs B (no session required).
   * e.g. “how PEPE fares against DOGE”, “compare SHIB to PEPE”.
   */
  | { type: "compare_pair"; left: TokenMention; right: TokenMention }
  /** Layer 3 — `/compare` or “Compare with…” without a second token yet. */
  | { type: "compare_prompt" }
  /** Layer 3 — long research report from the active session. */
  | { type: "full_report" }
  | { type: "general"; answer: string }
  | { type: "invalid"; reason: string };

export interface RouteContext {
  /** Conversation turns already on screen (may include the new user message). */
  messages?: ChatMessage[];
  hasSession: boolean;
  /** Active token label from the current trust memo / evidence, if any. */
  activeSymbol?: string;
  activeName?: string;
  activeAddress?: string;
  activeChain?: string;
}

const ANALYZE_PREFIX =
  /^(?:tell me about|tell me more about|what(?:'s| is| about)|whats|check(?: out)?|analyze|analyse|look(?:ing)? (?:at|into)|research|investigate|review|break down|how (?:is|about)|info on|details on)\s+/i;

const NEW_TOPIC_PREFIX =
  /^(?:now |instead |also )?(?:analyze|analyse|check|look at|research)\s+/i;

/**
 * Casual “new token” openers that don’t fit ANALYZE_PREFIX but still name a
 * different asset (Twitter chatter, hallway question, etc.).
 */
const CASUAL_TOKEN_PREFIX =
  /^(?:have you )?heard (?:about|of)\s+(?:that\s+)?|^(?:any thoughts on|thoughts on|know about|know of)\s+(?:that\s+)?/i;

/** Classic peer phrases relative to an active token (“compare to DOGE”). */
const COMPARE_RE =
  /\b(?:compare(?:\s+(?:it|this|them))?\s+(?:to|with|against)|compared?\s+to|vs\.?|versus)\b/i;

/**
 * Broad “this is a comparison” cue — includes A-vs-B and “fares against”.
 * Used before single-token analyze so free-form compare wins.
 */
const COMPARE_CUE_RE =
  /\b(?:compar(?:e|es|ed|ing)|vs\.?|versus|fares?\s+against|fare\s+against|stack(?:s|ed)?\b)/i;

/** Split sides of an A-vs-B utterance. */
const COMPARE_SPLIT_RE =
  /\b(?:vs\.?|versus|fares?\s+against|fare\s+against|up\s+against|compared?\s+(?:to|with|against)|compares?\s+(?:to|with|against))\b/i;

/**
 * “compare A to B” / “how will you compare A to B” — A sits between
 * compare and the preposition (unlike COMPARE_RE’s peer-only forms).
 */
const COMPARE_A_TO_B_RE =
  /\bcompar(?:e|es|ed|ing)\s+(?:(?:it|this|them)\s+)?(.+?)\s+(?:to|with|against)\s+(.+?)$/i;

/** “tell me how A fares against B” / “how does A fare against B”. */
const FARES_AGAINST_RE =
  /\b(?:tell\s+me\s+)?how\s+(?:(?:does|do|will|would|can|could)\s+(?:\w+\s+){0,3})?(.+?)\s+fares?\s+against\s+(.+?)$/i;

/** “stack A up against B”. */
const STACK_UP_AGAINST_RE =
  /\bstack(?:s|ed)?\s+(.+?)\s+up\s+against\s+(.+?)$/i;

/** Explicit Layer 3 slash command: `/compare` or `/compare PEPE`. */
const COMPARE_SLASH_RE = /^\/compare(?:\s+(.+))?$/i;

/**
 * Explicit Layer 3 full-report triggers — kept out of the default analyze path.
 * Matches “Generate full report”, “full report”, “AI research report”, etc.
 */
const FULL_REPORT_RE =
  /^(?:generate\s+)?(?:(?:a|the|an)\s+)?(?:full(?:\s+research)?|ai\s+research)\s+report\.?$/i;

const FOLLOW_UP_HINT =
  /\b(?:holder|holders|liquidity|volume|market|contract|verified|proxy|score|risk|why|supply|concentration|who holds|flag|red flag)\b/i;

/** Words that look ticker-shaped but are research topics, not symbols. */
const RESERVED_TICKERS = new Set([
  "HOLDER",
  "HOLDERS",
  "LIQUIDITY",
  "VOLUME",
  "MARKET",
  "CONTRACT",
  "VERIFIED",
  "PROXY",
  "SCORE",
  "RISK",
  "SUPPLY",
  "CONCENTRATION",
  "FLAG",
  "FLAGS",
  "MEMO",
  "TOKEN",
  "COIN",
  "CHAIN",
  "LIKE",
  "PLEASE",
  "THIS",
  "THAT",
  "THEM",
  "WHAT",
  "ABOUT",
  // Conversational / English fillers that pass isTickerQuery
  "HAVE",
  "YOU",
  "HEARD",
  "THE",
  "AND",
  "OR",
  "FOR",
  "FROM",
  "WITH",
  "INTO",
  "OVER",
  "UNDER",
  "JUST",
  "MORE",
  "SOME",
  "ANY",
  "NEW",
  "OLD",
  "NOW",
  "THEN",
  "HERE",
  "THERE",
  "WHEN",
  "WHERE",
  "WHICH",
  "WHO",
  "HOW",
  "WHY",
  "DOES",
  "DID",
  "DOING",
  "MAKING",
  "ROUNDS",
  "TWITTER",
  "DISCORD",
  "TELEGRAM",
  "REDDIT",
  "LOOKING",
  "STILL",
  "ALSO",
  "VERY",
  "REALLY",
  "MUCH",
  "MANY",
  "BEEN",
  "BEING",
  "WILL",
  "WOULD",
  "COULD",
  "SHOULD",
  "MIGHT",
  "SEEMS",
  "SEEM",
  "LOOKS",
  "THINK",
  "THOUGHTS",
  "KNOW",
  "KNOWN",
  "CALLED",
  "NAMED",
  "GOING",
  "COMING",
  "AROUND",
  "AGAIN",
  "SAFE",
  "SCAM",
  "RUG",
  "HYPE",
  "PUMP",
  "DUMP",
  "LOW",
  "HIGH",
  "TOP",
  "BEST",
  "WORST",
  "BIG",
  "SMALL",
  "GOOD",
  "BAD",
  "IS",
  "ARE",
  "WAS",
  "WERE",
  "HAS",
  "HAD",
  "NOT",
  "YES",
  "NO",
  "OFF",
  "OUT",
  "ALL",
  "COMPARE",
  "COMPARES",
  "COMPARED",
  "COMPARING",
  "AGAINST",
  "VERSUS",
  "FARES",
  "FARE",
  "STACK",
  "STACKS",
  "STACKED",
  // Prepositions that leak into “compare to DOGE” ordered-mention scans
  "TO",
  "VS",
  "AGAINST",
]);

function stripTrailingNoise(phrase: string): string {
  return phrase
    .replace(/[?.!,;:]+$/g, "")
    .replace(
      /\b(?:please|thanks|thank you|for me|token|coin|ca|like)\b/gi,
      " ",
    )
    .replace(/\bon\s+(?:solana|ethereum|eth|base|bsc|arbitrum|polygon)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleTicker(word: string): boolean {
  if (!isTickerQuery(word)) return false;
  return !RESERVED_TICKERS.has(word.toUpperCase());
}

/**
 * Score a ticker candidate so ALL-CAPS / $TICKER beat Title-case English
 * words when scanning a casual sentence (“…Black Bull… or ANSEM…”).
 */
function scoreTickerCandidate(rawWord: string): number {
  const hadDollar = rawWord.startsWith("$");
  const word = rawWord.replace(/^\$/, "");
  if (!isPlausibleTicker(word)) return -1;

  let score = 10;
  if (hadDollar) score += 100;
  // Prefer scream-case tickers (ANSEM, WIF) over Title Case (Black, Bull)
  if (word.length >= 2 && word === word.toUpperCase()) score += 50;
  else if (/^[A-Z][a-z]+$/.test(word)) score += 5;
  else if (/^[a-z]+$/.test(word)) score += 2;
  // Typical ticker lengths 2–6
  if (word.length >= 2 && word.length <= 6) score += 8;
  else if (word.length <= 8) score += 3;
  return score;
}

/** Pull a ticker or embedded address out of a natural-language phrase. */
export function extractTokenMention(phrase: string): {
  kind: "token" | "ticker";
  value: string;
} | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const evm = trimmed.match(/0x[a-fA-F0-9]{40}/);
  if (evm && isValidTokenAddress(evm[0])) {
    return { kind: "token", value: normalizeTokenAddress(evm[0]) };
  }

  if (isValidTokenAddress(trimmed)) {
    return { kind: "token", value: normalizeTokenAddress(trimmed) };
  }

  // Explicit $TICKER anywhere in the phrase wins early
  const dollarTickers = [...trimmed.matchAll(/\$([A-Za-z][A-Za-z0-9.]{0,11})\b/g)];
  let bestDollar: { value: string; score: number } | null = null;
  for (const match of dollarTickers) {
    const candidate = match[1];
    const score = scoreTickerCandidate(`$${candidate}`);
    if (score < 0) continue;
    if (!bestDollar || score > bestDollar.score) {
      bestDollar = { value: candidate.toUpperCase(), score };
    }
  }
  if (bestDollar) {
    return { kind: "ticker", value: bestDollar.value };
  }

  const cleaned = stripTrailingNoise(trimmed);
  if (isPlausibleTicker(cleaned)) {
    return { kind: "ticker", value: cleaned.toUpperCase() };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  let best: { value: string; score: number; index: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const word = raw.replace(/^\$/, "");
    const score = scoreTickerCandidate(raw);
    if (score < 0) continue;
    // Prefer higher score; on ties, later words (often the ticker after a name)
    if (!best || score > best.score || (score === best.score && i > best.index)) {
      best = { value: word.toUpperCase(), score, index: i };
    }
  }

  return best ? { kind: "ticker", value: best.value } : null;
}

function mentionKey(mention: TokenMention): string {
  return mention.kind === "token"
    ? `token:${mention.value.toLowerCase()}`
    : `ticker:${mention.value.toUpperCase()}`;
}

function mentionsEqual(a: TokenMention, b: TokenMention): boolean {
  if (a.kind === "token" && b.kind === "token") {
    return addressesEqual(a.value, b.value);
  }
  if (a.kind === "ticker" && b.kind === "ticker") {
    return a.value.toUpperCase() === b.value.toUpperCase();
  }
  return false;
}

/**
 * Collect distinct token mentions in left-to-right order (addresses, $TICKER,
 * then plausible word tickers). Used for free-form A-vs-B compare.
 */
export function extractOrderedMentions(phrase: string): TokenMention[] {
  const trimmed = phrase.trim();
  if (!trimmed) return [];

  const found: TokenMention[] = [];
  const seen = new Set<string>();

  const push = (mention: TokenMention) => {
    const key = mentionKey(mention);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(mention);
  };

  for (const match of trimmed.matchAll(/0x[a-fA-F0-9]{40}/g)) {
    if (isValidTokenAddress(match[0])) {
      push({ kind: "token", value: normalizeTokenAddress(match[0]) });
    }
  }

  // Standalone Solana-style addresses (no spaces, base58 length)
  for (const word of trimmed.split(/\s+/)) {
    const cleaned = word.replace(/[?.!,;:]+$/g, "");
    if (
      isValidTokenAddress(cleaned) &&
      !cleaned.startsWith("0x") &&
      !/^0x/i.test(cleaned)
    ) {
      push({ kind: "token", value: normalizeTokenAddress(cleaned) });
    }
  }

  for (const match of trimmed.matchAll(/\$([A-Za-z][A-Za-z0-9.]{0,11})\b/g)) {
    if (isPlausibleTicker(match[1])) {
      push({ kind: "ticker", value: match[1].toUpperCase() });
    }
  }

  const cleaned = stripTrailingNoise(trimmed);
  for (const raw of cleaned.split(/\s+/).filter(Boolean)) {
    const word = raw.replace(/^\$/, "");
    // Skip weak Title-case English when better cues exist later; keep all
    // plausible tickers in order for A-vs-B (“pepe vs doge”).
    if (scoreTickerCandidate(raw) < 0) continue;
    push({ kind: "ticker", value: word.toUpperCase() });
  }

  return found;
}

/**
 * Pull left/right tokens from a comparison utterance.
 * Prefers split patterns; falls back to the first two ordered mentions.
 */
export function extractComparePair(phrase: string): {
  left: TokenMention;
  right: TokenMention;
} | null {
  const trimmed = phrase.trim().replace(/[?.!]+$/g, "");

  const trySides = (leftRaw: string, rightRaw: string) => {
    const left = extractTokenMention(leftRaw.trim());
    const right = extractTokenMention(rightRaw.trim());
    if (!left || !right) return null;
    if (mentionsEqual(left, right)) return null;
    return { left, right };
  };

  const fares = trimmed.match(FARES_AGAINST_RE);
  if (fares) {
    const pair = trySides(fares[1], fares[2]);
    if (pair) return pair;
  }

  const stacked = trimmed.match(STACK_UP_AGAINST_RE);
  if (stacked) {
    const pair = trySides(stacked[1], stacked[2]);
    if (pair) return pair;
  }

  const aToB = trimmed.match(COMPARE_A_TO_B_RE);
  if (aToB) {
    const pair = trySides(aToB[1], aToB[2]);
    if (pair) return pair;
  }

  if (COMPARE_SPLIT_RE.test(trimmed)) {
    const parts = trimmed.split(COMPARE_SPLIT_RE);
    if (parts.length >= 2) {
      const pair = trySides(parts[0], parts.slice(1).join(" "));
      if (pair) return pair;
    }
  }

  // Peer-only “compare to X” / “vs X” — not enough for a free-form pair.
  if (
    /\bcompare(?:\s+(?:it|this|them))?\s+(?:to|with|against)\s+\S+/i.test(
      trimmed,
    ) &&
    extractOrderedMentions(trimmed).length < 2
  ) {
    return null;
  }

  const ordered = extractOrderedMentions(trimmed);
  if (ordered.length >= 2) {
    return { left: ordered[0], right: ordered[1] };
  }

  return null;
}

function mentionToIntent(mention: TokenMention): RoutedIntent {
  return mention.kind === "token"
    ? { type: "analyze_token", address: mention.value }
    : { type: "analyze_ticker", ticker: mention.value };
}

/** True when the extracted mention refers to the already-active session token. */
function isActiveSessionMention(
  mention: TokenMention,
  ctx: RouteContext,
): boolean {
  if (mention.kind === "token" && ctx.activeAddress) {
    return addressesEqual(mention.value, ctx.activeAddress);
  }
  if (mention.kind === "ticker") {
    const symbol = ctx.activeSymbol?.trim().toUpperCase();
    if (symbol && symbol === mention.value.toUpperCase()) return true;
  }
  return false;
}

/**
 * Strong new-token cues: $TICKER or scream-case ticker (ANSEM), or an
 * embedded address. Weak Title/lower-case English words alone are ignored
 * when a research follow-up hint is also present.
 */
function hasStrongTickerSignal(phrase: string): boolean {
  if (/0x[a-fA-F0-9]{40}/.test(phrase)) return true;
  if (/\$[A-Za-z][A-Za-z0-9.]{0,11}\b/.test(phrase)) {
    const dollar = extractTokenMention(phrase);
    if (dollar?.kind === "ticker") return true;
  }
  for (const raw of phrase.split(/\s+/)) {
    const word = raw.replace(/^\$/, "").replace(/[?.!,;:]+$/g, "");
    if (
      word.length >= 2 &&
      word === word.toUpperCase() &&
      isPlausibleTicker(word)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * If the utterance names a token other than the active session, analyze it.
 * Returns null when there is no new-token signal (caller may follow up).
 */
function tryNewTokenIntent(
  phrase: string,
  ctx: RouteContext,
  options?: { requireStrong?: boolean },
): RoutedIntent | null {
  if (options?.requireStrong && !hasStrongTickerSignal(phrase)) return null;
  const mention = extractTokenMention(phrase);
  if (!mention) return null;
  if (ctx.hasSession && isActiveSessionMention(mention, ctx)) return null;
  return mentionToIntent(mention);
}

function activeTokenLabel(ctx: RouteContext): string | null {
  const parts = [ctx.activeName, ctx.activeSymbol].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (ctx.activeAddress) return ctx.activeAddress;
  return null;
}

/**
 * When session fields are missing, recover the last ticker/address the user
 * asked about from message history.
 */
export function inferActiveMentionFromHistory(
  messages: ChatMessage[] | undefined,
): { kind: "token" | "ticker"; value: string } | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const mention = extractTokenMention(msg.content);
    if (mention) return mention;
  }
  return null;
}

/**
 * Enrich follow-ups that refer to “this” / comparisons with the active token
 * so the existing follow-up pipeline has explicit context.
 */
export function enrichFollowUpQuestion(
  question: string,
  ctx: Pick<
    RouteContext,
    "activeSymbol" | "activeName" | "activeAddress" | "activeChain" | "hasSession"
  >,
): string {
  if (!ctx.hasSession) return question;
  const label = activeTokenLabel(ctx);
  if (!label) return question;

  const chainNote = ctx.activeChain ? ` on ${ctx.activeChain}` : "";
  const addressNote = ctx.activeAddress ? ` (${ctx.activeAddress})` : "";

  if (COMPARE_CUE_RE.test(question) || COMPARE_RE.test(question)) {
    return `${question.trim()}\n\n(Context: compare against the active token ${label}${addressNote}${chainNote}.)`;
  }

  return question;
}

/**
 * Intent router: rules over the current utterance + conversation/session
 * context. Replaces bare `parseUserInput()` as the chat entry router.
 *
 * Message history / active session shape follow-ups. Layer 3 power modes
 * (`/compare`, “Generate full report”) stay on explicit triggers.
 */
export function routeUserMessage(
  raw: string,
  ctx: RouteContext,
): RoutedIntent {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      type: "invalid",
      reason: "Drop in an address, a ticker (like PEPE), or ask a follow-up.",
    };
  }

  // 0) Layer 3 — explicit full report (session required)
  if (FULL_REPORT_RE.test(trimmed)) {
    if (!ctx.hasSession) {
      return {
        type: "invalid",
        reason:
          "Analyze a token first, then I can generate a full report.",
      };
    }
    return { type: "full_report" };
  }

  // 0b) Layer 3 — `/compare` slash command (pair or single peer)
  const slashCompare = trimmed.match(COMPARE_SLASH_RE);
  if (slashCompare) {
    const arg = slashCompare[1]?.trim();
    if (!arg) {
      if (ctx.hasSession) return { type: "compare_prompt" };
      return {
        type: "invalid",
        reason:
          "Name two tokens to compare — e.g. /compare PEPE DOGE — or analyze one first, then /compare DOGE.",
      };
    }

    const pair = extractComparePair(arg);
    if (pair) {
      return { type: "compare_pair", left: pair.left, right: pair.right };
    }

    const mention = extractTokenMention(arg);
    if (mention) {
      if (!ctx.hasSession) {
        return {
          type: "invalid",
          reason:
            "To compare without an active token, name both sides — e.g. /compare PEPE DOGE.",
        };
      }
      return { type: "compare", target: mention };
    }

    return {
      type: "invalid",
      reason:
        "After /compare, add tickers or addresses — like /compare DOGE or /compare PEPE DOGE.",
    };
  }

  // 0c) Layer 3 — natural-language compare / A-vs-B (before analyze steals addresses)
  if (COMPARE_CUE_RE.test(trimmed) || COMPARE_RE.test(trimmed)) {
    const pair = extractComparePair(trimmed);
    if (pair) {
      // Always free-form pair when both sides are named so each ticker can
      // still show a chain/CA picker (e.g. USDC Eth vs Sol) even if the
      // session already looks like one of them.
      return { type: "compare_pair", left: pair.left, right: pair.right };
    }

    // Single peer after a compare cue (“compare to DOGE”, “vs SHIB”)
    const afterCompare = trimmed
      .replace(COMPARE_A_TO_B_RE, " ")
      .replace(FARES_AGAINST_RE, " ")
      .replace(COMPARE_RE, " ")
      .replace(COMPARE_CUE_RE, " ")
      .replace(/^(?:it|this|them)\s+/i, "")
      .trim();
    const mention =
      extractTokenMention(afterCompare) ??
      extractOrderedMentions(trimmed)[0] ??
      null;

    if (!ctx.hasSession) {
      if (mention) {
        return mentionToIntent(mention);
      }
      const fromHistory = inferActiveMentionFromHistory(ctx.messages);
      if (fromHistory) {
        return {
          type: "invalid",
          reason:
            "I still need a fresh analysis in this chat before I can compare against one peer. Name two tickers (PEPE vs DOGE), or paste an address and ask again.",
        };
      }
      return {
        type: "invalid",
        reason:
          "Name two tokens to compare — e.g. “how PEPE fares against DOGE” — or analyze one first, then /compare DOGE.",
      };
    }

    if (mention) {
      return { type: "compare", target: mention };
    }
    return { type: "compare_prompt" };
  }

  // 1) Direct address / bare ticker
  const direct = parseUserInput(trimmed, { allowTicker: true });
  if (direct.type === "token") {
    return { type: "analyze_token", address: direct.value };
  }
  if (direct.type === "ticker" && isPlausibleTicker(direct.value)) {
    return { type: "analyze_ticker", ticker: direct.value };
  }

  // 2) Glossary / general research (no session required)
  const glossary = answerGlossaryQuestion(trimmed);
  if (glossary) {
    return { type: "general", answer: glossary };
  }

  // 3) Natural-language analyze ("tell me about bonk", "now check WIF")
  if (ANALYZE_PREFIX.test(trimmed) || NEW_TOPIC_PREFIX.test(trimmed)) {
    const remainder = trimmed
      .replace(ANALYZE_PREFIX, "")
      .replace(NEW_TOPIC_PREFIX, "")
      .trim();
    const topicOnly = stripTrailingNoise(remainder);
    // Research follow-ups win unless a strong new ticker ($/ALLCAPS) is named
    if (
      ctx.hasSession &&
      FOLLOW_UP_HINT.test(topicOnly) &&
      !hasStrongTickerSignal(remainder)
    ) {
      return {
        type: "follow_up",
        question: enrichFollowUpQuestion(trimmed, ctx),
      };
    }
    const newToken = tryNewTokenIntent(remainder, ctx);
    if (newToken) return newToken;
    // Same token mentioned again → stay on session (e.g. “what about WETH?”).
    if (ctx.hasSession && extractTokenMention(remainder)) {
      return {
        type: "follow_up",
        question: enrichFollowUpQuestion(trimmed, ctx),
      };
    }
  }

  // 3b) Casual “heard about / thoughts on …” → analyze newly named token
  if (CASUAL_TOKEN_PREFIX.test(trimmed)) {
    const remainder = trimmed.replace(CASUAL_TOKEN_PREFIX, "").trim();
    const newToken = tryNewTokenIntent(remainder, ctx);
    if (newToken) return newToken;
  }

  // 5) Embedded contract address in a longer sentence
  const embeddedAddress = trimmed.match(/0x[a-fA-F0-9]{40}/);
  if (embeddedAddress && isValidTokenAddress(embeddedAddress[0])) {
    return {
      type: "analyze_token",
      address: normalizeTokenAddress(embeddedAddress[0]),
    };
  }

  // 6) Session-aware: new token beats follow-up; research hints need a strong
  // ticker cue before switching away from the active session.
  if (ctx.hasSession) {
    if (FOLLOW_UP_HINT.test(trimmed) && !hasStrongTickerSignal(trimmed)) {
      return {
        type: "follow_up",
        question: enrichFollowUpQuestion(trimmed, ctx),
      };
    }
    const newToken = tryNewTokenIntent(trimmed, ctx);
    if (newToken) return newToken;

    return {
      type: "follow_up",
      question: enrichFollowUpQuestion(trimmed, ctx),
    };
  }

  // 7) Follow-up-shaped question with no session
  if (FOLLOW_UP_HINT.test(trimmed)) {
    return {
      type: "invalid",
      reason: "Analyze a token first, then I can dig into follow-ups.",
    };
  }

  // 8) Last chance: natural-language phrase that still names a ticker
  const embedded = extractTokenMention(trimmed);
  if (embedded) {
    return mentionToIntent(embedded);
  }

  return {
    type: "invalid",
    reason:
      "Drop in an address, a ticker (like BONK), or ask something like “tell me about PEPE”.",
  };
}
