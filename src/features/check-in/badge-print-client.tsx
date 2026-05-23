"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BadgeRegistration = {
  id: string;
  checkedInAt: string | null;
  badgeStatus: string;
  attendeeProfile: {
    firstName: string;
    lastName: string;
    email: string;
  };
  product: {
    displayName: string;
  };
};

type BadgePrintClientProps = {
  eventId: string;
  registrationId: string;
};

export function BadgePrintClient({ eventId, registrationId }: BadgePrintClientProps) {
  const [registration, setRegistration] = useState<BadgeRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const search = new URLSearchParams({ query: registrationId });
    const response = await fetch(`/api/events/${eventId}/check-in?${search.toString()}`);
    const body = (await response.json().catch(() => null)) as { items?: BadgeRegistration[]; error?: string } | null;

    if (!response.ok || !body?.items) {
      setError(body?.error ?? "Unable to load badge.");
      return;
    }

    setRegistration(body.items.find((item) => item.id === registrationId) ?? null);
  }, [eventId, registrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>;
  }

  if (!registration) {
    return <p className="text-sm text-muted-foreground">Loading badge...</p>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/dashboard/events/${eventId}/check-in`}>
          Back to check-in
        </Link>
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.print()} type="button">
          Print
        </button>
      </div>
      <section className="min-h-96 rounded-md border-2 border-foreground bg-background p-8 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Event Badge</p>
        <h1 className="mt-8 text-5xl font-semibold tracking-normal">
          {registration.attendeeProfile.firstName} {registration.attendeeProfile.lastName}
        </h1>
        <p className="mt-5 text-2xl text-muted-foreground">{registration.product.displayName}</p>
        <p className="mt-8 text-sm text-muted-foreground">{registration.attendeeProfile.email}</p>
        <p className="mt-2 font-mono text-xs">{registration.id}</p>
        <div className="mt-10 inline-block rounded-md border px-4 py-2 text-sm font-medium">{registration.badgeStatus}</div>
      </section>
    </main>
  );
}
