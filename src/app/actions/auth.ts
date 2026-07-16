"use server";

import { AuthError } from "next-auth";
import { eq } from "drizzle-orm";
import { credentialsSchema, hashPassword, signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export type AuthFormState = {
  error?: string;
  mode?: "signin" | "signup";
};

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function signInWithGoogleAction() {
  await signIn("google", { redirectTo: "/" });
}

export async function signInWithEmailAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      mode: "signin",
      error: "Enter a valid email and a password of at least 8 characters.",
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/",
    });
    return { mode: "signin" };
  } catch (error) {
    if (error instanceof AuthError) {
      return { mode: "signin", error: "Invalid email or password." };
    }
    throw error;
  }
}

export async function signUpWithEmailAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      mode: "signup",
      error: "Enter a valid email and a password of at least 8 characters.",
    };
  }

  if (name.length > 80) {
    return { mode: "signup", error: "Name is too long." };
  }

  const email = parsed.data.email.toLowerCase();
  const db = getDb();

  const [existing] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing?.passwordHash) {
    return {
      mode: "signup",
      error: "An account with this email already exists. Sign in instead.",
    };
  }

  if (existing && !existing.passwordHash) {
    return {
      mode: "signup",
      error:
        "This email is already linked to Google. Continue with Google instead.",
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.insert(users).values({
    email,
    name: name || email.split("@")[0],
    passwordHash,
  });

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/",
    });
    return { mode: "signup" };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        mode: "signup",
        error: "Account created, but sign-in failed. Try signing in.",
      };
    }
    throw error;
  }
}
