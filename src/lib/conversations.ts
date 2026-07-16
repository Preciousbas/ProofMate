import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversations } from "@/db/schema";
import type { StoredConversation } from "@/lib/chatStorage";
import type { ClientSession } from "@/lib/clientSession";

export type { StoredConversation };

function toStored(
  row: typeof conversations.$inferSelect,
): StoredConversation {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.getTime(),
    messages: row.messages ?? [],
    session: row.session ?? null,
  };
}

export async function listConversationsForUser(
  userId: string,
): Promise<StoredConversation[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
  return rows.map(toStored);
}

export async function getConversationForUser(
  userId: string,
  id: string,
): Promise<StoredConversation | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return row ? toStored(row) : null;
}

export async function createConversationForUser(
  userId: string,
  id?: string,
): Promise<StoredConversation> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(conversations)
    .values({
      id: id ?? crypto.randomUUID(),
      userId,
      title: "New chat",
      messages: [],
      session: null,
      updatedAt: now,
      createdAt: now,
    })
    .returning();
  return toStored(row);
}

export async function saveConversationForUser(
  userId: string,
  conversation: Omit<StoredConversation, "updatedAt"> & {
    updatedAt?: number;
  },
): Promise<StoredConversation> {
  const db = getDb();
  const existing = await getConversationForUser(userId, conversation.id);
  const now = new Date();

  if (existing) {
    const [row] = await db
      .update(conversations)
      .set({
        title: conversation.title,
        messages: conversation.messages,
        session: conversation.session,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversations.id, conversation.id),
          eq(conversations.userId, userId),
        ),
      )
      .returning();
    return toStored(row);
  }

  const [row] = await db
    .insert(conversations)
    .values({
      id: conversation.id,
      userId,
      title: conversation.title,
      messages: conversation.messages,
      session: conversation.session,
      updatedAt: now,
      createdAt: now,
    })
    .returning();
  return toStored(row);
}

export async function deleteConversationForUser(
  userId: string,
  id: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

export async function getLatestConversationIdForUser(
  userId: string,
): Promise<string | null> {
  const list = await listConversationsForUser(userId);
  return list[0]?.id ?? null;
}

// ClientSession re-export keeps action imports tidy.
export type { ClientSession };
