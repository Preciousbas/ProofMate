"use client";

import { useEffect, useRef, useState } from "react";
import type { TrustMemo } from "@/lib/types";

const riskColors = {
  low: "text-risk-low border-risk-low/40 bg-risk-low/10",
  moderate: "text-risk-moderate border-risk-moderate/40 bg-risk-moderate/10",
  high: "text-risk-high border-risk-high/40 bg-risk-high/10",
} as const;

interface TrustMemoCardProps {
  memo: TrustMemo;
}

function factValue(facts: string[], prefix: string): string | undefined {
  const match = facts.find((fact) => fact.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
}


export function TrustMemoCard({ memo }: TrustMemoCardProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  const price = factValue(memo.keyFacts, "Price:");
  const holders = factValue(memo.keyFacts, "Total holders:");
  const top10 = factValue(memo.keyFacts, "Top 10 concentration:");
  const liquidity = factValue(memo.keyFacts, "Best-pair liquidity:");
  const volume = factValue(memo.keyFacts, "24h volume:");
  const chain = factValue(memo.keyFacts, "Chain:");

  const snapshot = [
    { label: "Chain", value: chain },
    { label: "Price", value: price },
    { label: "Holders", value: holders },
    { label: "Top 10", value: top10 },
    { label: "Liquidity", value: liquidity },
    { label: "24h volume", value: volume },
  ].filter((item) => item.value);

  useEffect(() => {
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
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full min-w-0 border-b border-surface-border bg-surface-raised last:border-b-0"
    >
      {/* Leaves the scrollport just as this header reaches top:0 */}
      <div
        ref={sentinelRef}
        className="pointer-events-none absolute top-0 h-px w-full"
        aria-hidden
      />

      <header
        className={`sticky top-0 z-20 flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 transition-[box-shadow,background-color,border-color] duration-200 sm:px-6 ${
          pinned
            ? "border-b border-surface-border bg-[#15202b]/95 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md"
            : "border-b border-transparent bg-surface-raised"
        }`}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-white">
            {memo.tokenName ?? "Token"}{" "}
            {memo.tokenSymbol ? `(${memo.tokenSymbol})` : ""}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${riskColors[memo.riskLevel]}`}
        >
          {memo.riskScore}/100 · {memo.riskLabel}
        </span>
      </header>

      <div className="w-full min-w-0 space-y-5 px-5 pb-6 pt-5 text-sm leading-6 text-slate-200 sm:px-6">
        {snapshot.length > 0 && (
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
        )}

        <div>
          <h4 className="mb-1.5 font-medium text-white">Summary</h4>
          <p className="text-slate-300">{memo.summary}</p>
        </div>

        <div>
          <h4 className="mb-1.5 font-medium text-white">Key facts</h4>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            {memo.keyFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-2 font-medium text-white">Red flags</h4>
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
                  <summary className="cursor-pointer font-medium text-white">
                    [{flag.severity}] {flag.title}
                  </summary>
                  <p className="mt-2 text-slate-300">{flag.description}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-400">
                    Evidence: {flag.evidence}
                  </p>
                </details>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-1.5 font-medium text-white">Recommendation</h4>
          <p className="text-slate-300">{memo.recommendation}</p>
        </div>

        {Array.isArray(memo.inferences) && memo.inferences.length > 0 && (
          <div>
            <h4 className="mb-1.5 font-medium text-white">Inferences</h4>
            <ul className="list-disc space-y-1 pl-5 text-slate-300">
              {memo.inferences.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="min-w-0">
          <h4 className="mb-1.5 font-medium text-white">Sources</h4>
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
        </div>
      </div>
    </section>
  );
}
