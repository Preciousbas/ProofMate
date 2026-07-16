import { explorerDisplayName } from "./chains";
import { maybeAnswerFollowUpWithLlm } from "./followUpLlm";
import type { FollowUpResponse, TokenEvidence, TrustMemo } from "./types";
import { formatAddress, formatPercent, formatUsd } from "./validation";

function joinSections(...sections: Array<string | false | null | undefined>): string {
  return sections
    .filter((section): section is string => Boolean(section && section.trim()))
    .join("\n\n");
}

function rulesAnswer(
  answer: string,
  grounded: boolean,
): FollowUpResponse {
  return { answer, grounded, source: "rules" };
}

/** Buy / invest / “should I…” — refuse before other topic matching. */
function isAdviceSeekingQuestion(q: string): boolean {
  if (
    /\b(should i|would you|do you)\b/.test(q) &&
    /\b(buy|invest|sell|hold|long|short|put money|allocate)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(buy|invest(?:ing|ment)?|sell|hodl)\b/.test(q) &&
    /\b(recommend|recommendation|advice|advise|worth (?:it|buying)|good (?:buy|invest))\b/.test(
      q,
    )
  ) {
    return true;
  }
  if (
    /\b(recommend|recommendation)\b/.test(q) &&
    /\b(buy|invest|sell|token|this|it)\b/.test(q)
  ) {
    return true;
  }
  return (
    /\bis (?:it|this) (?:a )?good (?:buy|investment|invest)\b/.test(q) ||
    /\bworth (?:buying|investing)\b/.test(q)
  );
}

function adviceRefusalAnswer(memo: TrustMemo): FollowUpResponse {
  const label =
    memo.tokenSymbol?.trim() ||
    memo.tokenName?.trim() ||
    "this token";

  return rulesAnswer(
    joinSections(
      `I can’t recommend that you invest in or buy ${label}. I can only provide analysis to help you decide. Always do your own research.`,
      `From this memo it’s ${memo.riskScore}/100 (${memo.riskLabel}). Ask about holders, liquidity, the contract, or the score if you want denser detail.`,
    ),
    true,
  );
}

/**
 * Fast deterministic router for common follow-ups (holders / liquidity / contract / score).
 * Returns null when the question needs open-ended grounded reasoning.
 */
export function answerFollowUpRules(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): FollowUpResponse | null {
  const q = question.toLowerCase();

  if (isAdviceSeekingQuestion(q)) {
    return adviceRefusalAnswer(memo);
  }

  if (
    q.includes("top holder") ||
    q.includes("holder") ||
    q.includes("concentration") ||
    q.includes("who holds") ||
    q.includes("supply")
  ) {
    if (!evidence.holders.available) {
      return rulesAnswer(
        joinSections(
          "I couldn't get holder data for this one.",
          "So I can't say how concentrated the supply is from here.",
        ),
        true,
      );
    }

    const wallets = evidence.holders.topHolders
      .slice(0, 5)
      .map((holder, index) => {
        const type = holder.labelType ? ` [${holder.labelType}]` : "";
        const label = holder.label ? ` (${holder.label})` : "";
        return `${index + 1}. ${formatAddress(holder.address)}${type}${label} — ${formatPercent(holder.percentage)}`;
      })
      .join("\n");

    const dist = evidence.holders.distribution;
    const context =
      dist && dist.labeledNonWhalePct > 0
        ? joinSections(
            `Of the top slice: burn ${formatPercent(dist.burnedPct)}, exchange ${formatPercent(dist.exchangePct)}, LP ${formatPercent(dist.lpPct)}.`,
            dist.effectiveWhalePct !== undefined
              ? `Effective whale / unlabeled slice ≈ ${formatPercent(dist.effectiveWhalePct)} (top-10 minus burn/exchange/LP).`
              : null,
          )
        : null;

    return rulesAnswer(
      joinSections(
        `Top 10 hold about ${formatPercent(evidence.holders.top10Concentration)} of supply.`,
        context,
        evidence.holders.totalHolders
          ? `Total holders: ${evidence.holders.totalHolders.toLocaleString()}.`
          : null,
        wallets ? `Biggest wallets right now:\n${wallets}` : null,
      ),
      true,
    );
  }

  if (q.includes("liquidity") || q.includes("volume") || q.includes("market") || q.includes("lock")) {
    if (!evidence.market.available) {
      return rulesAnswer(
        joinSections(
          "I don’t have useful DEX market data here.",
          "If there’s no real pair, it’s hard to price or exit this token cleanly.",
          evidence.market.liquidityLock
            ? `Lock status: ${evidence.market.liquidityLock.summary}`
            : null,
        ),
        true,
      );
    }

    const lock = evidence.market.liquidityLock;
    const snapshot = [
      `- Best-pair liquidity: ${formatUsd(evidence.market.liquidityUsd)}`,
      `- 24h volume: ${formatUsd(evidence.market.volume24h)}`,
      `- Active pairs: ${evidence.market.pairCount}`,
      evidence.market.dexId ? `- Main DEX: ${evidence.market.dexId}` : null,
      lock
        ? `- Liquidity lock: ${lock.status}${lock.provider ? ` (${lock.provider})` : ""} — ${lock.summary}`
        : `- Liquidity lock: unknown`,
    ]
      .filter(Boolean)
      .join("\n");

    const liquidityFlags = memo.redFlags.filter(
      (flag) => flag.category === "liquidity",
    );
    const signals = liquidityFlags
      .map((flag) => `- ${flag.title}: ${flag.evidence}`)
      .join("\n");

    return rulesAnswer(
      joinSections(
        `Here’s the market picture:\n${snapshot}`,
        signals
          ? `Liquidity flags from this memo:\n${signals}`
          : "No liquidity red flags in this memo.",
      ),
      true,
    );
  }

  if (
    q.includes("verified") ||
    q.includes("contract") ||
    q.includes("proxy") ||
    q.includes("checklist") ||
    q.includes("mint") ||
    q.includes("blacklist") ||
    q.includes("renounc")
  ) {
    const explorer =
      evidence.contract.explorerName ?? explorerDisplayName(evidence.chain);
    const checklistLines =
      evidence.contract.checklist?.map(
        (item) =>
          `- ${item.label}: ${item.value === "yes" ? "Yes" : item.value === "no" ? "No" : "Unknown"}${
            item.detail ? ` (${item.detail})` : ""
          }`,
      ) ?? [];

    const facts = [
      evidence.market.name || evidence.market.symbol
        ? `- Token: ${[evidence.market.name, evidence.market.symbol].filter(Boolean).join(" / ")}`
        : null,
      `- Verified on ${explorer}: ${evidence.contract.verified ? "Yes" : "No"}`,
      checklistLines.length > 0
        ? null
        : evidence.chain === "sol"
          ? `- Mint authority: ${
              evidence.contract.mintAuthority === null
                ? "Revoked"
                : evidence.contract.mintAuthority ?? "Unknown"
            }`
          : `- Proxy: ${evidence.contract.isProxy ? "Yes" : "No"}`,
      checklistLines.length > 0
        ? null
        : evidence.chain === "sol"
          ? `- Freeze authority: ${
              evidence.contract.freezeAuthority === null
                ? "Revoked"
                : evidence.contract.freezeAuthority ?? "Unknown"
            }`
          : null,
      evidence.contract.solidityClassName
        ? `- Solidity class name: ${evidence.contract.solidityClassName}`
        : null,
      evidence.contract.implementation
        ? `- Implementation: ${evidence.contract.implementation}`
        : null,
      evidence.contract.compilerVersion
        ? `- Compiler: ${evidence.contract.compilerVersion}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return rulesAnswer(
      joinSections(
        `Here’s what I can see on the contract:\n${facts}`,
        checklistLines.length > 0
          ? `Checklist:\n${checklistLines.join("\n")}`
          : null,
        evidence.chain === "sol"
          ? "Token name/symbol comes from Solscan / DexScreener / Moralis where available."
          : "Heads up: the displayed name/symbol comes from ERC-20 / DexScreener, not the Solidity class name.",
      ),
      true,
    );
  }

  if (
    q.includes("why") ||
    ((q.includes("score") || q.includes("risk") || q.includes("caution")) &&
      (q.includes("high") || q.includes("explain") || q.includes("what")))
  ) {
    const flagLines = memo.redFlags
      .map((flag) => `- [${flag.severity}] ${flag.title}: ${flag.evidence}`)
      .join("\n");
    const inferences = Array.isArray(memo.inferences)
      ? memo.inferences.map((item) => `- ${item}`).join("\n")
      : "";

    return rulesAnswer(
      joinSections(
        `Score sits at ${memo.riskScore}/100 (${memo.riskLabel}).`,
        flagLines
          ? `What pushed it:\n${flagLines}`
          : "Nothing major showed up in this public snapshot.",
        inferences ? `How I’m reading it:\n${inferences}` : null,
      ),
      true,
    );
  }

  return null;
}

function fallbackAnswer(memo: TrustMemo): FollowUpResponse {
  const flagLines = memo.redFlags
    .slice(0, 5)
    .map((flag) => `- [${flag.severity}] ${flag.title}: ${flag.evidence}`)
    .join("\n");

  return {
    answer: joinSections(
      `I can stick to this memo: ${memo.riskScore}/100 (${memo.riskLabel}).`,
      memo.summary,
      flagLines ? `Flags on file:\n${flagLines}` : "No red flags in this public snapshot.",
      "Ask about holders, liquidity, the contract, or the risk score if you want denser detail.",
    ),
    grounded: true,
    source: "fallback",
  };
}

/**
 * Rules first (cheap + deterministic), then grounded Groq for open questions
 * (rejected if the answer invents numbers), then a memo-based fallback.
 */
export async function answerFollowUp(
  question: string,
  evidence: TokenEvidence,
  memo: TrustMemo,
): Promise<FollowUpResponse> {
  const ruled = answerFollowUpRules(question, evidence, memo);
  if (ruled) return ruled;

  const llm = await maybeAnswerFollowUpWithLlm(question, evidence, memo);
  if (llm) return llm;

  return fallbackAnswer(memo);
}
