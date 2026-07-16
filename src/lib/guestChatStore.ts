import type { StoredConversation } from "@/lib/chatStorage";
import { deriveTitle } from "@/lib/chatStorage";
import type { ClientSession } from "@/lib/clientSession";
import type { ChatMessage } from "@/lib/types";

/**
 * In-memory guest chats — survive SPA navigation only.
 * Cleared on full page refresh / new tab.
 */
const guestStore = new Map<string, StoredConversation>();

export function listGuestConversations(): StoredConversation[] {
  return [...guestStore.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getGuestConversation(id: string): StoredConversation | null {
  return guestStore.get(id) ?? null;
}

export function saveGuestConversation(conversation: {
  id: string;
  title: string;
  messages: ChatMessage[];
  session: ClientSession | null;
}): StoredConversation {
  const next: StoredConversation = {
    ...conversation,
    updatedAt: Date.now(),
  };
  guestStore.set(next.id, next);
  return next;
}

export function createGuestConversation(id?: string): StoredConversation {
  const conversation: StoredConversation = {
    id: id ?? crypto.randomUUID(),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
    session: null,
  };
  guestStore.set(conversation.id, conversation);
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
}
