"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CheckInRegistration = {
  id: string;
  checkedInAt: string | null;
  badgeStatus: string;
  cashierNote: string | null;
  paid: boolean;
  orderStatus: string;
  payableOrderId: string | null;
  attendeeProfile: {
    firstName: string;
    lastName: string;
    email: string;
  };
  product: {
    displayName: string;
    basePriceCents: number;
  };
  checkedInBy: {
    name: string | null;
    email: string | null;
  } | null;
};

type CheckInClientProps = {
  eventId: string;
};

export function CheckInClient({ eventId }: CheckInClientProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"standard" | "express">("standard");
  const [items, setItems] = useState<CheckInRegistration[]>([]);
  const [summary, setSummary] = useState({ checkedInCount: 0, totalCount: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const search = new URLSearchParams({ query, mode });
    const response = await fetch(`/api/events/${eventId}/check-in?${search.toString()}`);
    const body = (await response.json().catch(() => null)) as {
      items?: CheckInRegistration[];
      summary?: { checkedInCount: number; totalCount: number };
      error?: string;
    } | null;
    setLoading(false);

    if (!response.ok || !body?.items || !body.summary) {
      setError(body?.error ?? "Unable to load check-in.");
      return;
    }

    setItems(body.items);
    setSummary(body.summary);
  }, [eventId, mode, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchRegistration(registrationId: string, payload: unknown) {
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/events/${eventId}/check-in/registrations/${registrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? "Update failed.");
      return;
    }

    setMessage("Saved.");
    await load();
  }

  async function markPaid(orderId: string) {
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/orders/${orderId}/manual-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Marked paid from check-in" })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? "Payment update failed.");
      return;
    }

    setMessage("Payment marked paid.");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Check-in</h1>
          <p className="text-sm text-muted-foreground">
            {summary.checkedInCount} of {summary.totalCount} checked in
          </p>
        </div>
        <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/dashboard/events/${eventId}`}>
          Back to event
        </Link>
      </div>
      <section className="rounded-md border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input
            className="rounded-md border px-3 py-2"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by name, email, registration id, or tier"
            value={query}
          />
          <select className="rounded-md border px-3 py-2" onChange={(event) => setMode(event.currentTarget.value as "standard" | "express")} value={mode}>
            <option value="standard">Standard</option>
            <option value="express">Express</option>
          </select>
          <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" onClick={() => void load()} type="button">
            Search
          </button>
        </div>
      </section>
      {message ? <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      <section className={mode === "express" ? "grid gap-3 lg:grid-cols-2" : "space-y-3"}>
        {items.length === 0 && !loading ? <p className="rounded-md border bg-card p-5 text-sm text-muted-foreground">No matching registrations.</p> : null}
        {items.map((item) => (
          <article className="rounded-md border bg-card p-4 text-sm" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold tracking-normal">
                  {item.attendeeProfile.firstName} {item.attendeeProfile.lastName}
                </p>
                <p className="text-muted-foreground">{item.attendeeProfile.email}</p>
                <p className="mt-2 text-muted-foreground">
                  {item.product.displayName} - ${(item.product.basePriceCents / 100).toFixed(2)}
                </p>
                <p className="mt-1 text-muted-foreground">Registration {item.id}</p>
                {item.cashierNote ? <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2">Cashier note: {item.cashierNote}</p> : null}
              </div>
              <div className="space-y-2 text-right">
                <span className="block rounded-md bg-secondary px-3 py-1 font-medium">{item.checkedInAt ? "CHECKED IN" : "NOT CHECKED IN"}</span>
                <span className="block rounded-md bg-secondary px-3 py-1 font-medium">{item.paid ? "PAID" : item.orderStatus}</span>
                <span className="block rounded-md bg-secondary px-3 py-1 font-medium">{item.badgeStatus}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
              <input
                className="rounded-md border px-3 py-2"
                defaultValue={item.cashierNote ?? ""}
                onBlur={(event) => void patchRegistration(item.id, { cashierNote: event.currentTarget.value })}
                placeholder="Cashier note"
              />
              <select
                className="rounded-md border px-3 py-2"
                defaultValue={item.badgeStatus}
                onChange={(event) => void patchRegistration(item.id, { badgeStatus: event.currentTarget.value })}
              >
                <option value="NOT_PRINTED">Not printed</option>
                <option value="PRINT_READY">Print ready</option>
                <option value="PRINTED">Printed</option>
                <option value="VOID">Void</option>
              </select>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
                disabled={Boolean(item.checkedInAt)}
                onClick={() => void patchRegistration(item.id, { checkedIn: true, badgeStatus: "PRINT_READY" })}
                type="button"
              >
                Check in
              </button>
              <button
                className="rounded-md border px-4 py-2 font-medium"
                disabled={!item.checkedInAt}
                onClick={() => void patchRegistration(item.id, { checkedIn: false })}
                type="button"
              >
                Undo
              </button>
              {item.payableOrderId ? (
                <button className="rounded-md border px-4 py-2 font-medium" onClick={() => void markPaid(item.payableOrderId!)} type="button">
                  Mark paid
                </button>
              ) : null}
              <Link className="rounded-md border px-4 py-2 font-medium" href={`/dashboard/events/${eventId}/check-in/badges/${item.id}`}>
                Badge
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
