import type { TokenEvidence, TrustMemo } from "./types";

const SESSION_STORAGE_KEY = "proofmate-session";

export interface ClientSession {
  sessionId: string;
  evidence: TokenEvidence;
  memo: TrustMemo;
}

export function saveClientSession(session: ClientSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage may be unavailable (private mode, quota)
  }
}

export function loadClientSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClientSession;
  } catch {
    return null;
  }
}

export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
