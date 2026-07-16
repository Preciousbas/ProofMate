"use server";

import { auth } from "@/auth";
import { deriveTitle } from "@/lib/chatStorage";
import type { ClientSession } from "@/lib/clientSession";
import {
  createConversationForUser,
  deleteConversationForUser,
  getConversationForUser,
  getLatestConversationIdForUser,
  listConversationsForUser,
  saveConversationForUser,
  type StoredConversation,
} from "@/lib/conversations";
import type { ChatMessage } from "@/lib/types";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function listChatsAction(): Promise<StoredConversation[]> {
  const userId = await requireUserId();
  return listConversationsForUser(userId);
}

export async function getChatAction(
  id: string,
): Promise<StoredConversation | null> {
  const userId = await requireUserId();
  return getConversationForUser(userId, id);
}

export async function createChatAction(
  id?: string,
): Promise<StoredConversation> {
  const userId = await requireUserId();
  return createConversationForUser(userId, id);
}

export async function saveChatAction(input: {
  id: string;
  title?: string;
  messages: ChatMessage[];
  session: ClientSession | null;
}): Promise<StoredConversation> {
  const userId = await requireUserId();
  return saveConversationForUser(userId, {
    id: input.id,
    title: input.title ?? deriveTitle(input.messages),
    messages: input.messages,
    session: input.session,
  });
}

export async function deleteChatAction(id: string): Promise<void> {
  const userId = await requireUserId();
  await deleteConversationForUser(userId, id);
}

export async function getOrCreateLatestChatAction(): Promise<string> {
  const userId = await requireUserId();
  const latest = await getLatestConversationIdForUser(userId);
  if (latest) return latest;
  const conversation = await createConversationForUser(userId);
  return conversation.id;
}
