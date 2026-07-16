import type { TokenEvidence, TrustMemo } from "./types";

/** Small ints / score scale that often appear in prose without being “facts”. */
const ALLOWED_SMALL = new Set<number>([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 24, 25, 30, 50, 60, 72, 100,
]);

/**
 * Pull finite numbers from text (skips hex-ish / pure address noise by
 * requiring a digit boundary and capping length).
 */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(?<![A-Za-z0-9_])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?![A-Za-z0-9_])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    if (raw.length > 14) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function addNumber(set: Set<string>, n: number) {
  if (!Number.isFinite(n)) return;
  // Canonical keys so 60 and 60.0 match.
  set.add(String(Math.round(n * 1e6) / 1e6));
  set.add(String(Math.round(n)));
  if (n !== 0) {
    set.add(String(Math.round(n * 10) / 10));
    set.add(String(Math.round(n * 100) / 100));
  }
}

function walkJson(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 12 || value == null) return;
  if (typeof value === "number") {
    addNumber(into, value);
    return;
  }
  if (typeof value === "string") {
    for (const n of extractNumbers(value)) addNumber(into, n);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, into, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkJson(v, into, depth + 1);
    }
  }
}

/** Numbers that appear in the memo/evidence payload (allowed in LLM answers). */
export function collectAllowedNumbers(
  evidence: TokenEvidence,
  memo: TrustMemo,
): Set<string> {
  const allowed = new Set<string>();
  for (const n of ALLOWED_SMALL) addNumber(allowed, n);
  walkJson(evidence, allowed);
  walkJson(memo, allowed);
  return allowed;
}

/**
 * True when the answer cites a metric-like number that never appeared in
 * evidence/memo. Used to reject hallucinated follow-ups.
 */
export function answerHasUngroundedNumbers(
  answer: string,
  allowed: Set<string>,
): boolean {
  for (const n of extractNumbers(answer)) {
    if (ALLOWED_SMALL.has(n) || ALLOWED_SMALL.has(Math.round(n))) continue;
    const keys = [
      String(Math.round(n * 1e6) / 1e6),
      String(Math.round(n)),
      String(Math.round(n * 10) / 10),
      String(Math.round(n * 100) / 100),
    ];
    if (!keys.some((k) => allowed.has(k))) return true;
  }
  return false;
}
