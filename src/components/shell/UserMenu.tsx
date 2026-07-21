"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { signOutAction } from "@/app/actions/auth";
import { clearClientSession } from "@/lib/clientSession";
import { clearGuestEntry } from "@/lib/guestEntry";
import { clearGuestConversations } from "@/lib/guestChatStore";
import { IconUser } from "./icons";

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAuthed = status === "authenticated";

  const label = isAuthed
    ? (session?.user?.name?.split(" ")[0] ??
      session?.user?.email ??
      "Account")
    : "Guest";
  const image = session?.user?.image;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setOpen(false);
    clearClientSession();
    clearGuestEntry();
    clearGuestConversations();
    await signOutAction();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center rounded-lg text-slate-300 transition hover:bg-surface-raised hover:text-white ${
          collapsed
            ? "mx-auto h-9 w-9 justify-center"
            : "w-full gap-3 px-3 py-2.5"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-border text-slate-400">
            <IconUser className="h-4 w-4" />
          </span>
        )}
        {!collapsed && <span className="truncate text-sm">{label}</span>}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 min-w-[10rem] rounded-xl border border-surface-border bg-surface-raised py-1 shadow-xl ${
            collapsed
              ? "bottom-full left-0 mb-2"
              : "bottom-full left-0 right-0 mb-2"
          }`}
        >
          {isAuthed ? (
            <>
              {session?.user?.email && (
                <p className="truncate border-b border-surface-border px-3 py-2 text-xs text-slate-500">
                  {session.user.email}
                </p>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface disabled:opacity-50"
              >
                {loggingOut ? "Signing out…" : "Log out"}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface"
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
