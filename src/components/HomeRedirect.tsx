"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getOrCreateLatestChatAction } from "@/app/actions/chats";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";
import { getOrCreateLatestGuestConversationId } from "@/lib/guestChatStore";

/**
 * Routes `/` into the latest chat. Shows an immediate empty-chat shell
 * (including the composer) so login / guest entry never looks blank.
 */
export function HomeRedirect() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    let cancelled = false;
    (async () => {
      if (status === "authenticated") {
        const id = await getOrCreateLatestChatAction();
        if (!cancelled) router.replace(`/chat/${id}`);
        return;
      }
      const id = getOrCreateLatestGuestConversationId();
      if (!cancelled) router.replace(`/chat/${id}`);
    })().catch(() => {
      if (!cancelled) {
        const id = getOrCreateLatestGuestConversationId();
        router.replace(`/chat/${id}`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, status]);

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <div className="mb-8 text-center">
            <p className="text-lg font-medium text-white">
              What token should we look at?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Drop in a token address or ticker. I’ll check public data and flag
              what looks off.
            </p>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-surface-border/80 bg-[#0c1014]/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-3">
          <div className="relative">
            <textarea
              rows={1}
              placeholder="Message ProofMate…"
              disabled
              aria-busy="true"
              className="max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-surface-border bg-surface px-4 py-3.5 pr-14 text-sm text-white outline-none disabled:opacity-60"
            />
            <span
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white opacity-40"
              aria-hidden
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 19V5M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Research only — not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
