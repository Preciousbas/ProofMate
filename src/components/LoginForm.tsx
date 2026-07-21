"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAction,
  signInWithGoogleAction,
  signUpWithEmailAction,
  type AuthFormState,
} from "@/app/actions/auth";
import { markGuestEntry } from "@/lib/guestEntry";
import { createGuestConversation } from "@/lib/guestChatStore";

const initialState: AuthFormState = {};

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(
    signInWithEmailAction,
    initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUpWithEmailAction,
    initialState,
  );

  const pending = signInPending || signUpPending;
  const error =
    mode === "signin" ? signInState.error : signUpState.error;

  function continueAsGuest() {
    markGuestEntry();
    const conversation = createGuestConversation();
    router.push(`/chat/${conversation.id}`);
  }

  return (
    <div className="mt-6 space-y-5">
      <form action={signInWithGoogleAction}>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
        >
          <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-1.41-1.93-2.25-4.35-2.25-6.09s.84-4.16 2.25-6.09V2.84H2.18C1.43 4.74 1 7.07 1 8c0 .97.43 3.3 1.18 5.16l3.66 2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-border" />
        <span className="text-xs uppercase tracking-wide text-slate-500">
          or email
        </span>
        <div className="h-px flex-1 bg-surface-border" />
      </div>

      <form
        action={mode === "signin" ? signInAction : signUpAction}
        className="space-y-3 text-left"
      >
        {mode === "signup" && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">Name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              className="w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none ring-accent/40 placeholder:text-slate-500 focus:ring-2"
              placeholder="Optional"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs text-slate-400">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none ring-accent/40 placeholder:text-slate-500 focus:ring-2"
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-slate-400">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            className="w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none ring-accent/40 placeholder:text-slate-500 focus:ring-2"
            placeholder="At least 8 characters"
          />
        </label>

        {error && (
          <p className="text-sm text-risk-high" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in with email"
              : "Create account"}
        </button>
      </form>

      <p className="text-sm text-slate-400">
        {mode === "signin" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-accent hover:underline"
            >
              Sign up
            </button>
            <span className="text-slate-600"> · </span>
            <button
              type="button"
              onClick={continueAsGuest}
              className="text-slate-300 hover:text-white hover:underline"
            >
              Sign up later
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-accent hover:underline"
            >
              Sign in
            </button>
            <span className="text-slate-600"> · </span>
            <button
              type="button"
              onClick={continueAsGuest}
              className="text-slate-300 hover:text-white hover:underline"
            >
              Sign up later
            </button>
          </>
        )}
      </p>
      <p className="text-xs text-slate-500">
        Guest chats stay in this browser tab only. Sign in to save chats across
        devices.
      </p>
    </div>
  );
}
