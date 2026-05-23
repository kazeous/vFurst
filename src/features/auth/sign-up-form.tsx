"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        email,
        password
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Account creation failed.");
      setIsPending(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    setIsPending(false);

    if (result?.error) {
      window.location.assign("/auth/sign-in");
      return;
    }

    window.location.assign("/dashboard");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block space-y-2 text-sm font-medium">
        <span>Name</span>
        <input className="w-full rounded-md border px-3 py-2" maxLength={120} name="name" required />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Email</span>
        <input className="w-full rounded-md border px-3 py-2" maxLength={254} name="email" required type="email" />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Password</span>
        <input className="w-full rounded-md border px-3 py-2" minLength={12} name="password" required type="password" />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary" href="/auth/sign-in">
          Sign in
        </Link>
      </p>
    </form>
  );
}
