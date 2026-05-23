"use client";

import Link from "next/link";
import { useState } from "react";

type InviteAcceptClientProps = {
  token: string;
};

export function InviteAcceptClient({ token }: InviteAcceptClientProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function acceptInvite() {
    setIsPending(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/invites/${token}/accept`, {
      method: "POST"
    });
    const body = (await response.json().catch(() => null)) as { type?: string; error?: string } | null;
    setIsPending(false);

    if (!response.ok) {
      setError(body?.error ?? "Unable to accept invite.");
      return;
    }

    setMessage(`Accepted ${body?.type ?? "team"} invite.`);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-lg flex-col justify-center gap-5 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Invite</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Accept team invite</h1>
      </div>
      <p className="break-all rounded-md border bg-card p-4 text-sm text-muted-foreground">{token}</p>
      {message ? <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          disabled={isPending}
          onClick={acceptInvite}
          type="button"
        >
          {isPending ? "Accepting..." : "Accept invite"}
        </button>
        <Link className="rounded-md border px-4 py-2 font-medium" href="/dashboard">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
