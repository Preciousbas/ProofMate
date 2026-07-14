"use client";

import {
  analyzeTokenAction,
  followUpAction,
  searchTokensAction,
} from "@/app/actions/research";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getCanonicalTicker } from "@/lib/canonicalTickers";
import {
  CURATED_FOLLOW_UPS,
  DEMO_TOKENS,
  DISCLAIMER,
  PRODUCT_TAGLINE,
  WHAT_PROOFMATE_DOES,
} from "@/lib/constants";
import {
  clearClientSession,
  saveClientSession,
  type ClientSession,
} from "@/lib/clientSession";
import type { TokenSearchHit } from "@/lib/evidence/tokenSearch";
import type { ChatMessage, TrustMemo } from "@/lib/types";
import { addressesEqual, formatAddress, formatUsd, parseUserInput } from "@/lib/validation";
import { FormattedAnswer } from "./FormattedAnswer";
import { LoadingStates } from "./LoadingStates";
import { Logo } from "./Logo";
import { TrustMemoCard } from "./TrustMemoCard";

const WELCOME =
  "Paste a token address or a ticker. I will figure out the chain, check what’s public, and call out anything that looks off.";

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [searchHits, setSearchHits] = useState<TokenSearchHit[] | null>(null);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [memoHistory, setMemoHistory] = useState<TrustMemo[]>([]);
  const [loadingStage, setLoadingStage] = useState<
    "fetching" | "analyzing" | "follow_up" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearClientSession();
  }, []);

  const activeMemo = useMemo(() => {
    if (session?.memo) return session.memo;
    return memoHistory[0] ?? null;
  }, [session, memoHistory]);

  const chatIsEmpty = messages.length === 0 && !loadingStage;

  async function runAnalysis(tokenAddress: string, chainId?: string) {
    setError(null);
    setSearchHits(null);
    setLoadingStage("fetching");

    const result = await analyzeTokenAction(tokenAddress, chainId ?? null);
    setLoadingStage("analyzing");

    if (!result.ok) {
      throw new Error(result.error);
    }

    const data = result.data;
    const nextSession: ClientSession = {
      sessionId: data.sessionId,
      evidence: data.evidence,
      memo: data.memo,
    };
    setSession(nextSession);
    saveClientSession(nextSession);
    setMemoHistory((prev) => {
      const deduped = prev.filter((m) => {
        return !addressesEqual(m.tokenAddress, data.memo.tokenAddress);
      });
      return [data.memo, ...deduped];
    });
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.memo.summary,
        memo: data.memo,
      },
    ]);
  }

  async function runTickerSearch(ticker: string) {
    setError(null);
    setSearchHits(null);
    setLoadingStage("fetching");

    const canonical = getCanonicalTicker(ticker);
    if (canonical) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            canonical.note ??
            `Using ${canonical.symbol} on ${canonical.chainLabel}.`,
        },
      ]);
      await runAnalysis(canonical.address, canonical.chainId);
      return;
    }

    const result = await searchTokensAction(ticker, "all");
    if (!result.ok) {
      throw new Error(result.error);
    }

    const results = result.data.results;
    if (results.length === 0) {
      throw new Error(
        `Nothing solid turned up for “${ticker}”. Try another ticker or paste a contract address.`,
      );
    }

    if (results.length === 1) {
      const hit = results[0];
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Found ${hit.symbol} on ${hit.chainLabel}. Running analysis…`,
        },
      ]);
      await runAnalysis(hit.address, hit.chainId);
      return;
    }

    setSearchHits(results);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `A few matches for “${ticker}”. Pick the one you mean:`,
      },
    ]);
  }

  async function runFollowUp(question: string) {
    if (!session) {
      throw new Error("Analyze a token first, then ask follow-ups.");
    }

    setError(null);
    setLoadingStage("follow_up");

    const result = await followUpAction(
      question,
      session.evidence,
      session.memo,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: result.data.answer ?? "No answer returned." },
    ]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || loadingStage) return;

    setMessages((prev) => [...prev, { role: "user", content: value }]);
    setInput("");

    try {
      const parsed = parseUserInput(value, {
        allowTicker:
          !session || Boolean(value.match(/^0x/i)) || !value.includes(" "),
      });

      if (session && parsed.type === "ticker" && value.includes(" ")) {
        await runFollowUp(value);
      } else if (parsed.type === "token") {
        await runAnalysis(parsed.value);
      } else if (parsed.type === "ticker") {
        await runTickerSearch(parsed.value);
      } else if (parsed.type === "follow_up") {
        await runFollowUp(parsed.value);
      } else {
        throw new Error("Paste an address, a ticker (PEPE), or a follow-up.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setLoadingStage(null);
    }
  }

  async function handleDemoToken(token: (typeof DEMO_TOKENS)[number]) {
    setMessages((prev) => [...prev, { role: "user", content: token.label }]);
    try {
      await runAnalysis(token.address, token.chainId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setLoadingStage(null);
      setInput("");
    }
  }

  async function handleFollowUpPrompt(prompt: string) {
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    try {
      await runFollowUp(prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setLoadingStage(null);
      setInput("");
    }
  }

  async function handlePickHit(hit: TokenSearchHit) {
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: `${hit.symbol} on ${hit.chainLabel}`,
      },
    ]);
    setSearchHits(null);
    try {
      await runAnalysis(hit.address, hit.chainId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setLoadingStage(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1a2820_0%,_#0f1419_48%,_#0c1014_100%)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
        <header className="mb-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
            OKX AI Genesis Hackathon
          </p>
          <h1 className="mt-2.5 text-white">
            <Logo size="lg" tone="onDark" />
          </h1>
          <p className="mt-2 max-w-3xl text-slate-300">{PRODUCT_TAGLINE}</p>
        </header>

        <div className="grid min-h-0 flex-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,1.2fr)]">
          <section className="flex h-[calc(100vh-8rem)] min-h-[70vh] min-w-0 flex-col overflow-hidden rounded-3xl border border-surface-border bg-surface/80 backdrop-blur">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              {chatIsEmpty && (
                <div className="rounded-2xl bg-surface-raised px-4 py-3 text-sm leading-6 text-slate-300">
                  {WELCOME}
                </div>
              )}

              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      isUser
                        ? "ml-auto bg-accent text-white"
                        : "bg-surface-raised text-slate-200"
                    }`}
                  >
                    {isUser || message.memo ? (
                      <p>{message.content}</p>
                    ) : (
                      <FormattedAnswer text={message.content} />
                    )}
                  </div>
                );
              })}

              {searchHits && searchHits.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-surface-border bg-surface-raised p-3">
                  {searchHits.map((hit) => (
                    <button
                      key={`${hit.chainId}-${hit.address}`}
                      type="button"
                      onClick={() => handlePickHit(hit)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-left text-sm text-slate-200 hover:border-accent"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-white">
                          {hit.symbol}
                        </span>{" "}
                        <span className="text-slate-400">{hit.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-slate-500">
                          {hit.chainLabel} · {formatAddress(hit.address)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {hit.liquidityUsd !== undefined
                          ? formatUsd(hit.liquidityUsd)
                          : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {loadingStage && <LoadingStates stage={loadingStage} />}
              {error && (
                <p className="text-sm text-risk-high" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-surface-border p-4">
              <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                {DEMO_TOKENS.map((token) => (
                  <button
                    key={`${token.chainId}-${token.address}`}
                    type="button"
                    onClick={() => handleDemoToken(token)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-white"
                  >
                    {token.label}
                  </button>
                ))}
              </div>

              {activeMemo && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {CURATED_FOLLOW_UPS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleFollowUpPrompt(prompt)}
                      className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-slate-200 hover:bg-accent/20"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Address, ticker (PEPE / ETH / BNB), or follow-up"
                  className="min-w-0 flex-1 rounded-2xl border border-surface-border bg-surface px-4 py-3 text-sm text-white outline-none ring-accent focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={Boolean(loadingStage)}
                  className="shrink-0 rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  Analyze
                </button>
              </form>
            </div>
          </section>

          <aside className="h-[calc(100vh-8rem)] min-h-[70vh] min-w-0 lg:sticky lg:top-6">
            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-surface-border bg-surface/60 backdrop-blur">
              <div
                data-memo-scroll
                className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain"
              >
                {memoHistory.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-8 text-center text-sm leading-6 text-slate-400">
                    Nothing here yet. Analyze a token on the left and the memo
                    shows up on this side.
                    <br />
                    A refresh clears it.
                  </div>
                ) : (
                  <>
                    {memoHistory.map((memo, index) => (
                      <TrustMemoCard
                        key={`${memo.tokenAddress}-${memo.generatedAt}-${index}`}
                        memo={memo}
                      />
                    ))}
                    <p className="mx-5 mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-slate-400 sm:mx-6">
                      {DISCLAIMER}
                    </p>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>

        <section
          aria-labelledby="what-proofmate-does"
          className="mt-8 rounded-3xl border border-surface-border bg-surface/60 px-6 py-7 backdrop-blur sm:px-8"
        >
          <h2
            id="what-proofmate-does"
            className="text-lg font-semibold text-white sm:text-xl"
          >
            What ProofMate does
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300 sm:text-[15px]">
            {WHAT_PROOFMATE_DOES.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
