import type { ClientSession } from "./clientSession";
import type { ChatMessage } from "./types";

/** Shared conversation shape used by the sidebar and chat thread. */
export interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  session: ClientSession | null;
}

const SIDEBAR_COLLAPSED_KEY = "proofmate-sidebar-collapsed";

export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.content.trim();
  if (text.length <= 40) return text;
  return `${text.slice(0, 37)}…`;
}

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}
