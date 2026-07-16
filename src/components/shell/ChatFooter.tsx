"use client";

import { FormEvent, useRef } from "react";
import {
  CURATED_FOLLOW_UPS,
  DEMO_TOKENS,
  LAYER3_ACTIONS,
} from "@/lib/constants";

interface ChatFooterProps {
  input: string;
  loading: boolean;
  /** Curated holders / liquidity / contract / score chips. */
  showFollowUps: boolean;
  /** Layer 3 compare / full report chips (can show without curated FAQs). */
  showLayer3?: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onDemoToken: (token: (typeof DEMO_TOKENS)[number]) => void;
  onFollowUp: (prompt: string) => void;
  /** Layer 3 — submit “Generate full report” as a user message. */
  onFullReport: () => void;
  /** Layer 3 — prefill `/compare ` so the user can name the peer token. */
  onCompareStart: () => void;
}

export function ChatFooter({
  input,
  loading,
  showFollowUps,
  showLayer3 = false,
  onInputChange,
  onSubmit,
  onDemoToken,
  onFollowUp,
  onFullReport,
  onCompareStart,
}: ChatFooterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleCompareStart() {
    onCompareStart();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  const showDemos = !showFollowUps && !showLayer3;

  return (
    <footer className="shrink-0 border-t border-surface-border/80 bg-[#0c1014]/90 backdrop-blur-md">
      <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-3">
        {showDemos && (
          <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
            {DEMO_TOKENS.map((token) => (
              <button
                key={`${token.chainId}-${token.address}`}
                type="button"
                onClick={() => onDemoToken(token)}
                disabled={loading}
                className="shrink-0 whitespace-nowrap rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-white disabled:opacity-50"
              >
                {token.label}
              </button>
            ))}
          </div>
        )}

        {(showFollowUps || showLayer3) && (
          <div className="mb-3 space-y-2">
            {showFollowUps && (
              <div className="flex flex-wrap gap-2">
                {CURATED_FOLLOW_UPS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onFollowUp(prompt)}
                    disabled={loading}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-slate-200 hover:bg-accent/20 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {showLayer3 && (
              <div className="flex flex-wrap gap-2">
                {LAYER3_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      if (action.id === "compare") handleCompareStart();
                      else onFullReport();
                    }}
                    disabled={loading}
                    className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs text-slate-300 hover:border-accent hover:text-white disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder="Message ProofMate…"
            disabled={loading}
            className="max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-surface-border bg-surface px-4 py-3.5 pr-14 text-sm text-white outline-none ring-accent focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40"
            aria-label="Send"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 19V5M5 12l7-7 7 7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          Research only — not financial advice.
        </p>
      </div>
    </footer>
  );
}
