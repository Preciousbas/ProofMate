"use client";

import {
  getChatAction,
  saveChatAction,
} from "@/app/actions/chats";
import {
  analyzeTokenAction,
  followUpAction,
  searchTokensAction,
} from "@/app/actions/research";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getCanonicalTicker } from "@/lib/canonicalTickers";
import { chainDisplayName } from "@/lib/chains";
import { deriveTitle } from "@/lib/chatStorage";
import { saveClientSession, type ClientSession } from "@/lib/clientSession";
import {
  DEMO_TOKENS,
  LAYER3_ACTIONS,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "@/lib/constants";
import {
  narrowSearchHitsForDisambiguation,
  type TokenSearchHit,
} from "@/lib/evidence/tokenSearch";
import {
  getGuestConversation,
  persistGuestChat,
} from "@/lib/guestChatStore";
import {
  routeUserMessage,
  type TokenMention,
} from "@/lib/intentRouter";
import {
  buildComparisonMessage,
  buildFullReport,
  COMPARE_PROMPT_MESSAGE,
} from "@/lib/layer3";
import { buildMemoOpeningMessage } from "@/lib/memo/opening";
import type { ChatMessage } from "@/lib/types";
import { formatUsingCompare, formatUsingSingle } from "@/lib/usingLine";
import { addressesEqual, formatAddress, formatUsd } from "@/lib/validation";
import { notifyConversationsChanged } from "./shell/AppShell";
import { ChatFooter } from "./shell/ChatFooter";
import { FormattedAnswer } from "./FormattedAnswer";
import { LoadingStates } from "./LoadingStates";
import { TrustMemoCard } from "./TrustMemoCard";

const WELCOME =
  "Drop in a token address or ticker. I’ll check public data and flag what looks off.";

/** Resolved contract + labels for “Using …” confirmation lines. */
type ResolvedPick = {
  address: string;
  chainId?: string;
  symbol: string;
  chainLabel: string;
};

/** Drop temporary “A few matches…” prompts once the user has picked / analysis starts. */
function withoutPickPrompts(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (m) =>
      !(
        m.role === "assistant" &&
        !m.memo &&
        !m.plain &&
        /^A few matches for [“"]/.test(m.content)
      ),
  );
}

function matchesPrompt(ticker: string): string {
  return `A few matches for “${ticker}”.`;
}

interface ChatThreadProps {
  conversationId: string;
}

export function ChatThread({ conversationId }: ChatThreadProps) {
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [searchHits, setSearchHits] = useState<TokenSearchHit[] | null>(null);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loadingStage, setLoadingStage] = useState<
    "fetching" | "analyzing" | "follow_up" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** After a comparison, hide curated FAQ chips until a fresh single analyze. */
  const [hideCuratedFollowUps, setHideCuratedFollowUps] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  /** When disambiguating a compare target, the next picker click finishes compare. */
  const pendingCompareRef = useRef(false);
  /**
   * Free-form A-vs-B: after the user picks an ambiguous ticker, finish the
   * other side and render the comparison.
   */
  const pendingComparePairRef = useRef<{
    left?: ResolvedPick;
    right?: ResolvedPick;
    waiting: "left" | "right";
    other: TokenMention;
  } | null>(null);

  const persist = useCallback(
    async (
      id: string,
      nextMessages: ChatMessage[],
      nextSession: ClientSession | null,
    ) => {
      if (isAuthed) {
        await saveChatAction({
          id,
          title: deriveTitle(nextMessages),
          messages: nextMessages,
          session: nextSession,
        });
      } else {
        persistGuestChat(id, nextMessages, nextSession);
      }
      notifyConversationsChanged();
    },
    [isAuthed],
  );

  useEffect(() => {
    if (status === "loading") return;

    let cancelled = false;
    setReady(false);
    setSearchHits(null);
    setError(null);
    setInput("");
    setHideCuratedFollowUps(false);
    pendingCompareRef.current = false;
    pendingComparePairRef.current = null;
    (async () => {
      if (isAuthed) {
        const stored = await getChatAction(conversationId);
        if (cancelled) return;
        if (stored) {
          setMessages(stored.messages);
          setSession(stored.session);
        } else {
          setMessages([]);
          setSession(null);
          // Persist in background so the composer is usable immediately.
          void persist(conversationId, [], null);
        }
      } else {
        const stored = getGuestConversation(conversationId);
        if (cancelled) return;
        if (stored) {
          setMessages(stored.messages);
          setSession(stored.session);
        } else {
          setMessages([]);
          setSession(null);
          persistGuestChat(conversationId, [], null);
          notifyConversationsChanged();
        }
      }
      setReady(true);
    })().catch(() => {
      if (!cancelled) {
        setMessages([]);
        setSession(null);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, isAuthed, persist, status]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!ready) return;
    scrollToBottom();
  }, [messages, loadingStage, searchHits, ready, scrollToBottom]);

  const updateState = useCallback(
    (
      nextMessages: ChatMessage[],
      nextSession: ClientSession | null,
    ) => {
      setMessages(nextMessages);
      setSession(nextSession);
      void persist(conversationId, nextMessages, nextSession);
    },
    [conversationId, persist],
  );

  async function runAnalysis(
    tokenAddress: string,
    chainId: string | undefined,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
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
    saveClientSession(nextSession);
    setHideCuratedFollowUps(false);

    const nextMessages: ChatMessage[] = [
      ...currentMessages,
      {
        role: "assistant",
        content: buildMemoOpeningMessage(data.memo),
        memo: data.memo,
      },
    ];
    updateState(nextMessages, nextSession);
  }

  async function runTickerSearch(
    ticker: string,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
    setError(null);
    setSearchHits(null);
    setLoadingStage("fetching");

    const canonical = getCanonicalTicker(ticker);
    if (canonical) {
      // No “Using X on Chain” bubble — go straight into analysis.
      await runAnalysis(
        canonical.address,
        canonical.chainId,
        currentMessages,
        currentSession,
      );
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

    const choices = narrowSearchHitsForDisambiguation(results, ticker);
    if (choices.length === 1) {
      const hit = choices[0];
      await runAnalysis(hit.address, hit.chainId, currentMessages, currentSession);
      return;
    }

    setSearchHits(choices);
    const withPick: ChatMessage[] = [
      ...withoutPickPrompts(currentMessages),
      {
        role: "assistant",
        content: matchesPrompt(ticker),
      },
    ];
    updateState(withPick, currentSession);
  }

  async function runFollowUp(
    question: string,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
    if (!currentSession) {
      throw new Error("Analyze a token first, then ask follow-ups.");
    }

    setError(null);
    setLoadingStage("follow_up");

    const result = await followUpAction(
      question,
      currentSession.evidence,
      currentSession.memo,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }

    const nextMessages: ChatMessage[] = [
      ...currentMessages,
      {
        role: "assistant",
        content: result.data.answer ?? "No answer returned.",
      },
    ];
    updateState(nextMessages, currentSession);
  }

  function runFullReport(
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
    if (!currentSession) {
      throw new Error("Analyze a token first, then generate a full report.");
    }
    const report = buildFullReport(
      currentSession.memo,
      currentSession.evidence,
    );
    updateState(
      [...currentMessages, { role: "assistant", content: report }],
      currentSession,
    );
  }

  function runComparePrompt(
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
    updateState(
      [
        ...currentMessages,
        { role: "assistant", content: COMPARE_PROMPT_MESSAGE },
      ],
      currentSession,
    );
    setInput(LAYER3_ACTIONS[0].inputPrefix);
  }

  /**
   * Resolve a ticker/address to a concrete contract. Returns null when the
   * user must pick from search hits (pending compare / pair refs are set).
   */
  async function resolveMentionForCompare(
    target: TokenMention,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
    pickPrompt: string,
    onAmbiguous: () => void,
  ): Promise<ResolvedPick | null> {
    if (target.kind === "token") {
      const chainLabel = target.chainId
        ? chainDisplayName(target.chainId)
        : "Unknown";
      return {
        address: target.value,
        chainId: target.chainId,
        symbol: formatAddress(target.value),
        chainLabel,
      };
    }

    const canonical = getCanonicalTicker(target.value);
    if (canonical) {
      return {
        address: canonical.address,
        chainId: canonical.chainId,
        symbol: canonical.symbol,
        chainLabel: canonical.chainLabel,
      };
    }

    const search = await searchTokensAction(target.value, "all");
    if (!search.ok) throw new Error(search.error);
    const results = search.data.results;
    if (results.length === 0) {
      throw new Error(
        `Nothing solid turned up for “${target.value}”. Try another ticker or paste an address.`,
      );
    }
    const choices = narrowSearchHitsForDisambiguation(results, target.value);
    if (choices.length > 1) {
      setSearchHits(choices);
      updateState(
        [
          ...withoutPickPrompts(currentMessages),
          { role: "assistant", content: pickPrompt },
        ],
        currentSession,
      );
      onAmbiguous();
      return null;
    }
    const hit = choices[0];
    return {
      address: hit.address,
      chainId: hit.chainId,
      symbol: hit.symbol,
      chainLabel: hit.chainLabel,
    };
  }

  /**
   * Analyze a peer token and append a side-by-side comparison.
   * Primary session stays on the active token.
   */
  async function runCompare(
    target: TokenMention,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
    preResolved?: ResolvedPick,
  ) {
    if (!currentSession) {
      throw new Error(
        "Analyze a token first, then use /compare TICKER to compare.",
      );
    }

    setError(null);
    setSearchHits(null);
    setLoadingStage("fetching");
    pendingCompareRef.current = false;
    pendingComparePairRef.current = null;

    const resolved =
      preResolved ??
      (await resolveMentionForCompare(
        target,
        currentMessages,
        currentSession,
        matchesPrompt(target.value),
        () => {
          pendingCompareRef.current = true;
        },
      ));
    if (!resolved) return;

    if (
      addressesEqual(resolved.address, currentSession.memo.tokenAddress) ||
      addressesEqual(resolved.address, currentSession.evidence.tokenAddress)
    ) {
      throw new Error(
        "That’s the same token already in this chat. Pick a different ticker for /compare.",
      );
    }

    setLoadingStage("analyzing");
    const result = await analyzeTokenAction(
      resolved.address,
      resolved.chainId ?? null,
    );
    if (!result.ok) throw new Error(result.error);

    const primarySymbol =
      currentSession.memo.tokenSymbol ??
      currentSession.evidence.market.symbol ??
      formatAddress(currentSession.memo.tokenAddress);
    const primaryChain = chainDisplayName(currentSession.evidence.chain);
    const usingLine = formatUsingCompare(
      { symbol: primarySymbol, chainLabel: primaryChain },
      { symbol: resolved.symbol, chainLabel: resolved.chainLabel },
    );

    const comparison = buildComparisonMessage(
      {
        memo: currentSession.memo,
        evidence: currentSession.evidence,
      },
      {
        memo: result.data.memo,
        evidence: result.data.evidence,
      },
    );

    setHideCuratedFollowUps(true);
    updateState(
      [
        ...withoutPickPrompts(currentMessages),
        { role: "assistant", content: usingLine, plain: true },
        { role: "assistant", content: comparison },
      ],
      currentSession,
    );
  }

  /**
   * Free-form A vs B — analyze both sides and compare. No prior session needed.
   * When the chat has no session yet, the left token becomes the active session.
   */
  async function runComparePair(
    left: TokenMention,
    right: TokenMention,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
    preResolved?: {
      left?: ResolvedPick;
      right?: ResolvedPick;
    },
  ) {
    setError(null);
    setSearchHits(null);
    setLoadingStage("fetching");
    pendingCompareRef.current = false;

    let leftResolved = preResolved?.left ?? null;
    let rightResolved = preResolved?.right ?? null;

    if (!leftResolved) {
      leftResolved = await resolveMentionForCompare(
        left,
        currentMessages,
        currentSession,
        matchesPrompt(left.value),
        () => {
          pendingComparePairRef.current = {
            waiting: "left",
            other: right,
            right: rightResolved ?? undefined,
          };
        },
      );
      if (!leftResolved) return;
    }

    if (!rightResolved) {
      rightResolved = await resolveMentionForCompare(
        right,
        currentMessages,
        currentSession,
        matchesPrompt(right.value),
        () => {
          pendingComparePairRef.current = {
            waiting: "right",
            other: left,
            left: leftResolved ?? undefined,
          };
        },
      );
      if (!rightResolved) return;
    }

    pendingComparePairRef.current = null;

    if (addressesEqual(leftResolved.address, rightResolved.address)) {
      throw new Error(
        "Those look like the same token. Pick two different tickers or addresses.",
      );
    }

    setLoadingStage("analyzing");
    const [leftResult, rightResult] = await Promise.all([
      analyzeTokenAction(leftResolved.address, leftResolved.chainId ?? null),
      analyzeTokenAction(rightResolved.address, rightResolved.chainId ?? null),
    ]);
    if (!leftResult.ok) throw new Error(leftResult.error);
    if (!rightResult.ok) throw new Error(rightResult.error);

    const leftLabel = {
      symbol:
        leftResult.data.memo.tokenSymbol ??
        leftResult.data.evidence.market.symbol ??
        leftResolved.symbol,
      chainLabel: chainDisplayName(leftResult.data.evidence.chain),
    };
    const rightLabel = {
      symbol:
        rightResult.data.memo.tokenSymbol ??
        rightResult.data.evidence.market.symbol ??
        rightResolved.symbol,
      chainLabel: chainDisplayName(rightResult.data.evidence.chain),
    };
    const usingLine = formatUsingCompare(leftLabel, rightLabel);

    const comparison = buildComparisonMessage(
      {
        memo: leftResult.data.memo,
        evidence: leftResult.data.evidence,
      },
      {
        memo: rightResult.data.memo,
        evidence: rightResult.data.evidence,
      },
      { freeFormPair: true },
    );

    // Prefer keeping an existing session; otherwise focus the left token.
    const nextSession: ClientSession = currentSession ?? {
      sessionId: leftResult.data.sessionId,
      evidence: leftResult.data.evidence,
      memo: leftResult.data.memo,
    };
    if (!currentSession) {
      saveClientSession(nextSession);
    }

    setHideCuratedFollowUps(true);
    updateState(
      [
        ...withoutPickPrompts(currentMessages),
        { role: "assistant", content: usingLine, plain: true },
        { role: "assistant", content: comparison },
      ],
      nextSession,
    );
  }

  function runGeneralAnswer(
    answer: string,
    currentMessages: ChatMessage[],
    currentSession: ClientSession | null,
  ) {
    const nextMessages: ChatMessage[] = [
      ...currentMessages,
      { role: "assistant", content: answer },
    ];
    updateState(nextMessages, currentSession);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || loadingStage || !ready) return;

    const userMessage: ChatMessage = { role: "user", content: value };
    const withUser = [...messages, userMessage];
    updateState(withUser, session);
    setInput("");

    try {
      setError(null);
      const intent = routeUserMessage(value, {
        messages: withUser,
        hasSession: Boolean(session),
        activeSymbol:
          session?.memo.tokenSymbol ?? session?.evidence.market.symbol,
        activeName: session?.memo.tokenName ?? session?.evidence.market.name,
        activeAddress: session?.memo.tokenAddress,
        activeChain: session?.evidence.chain,
      });

      if (intent.type === "analyze_token") {
        await runAnalysis(intent.address, undefined, withUser, session);
      } else if (intent.type === "analyze_ticker") {
        await runTickerSearch(intent.ticker, withUser, session);
      } else if (intent.type === "compare") {
        await runCompare(intent.target, withUser, session);
      } else if (intent.type === "compare_pair") {
        await runComparePair(
          intent.left,
          intent.right,
          withUser,
          session,
        );
      } else if (intent.type === "compare_prompt") {
        runComparePrompt(withUser, session);
      } else if (intent.type === "full_report") {
        runFullReport(withUser, session);
      } else if (intent.type === "follow_up") {
        await runFollowUp(intent.question, withUser, session);
      } else if (intent.type === "general") {
        runGeneralAnswer(intent.answer, withUser, session);
      } else {
        throw new Error(intent.reason);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateState(
        [...withUser, { role: "assistant", content: message }],
        session,
      );
    } finally {
      setLoadingStage(null);
    }
  }

  async function handleDemoToken(token: (typeof DEMO_TOKENS)[number]) {
    const userMessage: ChatMessage = { role: "user", content: token.label };
    const withUser = [...messages, userMessage];
    updateState(withUser, session);
    try {
      await runAnalysis(token.address, token.chainId, withUser, session);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateState(
        [...withUser, { role: "assistant", content: message }],
        session,
      );
    } finally {
      setLoadingStage(null);
      setInput("");
    }
  }

  async function handleFollowUpPrompt(prompt: string) {
    const userMessage: ChatMessage = { role: "user", content: prompt };
    const withUser = [...messages, userMessage];
    updateState(withUser, session);
    try {
      await runFollowUp(prompt, withUser, session);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateState(
        [...withUser, { role: "assistant", content: message }],
        session,
      );
    } finally {
      setLoadingStage(null);
      setInput("");
    }
  }

  async function handleFullReport() {
    const prompt = LAYER3_ACTIONS[1].prompt;
    const userMessage: ChatMessage = { role: "user", content: prompt };
    const withUser = [...messages, userMessage];
    updateState(withUser, session);
    try {
      runFullReport(withUser, session);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateState(
        [...withUser, { role: "assistant", content: message }],
        session,
      );
    } finally {
      setInput("");
    }
  }

  function handleCompareStart() {
    setInput(LAYER3_ACTIONS[0].inputPrefix);
  }

  async function handlePickHit(hit: TokenSearchHit) {
    // No blue user bubble for picks — confirmation is a plain “Using …” line.
    // Drop the temporary “A few matches…” line once a pick is made.
    const baseMessages = withoutPickPrompts(messages);
    setSearchHits(null);
    const forCompare = pendingCompareRef.current;
    pendingCompareRef.current = false;
    const pendingPair = pendingComparePairRef.current;
    pendingComparePairRef.current = null;
    const picked: ResolvedPick = {
      address: hit.address,
      chainId: hit.chainId,
      symbol: hit.symbol,
      chainLabel: hit.chainLabel,
    };
    try {
      if (pendingPair) {
        if (pendingPair.waiting === "left") {
          await runComparePair(
            { kind: "token", value: hit.address, chainId: hit.chainId },
            pendingPair.other,
            baseMessages,
            session,
            { left: picked, right: pendingPair.right },
          );
        } else {
          await runComparePair(
            pendingPair.other,
            { kind: "token", value: hit.address, chainId: hit.chainId },
            baseMessages,
            session,
            { left: pendingPair.left, right: picked },
          );
        }
      } else if (forCompare) {
        await runCompare(
          { kind: "token", value: hit.address, chainId: hit.chainId },
          baseMessages,
          session,
          picked,
        );
      } else {
        const withUsing: ChatMessage[] = [
          ...baseMessages,
          {
            role: "assistant",
            content: formatUsingSingle({
              symbol: hit.symbol,
              chainLabel: hit.chainLabel,
            }),
            plain: true,
          },
        ];
        updateState(withUsing, session);
        await runAnalysis(hit.address, hit.chainId, withUsing, session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateState(
        [...baseMessages, { role: "assistant", content: message }],
        session,
      );
    } finally {
      setLoadingStage(null);
    }
  }

  const chatIsEmpty = ready && messages.length === 0 && !loadingStage;
  const composerBusy = Boolean(loadingStage) || !ready;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-surface-border/60 px-6">
        <div className="flex h-14 items-center">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {PRODUCT_NAME}
          </h1>
        </div>
        <p className="-mt-1 pb-3 text-sm text-slate-400">{PRODUCT_TAGLINE}</p>
      </header>

      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {chatIsEmpty && (
            <div className="mb-8 text-center">
              <p className="text-lg font-medium text-white">
                What token should we look at?
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{WELCOME}</p>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={isUser ? "flex justify-end" : ""}
                >
                  <div
                    className={`${
                      isUser
                        ? "max-w-[85%] rounded-2xl bg-accent px-4 py-3 text-sm leading-6 text-white"
                        : "w-full space-y-4"
                    }`}
                  >
                    {!isUser &&
                      message.role === "assistant" &&
                      !message.memo &&
                      message.plain && (
                        <p className="text-sm leading-6 text-slate-400">
                          {message.content}
                        </p>
                      )}
                    {!isUser &&
                      message.role === "assistant" &&
                      !message.memo &&
                      !message.plain && (
                      <div className="rounded-2xl bg-surface-raised px-4 py-3 text-sm leading-6 text-slate-200">
                        <FormattedAnswer text={message.content} />
                      </div>
                    )}
                    {isUser && <p>{message.content}</p>}
                    {!isUser && message.role === "assistant" && message.memo && (
                      <>
                        <div className="space-y-3 text-sm leading-6 text-slate-300">
                          {buildMemoOpeningMessage(message.memo)
                            .split(/\n\n+/)
                            .filter(Boolean)
                            .map((paragraph) => (
                              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                            ))}
                        </div>
                        <TrustMemoCard
                          memo={message.memo}
                          evidence={
                            session &&
                            addressesEqual(
                              session.evidence.tokenAddress,
                              message.memo.tokenAddress,
                            )
                              ? session.evidence
                              : undefined
                          }
                          variant="inline"
                          narrativeExternal
                        />
                      </>
                    )}
                  </div>
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

          <div ref={bottomRef} className="h-4" aria-hidden />
        </div>
      </div>

      <ChatFooter
        input={input}
        loading={composerBusy}
        showFollowUps={Boolean(session) && !hideCuratedFollowUps}
        showLayer3={Boolean(session)}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onDemoToken={handleDemoToken}
        onFollowUp={handleFollowUpPrompt}
        onFullReport={handleFullReport}
        onCompareStart={handleCompareStart}
      />
    </div>
  );
}
