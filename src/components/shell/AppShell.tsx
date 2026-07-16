"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  createChatAction,
  listChatsAction,
} from "@/app/actions/chats";
import {
  getSidebarCollapsed,
  setSidebarCollapsed,
  type StoredConversation,
} from "@/lib/chatStorage";
import {
  createGuestConversation,
  listGuestConversations,
} from "@/lib/guestChatStore";
import { Sidebar } from "./Sidebar";

const SIDEBAR_EXPANDED = "16.25rem";
const SIDEBAR_COLLAPSED = "3.25rem";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [, startTransition] = useTransition();

  const refreshConversations = useCallback(async () => {
    if (status === "loading") return;
    if (isAuthed) {
      try {
        const list = await listChatsAction();
        setConversations(list);
      } catch {
        setConversations([]);
      }
      return;
    }
    setConversations(listGuestConversations());
  }, [isAuthed, status]);

  useEffect(() => {
    setCollapsed(getSidebarCollapsed());

    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    void refreshConversations().finally(() => setHydrated(true));
  }, [refreshConversations, status]);

  useEffect(() => {
    function onRefresh() {
      void refreshConversations();
    }
    window.addEventListener("proofmate:conversations", onRefresh);
    return () => {
      window.removeEventListener("proofmate:conversations", onRefresh);
    };
  }, [refreshConversations]);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCollapsed(next);
      return next;
    });
  }

  function handleNewChat() {
    startTransition(async () => {
      if (isAuthed) {
        const conversation = await createChatAction();
        await refreshConversations();
        router.push(`/chat/${conversation.id}`);
        return;
      }
      const conversation = createGuestConversation();
      await refreshConversations();
      router.push(`/chat/${conversation.id}`);
    });
  }

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const mainOffset = mobile ? SIDEBAR_COLLAPSED : sidebarWidth;

  if (!hydrated || status === "loading") {
    return (
      <div
        className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1a2820_0%,_#0f1419_48%,_#0c1014_100%)]"
        style={{ "--sidebar-width": SIDEBAR_EXPANDED } as React.CSSProperties}
      />
    );
  }

  return (
    <div
      className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1a2820_0%,_#0f1419_48%,_#0c1014_100%)]"
      style={{ "--sidebar-width": sidebarWidth } as React.CSSProperties}
    >
      {!collapsed && mobile && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={handleToggle}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        conversations={conversations}
        onToggle={handleToggle}
        onNewChat={handleNewChat}
      />
      <div
        className="flex h-dvh flex-col overflow-hidden transition-[margin] duration-200 ease-out"
        style={{ marginLeft: mainOffset }}
      >
        {!isAuthed && !collapsed && (
          <div className="shrink-0 border-b border-surface-border/60 bg-surface/80 px-4 py-2 text-center text-xs text-slate-400 md:px-6">
            Guest mode — chats are lost if you refresh or leave.{" "}
            <a href="/login" className="text-accent hover:underline">
              Sign in to save
            </a>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function notifyConversationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("proofmate:conversations"));
  }
}
