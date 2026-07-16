"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StoredConversation } from "@/lib/chatStorage";
import { LogoMark } from "../Logo";
import { IconPanelLeft, IconPlus } from "./icons";
import { UserMenu } from "./UserMenu";

interface SidebarProps {
  collapsed: boolean;
  conversations: StoredConversation[];
  onToggle: () => void;
  onNewChat: () => void;
}

export function Sidebar({
  collapsed,
  conversations,
  onToggle,
  onNewChat,
}: SidebarProps) {
  const pathname = usePathname();
  const activeId = pathname?.match(/^\/chat\/([^/]+)/)?.[1] ?? null;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col border-r border-surface-border bg-surface transition-[width] duration-200 ease-out md:z-30"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div
        className={`flex h-14 shrink-0 items-center px-2 ${
          collapsed ? "justify-center" : "justify-between px-3"
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-raised"
            aria-label="Expand sidebar"
          >
            <LogoMark size={28} tone="onDark" title="ProofMate" />
          </button>
        ) : (
          <>
            <Link
              href="/"
              className="flex items-center rounded-lg hover:opacity-90"
              aria-label="ProofMate home"
            >
              <LogoMark size={28} tone="onDark" />
            </Link>
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-raised hover:text-white"
              aria-label="Collapse sidebar"
            >
              <IconPanelLeft />
            </button>
          </>
        )}
      </div>

      {collapsed ? (
        <div className="flex flex-col items-center px-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-surface-raised hover:text-white"
            aria-label="New chat"
          >
            <IconPlus />
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-surface-raised"
          >
            <IconPlus className="h-4 w-4 shrink-0" />
            New chat
          </button>

          <nav className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {conversations.length > 0 && (
              <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Recents
              </p>
            )}
            <ul className="space-y-0.5">
              {conversations.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/chat/${conversation.id}`}
                      className={`block truncate rounded-lg px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-surface-raised text-white"
                          : "text-slate-400 hover:bg-surface-raised/60 hover:text-slate-200"
                      }`}
                    >
                      {conversation.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      {collapsed && <div className="flex-1" />}

      <div className="shrink-0 border-t border-surface-border p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
