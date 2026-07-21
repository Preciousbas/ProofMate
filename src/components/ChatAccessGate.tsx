"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { hasGuestEntry } from "@/lib/guestEntry";

/**
 * Allows chat routes for signed-in users or guests who explicitly entered
 * from /login. Everyone else is sent to the auth entry page.
 */
export function ChatAccessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") return;
    if (hasGuestEntry()) return;
    router.replace("/login");
  }, [router, status]);

  if (status === "loading") {
    return null;
  }

  if (status !== "authenticated" && !hasGuestEntry()) {
    return null;
  }

  return <>{children}</>;
}
