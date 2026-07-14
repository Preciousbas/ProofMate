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
          "I couldn’t get holder data",
          "Moralis didn’t return a distribution for this address, so I can’t say how concentrated it is.",
        ),
        true,
      );
    }

    const wallets = evidence.holders.topHolders
      .slice(0, 5)
      .map((holder, index) => {
        const label = holder.label ? ` (${holder.label})` : "";
        return `${index + 1}. ${formatAddress(holder.address)}${label} — ${formatPercent(holder.percentage)}`;
      })
      .join("\n");

    return rulesAnswer(
      joinSections(
        `Top 10 hold about ${formatPercent(evidence.holders.top10Concentration)} of supply.`,
        evidence.holders.totalHolders
          ? `Total holders: ${evidence.holders.totalHolders.toLocaleString()}.`
          : null,
        wallets ? `Biggest wallets right now:\n${wallets}` : null,
      ),
      true,
    );
  }

  if (q.includes("liquidity") || q.includes("volume") || q.includes("market")) {
    if (!evidence.market.available) {
      return rulesAnswer(
        joinSections(
          "No useful DEX market data",
          "If there’s no real pair, it’s hard to price or exit this token cleanly.",
        ),
        true,
      );
    }

    const snapshot = [
      `- Best-pair liquidity: ${formatUsd(evidence.market.liquidityUsd)}`,
      `- 24h volume: ${formatUsd(evidence.market.volume24h)}`,
      `- Active pairs: ${evidence.market.pairCount}`,
      evidence.market.dexId ? `- Main DEX: ${evidence.market.dexId}` : null,
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
        `Market snapshot\n${snapshot}`,
        signals ? `Liquidity flags\n${signals}` : "No liquidity red flags in this memo.",
      ),
      true,
    );
  }

  if (q.includes("verified") || q.includes("contract") || q.includes("proxy")) {
    const explorer =
      evidence.contract.explorerName ?? explorerDisplayName(evidence.chain);
    const facts = [
      evidence.market.name || evidence.market.symbol
        ? `- Token: ${[evidence.market.name, evidence.market.symbol].filter(Boolean).join(" / ")}`
        : null,
      `- Verified on ${explorer}: ${evidence.contract.verified ? "Yes" : "No"}`,
      evidence.chain === "sol"
        ? `- Mint authority: ${
            evidence.contract.mintAuthority === null
              ? "Revoked"
              : evidence.contract.mintAuthority ?? "Unknown"
          }`
        : `- Proxy: ${evidence.contract.isProxy ? "Yes" : "No"}`,
      evidence.chain === "sol"
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
        `Contract\n${facts}`,
        evidence.chain === "sol"
          ? "Token name/symbol comes from Solscan / DexScreener / Moralis where available."
          : "Note: the displayed token name/symbol comes from ERC-20 / DexScreener, not the Solidity class name.",
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
        `Score: ${memo.riskScore}/100 (${memo.riskLabel})`,
        flagLines
          ? `What pushed the score:\n${flagLines}`
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
      "Ask about holders, liquidity, the contract, or the risk score for denser detail.",
    ),
    grounded: true,
    source: "fallback",
  };
}

/**
 * Rules first (cheap + deterministic), then grounded Groq for open questions,
 * then a memo-based fallback so the user never gets a dead end.
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
