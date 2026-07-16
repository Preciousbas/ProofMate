import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSessionProvider>
      <AppShell>{children}</AppShell>
    </AuthSessionProvider>
  );
}
