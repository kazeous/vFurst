"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false
    });

    setIsPending(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    window.location.assign("/dashboard");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block space-y-2 text-sm font-medium">
        <span>Email</span>
        <input className="w-full rounded-md border px-3 py-2" name="email" required type="email" />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Password</span>
        <input className="w-full rounded-md border px-3 py-2" minLength={12} name="password" required type="password" />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link className="font-medium text-primary" href="/auth/sign-up">
          Create an account
        </Link>
      </p>
    </form>
  );
}
