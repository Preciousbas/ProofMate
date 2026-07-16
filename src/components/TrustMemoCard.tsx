"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buildMemoOpeningMessage } from "@/lib/memo/opening";
import {
  buildContractRows,
  buildHolderRows,
  buildLiquidityRows,
  buildSnapshot,
  formatHolderLabel,
} from "@/lib/memo/sections";
import { publicHoldersStatus } from "@/lib/evidence/holdersCopy";
import type { TokenEvidence, TrustMemo } from "@/lib/types";
import {
  addressesEqual,
  formatAddress,
  formatPercent,
} from "@/lib/validation";

const riskColors = {
  low: "text-risk-low border-risk-low/40 bg-risk-low/10",
  moderate: "text-risk-moderate border-risk-moderate/40 bg-risk-moderate/10",
  high: "text-risk-high border-risk-high/40 bg-risk-high/10",
} as const;

interface TrustMemoCardProps {
  memo: TrustMemo;
  /** When present and matching the memo token, powers Holders/Contract tables. */
  evidence?: TokenEvidence;
  variant?: "panel" | "inline";
  /**
   * When true, Summary omits the prose already shown in the chat opening message.
   * Defaults to true for inline (thread) cards.
   */
  narrativeExternal?: boolean;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

function MemoSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-t border-surface-border first:border-t-0">
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:text-white"
        >
          <span className="min-w-0 flex-1 font-medium text-white">{title}</span>
          {badge}
          <Chevron open={open} />
        </button>
      </h4>
      <div
        id={panelId}
        role="region"
        hidden={!open}
        className={open ? "pb-4" : undefined}
      >
        {open ? children : null}
      </div>
    </div>
  );
}

function FactList({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) {
    return <p className="text-slate-400">Nothing more in this snapshot.</p>;
  }

  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="grid gap-0.5 sm:grid-cols-[minmax(8rem,11rem)_1fr] sm:gap-3"
        >
          <dt className="text-xs uppercase tracking-wider text-slate-500">
            {row.label}
          </dt>
          <dd
            className={`min-w-0 break-all text-sm text-slate-300 ${
              row.value.length > 24 || row.value.startsWith("0x")
                ? "font-mono"
                : ""
            }`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TrustMemoCard({
  memo,
  evidence,
  variant = "panel",
  narrativeExternal,
}: TrustMemoCardProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const inline = variant === "inline";
  const hideNarrative = narrativeExternal ?? inline;

  const matchedEvidence =
    evidence && addressesEqual(evidence.tokenAddress, memo.tokenAddress)
      ? evidence
      : undefined;

  const snapshot = buildSnapshot(memo, matchedEvidence);
  const holders = buildHolderRows(memo, matchedEvidence);
  const contractRows = buildContractRows(memo, matchedEvidence);
  const liquidityRows = buildLiquidityRows(memo, matchedEvidence);
  const highFlagCount = memo.redFlags.filter(
    (flag) => flag.severity === "high",
  ).length;

  useEffect(() => {
    if (inline) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-memo-scroll]") as HTMLElement | null;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { root, threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [inline]);

  return (
    <section
      ref={sectionRef}
      aria-label={`Trust memo for ${memo.tokenSymbol ?? memo.tokenName ?? "token"}`}
      className={`relative w-full min-w-0 bg-surface-raised ${
        inline
          ? "overflow-hidden rounded-2xl border border-surface-border"
          : "border-b border-surface-border last:border-b-0"
      }`}
    >
      {!inline && (
        <div
          ref={sentinelRef}
          className="pointer-events-none absolute top-0 h-px w-full"
          aria-hidden
        />
      )}

      <header
        className={`flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 ${
          inline
            ? "border-b border-surface-border bg-surface-raised"
            : `sticky top-0 z-20 transition-[box-shadow,background-color,border-color] duration-200 ${
                pinned
                  ? "border-b border-surface-border bg-[#15202b]/95 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md"
                  : "border-b border-transparent bg-surface-raised"
              }`
        }`}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-white">
            {memo.tokenName ?? "Token"}{" "}
            {memo.tokenSymbol ? `(${memo.tokenSymbol})` : ""}
          </h3>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
            {formatAddress(memo.tokenAddress, 8)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${riskColors[memo.riskLevel]}`}
        >
          {memo.riskScore}/100 · {memo.riskLabel}
        </span>
      </header>

      <div className="w-full min-w-0 px-5 text-sm leading-6 text-slate-200 sm:px-6">
        <MemoSection title="Summary" defaultOpen>
          <div className="space-y-4">
            {!hideNarrative && (
              <div className="space-y-3 text-slate-300">
                {buildMemoOpeningMessage(memo)
                  .split("\n\n")
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            )}

            {snapshot.length > 0 && (
              <div>
                {!hideNarrative && (
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                    At a glance
                  </p>
                )}
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                  {snapshot.map((item) => (
                    <div
                      key={item.label}
                      className="min-w-0 rounded-xl border border-surface-border bg-surface/80 px-3 py-2.5"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-100">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(memo.inferences) && memo.inferences.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                  What this may mean
                </p>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {memo.inferences.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs leading-5 text-slate-500">{memo.disclaimer}</p>
          </div>
        </MemoSection>

        <MemoSection
          title="Red flags"
          defaultOpen
          badge={
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                memo.redFlags.length === 0
                  ? "bg-surface text-slate-400"
                  : highFlagCount > 0
                    ? "bg-risk-high/15 text-risk-high"
                    : "bg-risk-moderate/15 text-risk-moderate"
              }`}
            >
              {memo.redFlags.length}
            </span>
          }
        >
          {memo.redFlags.length === 0 ? (
            <p className="text-slate-400">
              No major red flags in this snapshot.
            </p>
          ) : (
            <div className="space-y-2">
              {memo.redFlags.map((flag) => (
                <details
                  key={`${flag.title}-${flag.evidence}`}
                  className="rounded-xl border border-surface-border bg-surface/80 p-3"
                >
                  <summary className="cursor-pointer list-none font-medium text-white [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">
                      [{flag.severity}]
                    </span>
                    {flag.title}
                  </summary>
                  <p className="mt-2 text-slate-300">{flag.description}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-400">
                    Evidence: {flag.evidence}
                  </p>
                </details>
              ))}
            </div>
          )}
        </MemoSection>

        <MemoSection
          title="Holders"
          defaultOpen={false}
          badge={
            holders.rows.find((row) => row.label.includes("Top 10"))?.value ? (
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs tabular-nums text-slate-400">
                Top 10{" "}
                {holders.rows.find((row) => row.label.includes("Top 10"))?.value}
              </span>
            ) : undefined
          }
        >
          {!holders.available && holders.rows.length === 0 ? (
            <p className="text-slate-400">
              {publicHoldersStatus({
                chain: evidence?.chain,
                available: false,
                error: holders.error,
              })}
            </p>
          ) : (
            <div className="space-y-4">
              <FactList rows={holders.rows.filter((r) => r.label !== "Top holders")} />
              {holders.topHolders.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-surface-border">
                  <table className="w-full min-w-[18rem] text-left text-sm">
                    <thead className="border-b border-surface-border bg-surface/60 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Wallet</th>
                        <th className="px-3 py-2 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holders.topHolders.map((holder, index) => (
                        <tr
                          key={`${holder.address}-${index}`}
                          className="border-b border-surface-border/70 last:border-b-0"
                          title={holder.labelNote}
                        >
                          <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2 font-mono text-slate-300">
                            {formatHolderLabel(holder)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                            {formatPercent(holder.percentage)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </MemoSection>

        <MemoSection
          title="Liquidity"
          defaultOpen={false}
          badge={
            matchedEvidence?.market.liquidityLock?.status ? (
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs tabular-nums text-slate-400">
                Lock{" "}
                {matchedEvidence.market.liquidityLock.status === "unknown"
                  ? "n/a"
                  : matchedEvidence.market.liquidityLock.status}
              </span>
            ) : undefined
          }
        >
          <FactList rows={liquidityRows} />
        </MemoSection>

        <MemoSection title="Contract" defaultOpen={false}>
          <FactList rows={contractRows} />
        </MemoSection>

        <MemoSection
          title="Sources"
          defaultOpen={false}
          badge={
            <span className="rounded-md bg-surface px-2 py-0.5 text-xs tabular-nums text-slate-400">
              {memo.sources.length}
            </span>
          }
        >
          {memo.sources.length === 0 ? (
            <p className="text-slate-400">No sources listed.</p>
          ) : (
            <ul className="space-y-1.5">
              {memo.sources.map((source) => (
                <li key={source} className="min-w-0">
                  <a
                    href={source}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm text-accent hover:underline"
                  >
                    {source}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </MemoSection>
      </div>
    </section>
  );
}
