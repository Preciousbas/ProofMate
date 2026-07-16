import { auth } from "@/auth";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Logo";
import { PRODUCT_TAGLINE } from "@/lib/constants";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a2820_0%,_#0f1419_48%,_#0c1014_100%)] px-4">
      <div className="w-full max-w-sm text-center">
        <Logo size="lg" tone="onDark" />
        <p className="mt-3 text-sm text-slate-400">{PRODUCT_TAGLINE}</p>
        <p className="mt-8 text-sm text-slate-300">
          Sign in with Google or email to save chats across devices — or continue
          as a guest.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
