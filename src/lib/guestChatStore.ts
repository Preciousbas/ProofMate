import type { StoredConversation } from "@/lib/chatStorage";
import { deriveTitle } from "@/lib/chatStorage";
import type { ClientSession } from "@/lib/clientSession";
import type { ChatMessage } from "@/lib/types";

const GUEST_CHATS_KEY = "proofmate-guest-chats";

/**
 * Guest chats for the current browser tab session.
 * Backed by sessionStorage so refresh keeps the active guest thread
 * (ChatGPT-style). Cleared when the tab closes or on sign-in cleanup.
 */
const guestStore = new Map<string, StoredConversation>();

function hydrateGuestStore(): void {
  if (typeof window === "undefined" || guestStore.size > 0) return;
  try {
    const raw = sessionStorage.getItem(GUEST_CHATS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredConversation[];
    if (!Array.isArray(parsed)) return;
    for (const conversation of parsed) {
      if (conversation?.id) {
        guestStore.set(conversation.id, conversation);
      }
    }
  } catch {
    // ignore corrupt storage
  }
}

function flushGuestStore(): void {
  if (typeof window === "undefined") return;
  try {
    const list = [...guestStore.values()];
    if (list.length === 0) {
      sessionStorage.removeItem(GUEST_CHATS_KEY);
      return;
    }
    sessionStorage.setItem(GUEST_CHATS_KEY, JSON.stringify(list));
  } catch {
    // ignore quota / private mode
  }
}

export function listGuestConversations(): StoredConversation[] {
  hydrateGuestStore();
  return [...guestStore.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getGuestConversation(id: string): StoredConversation | null {
  hydrateGuestStore();
  return guestStore.get(id) ?? null;
}

export function saveGuestConversation(conversation: {
  id: string;
  title: string;
  messages: ChatMessage[];
  session: ClientSession | null;
}): StoredConversation {
  hydrateGuestStore();
  const next: StoredConversation = {
    ...conversation,
    updatedAt: Date.now(),
  };
  guestStore.set(next.id, next);
  flushGuestStore();
  return next;
}

export function createGuestConversation(id?: string): StoredConversation {
  hydrateGuestStore();
  const conversation: StoredConversation = {
    id: id ?? crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
    session: null,
  };
  guestStore.set(conversation.id, conversation);
  flushGuestStore();
  return conversation;
}

export function getLatestGuestConversationId(): string | null {
  return listGuestConversations()[0]?.id ?? null;
}

export function getOrCreateLatestGuestConversationId(): string {
  const latest = getLatestGuestConversationId();
  if (latest) return latest;
  return createGuestConversation().id;
}

export function persistGuestChat(
  id: string,
  messages: ChatMessage[],
  session: ClientSession | null,
): StoredConversation {
  return saveGuestConversation({
    id,
    title: deriveTitle(messages),
    messages,
    session,
  });
}

export function clearGuestConversations(): void {
  guestStore.clear();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(GUEST_CHATS_KEY);
    } catch {
      // ignore
    }
  }
}
