"use server";

import { safeLocalReturnPath } from "@vfurst/auth/core";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export async function signInWithCredentials(formData: FormData) {
  const returnTo = safeLocalReturnPath(String(formData.get("returnTo") ?? ""), "/");

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: returnTo
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const params = new URLSearchParams({ error: "invalid_credentials", returnTo });
      redirect(`/login?${params.toString()}`);
    }
    throw error;
  }
}

export async function signInWithGoogle(formData: FormData) {
  const returnTo = safeLocalReturnPath(String(formData.get("returnTo") ?? ""), "/");
  await signIn("google", { redirectTo: returnTo });
}
