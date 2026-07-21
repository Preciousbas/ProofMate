/** Browser-session flag: user explicitly entered guest mode from /login. */
const GUEST_ENTRY_KEY = "proofmate-guest-entry";

export function markGuestEntry(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GUEST_ENTRY_KEY, "1");
  } catch {
    // ignore
  }
}

export function hasGuestEntry(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(GUEST_ENTRY_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearGuestEntry(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(GUEST_ENTRY_KEY);
  } catch {
    // ignore
  }
}
