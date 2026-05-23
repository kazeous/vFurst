"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  organization: {
    name: string;
  };
};

type PublicProduct = {
  id: string;
  category: string;
  displayName: string;
  description: string | null;
  basePriceCents: number;
};

type VendorApplicationClientProps = {
  slug: string;
};

function lines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function VendorApplicationClient({ slug }: VendorApplicationClientProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [eventResponse, productsResponse] = await Promise.all([
      fetch(`/api/public/events/${slug}`),
      fetch(`/api/public/events/${slug}/products`)
    ]);

    const eventBody = (await eventResponse.json().catch(() => null)) as { event?: PublicEvent; error?: string } | null;
    if (!eventResponse.ok || !eventBody?.event) {
      setError(eventBody?.error ?? "Event not found.");
      return;
    }

    const productsBody = (await productsResponse.json().catch(() => null)) as { products?: PublicProduct[] } | null;
    setEvent(eventBody.event);
    setProducts(productsBody?.products ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const vendorProducts = useMemo(() => products.filter((product) => product.category === "VENDOR_TABLE"), [products]);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const assistantName = String(formData.get("assistantName") ?? "").trim();
    const assistantEmail = String(formData.get("assistantEmail") ?? "").trim();

    const response = await fetch(`/api/public/events/${slug}/vendor-applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: String(formData.get("businessName") ?? ""),
        contactName: String(formData.get("contactName") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
        description: String(formData.get("description") ?? ""),
        productsServices: String(formData.get("productsServices") ?? ""),
        requestedTableProductId: String(formData.get("requestedTableProductId") ?? "") || undefined,
        amenities: lines(formData.get("amenities")).map((name) => ({ name })),
        assistants: assistantName ? [{ name: assistantName, email: assistantEmail || undefined }] : [],
        seatingNotes: String(formData.get("seatingNotes") ?? "") || undefined,
        seatingPreferences: lines(formData.get("seatingPreferences"))
      })
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setIsSubmitting(false);

    if (response.status === 401) {
      setError("Sign in before submitting a vendor application.");
      return;
    }

    if (!response.ok) {
      setError(body?.error ?? "Vendor application failed.");
      return;
    }

    form.reset();
    setMessage("Vendor application submitted.");
  }

  if (error && !event) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>
      </main>
    );
  }

  if (!event) {
    return <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">Loading vendor application...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link className="text-sm font-medium text-primary" href={`/events/${slug}`}>
        Back to event
      </Link>
      <p className="mt-6 text-sm font-medium uppercase tracking-[0.16em] text-accent">{event.organization.name}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-normal">Vendor application</h1>
      <p className="mt-2 text-muted-foreground">{event.name}</p>
      {message ? <p className="mt-6 rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <form className="mt-8 grid gap-5 rounded-md border bg-card p-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Business name</span>
            <input className="w-full rounded-md border px-3 py-2" name="businessName" required />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Contact name</span>
            <input className="w-full rounded-md border px-3 py-2" name="contactName" required />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          <span>Contact email</span>
          <input className="w-full rounded-md border px-3 py-2" name="contactEmail" required type="email" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Requested table type</span>
          <select className="w-full rounded-md border px-3 py-2" name="requestedTableProductId">
            <option value="">No table product selected</option>
            {vendorProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.displayName} - ${(product.basePriceCents / 100).toFixed(2)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Business description</span>
          <textarea className="min-h-28 w-full rounded-md border px-3 py-2" name="description" required />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Products or services sold</span>
          <textarea className="min-h-28 w-full rounded-md border px-3 py-2" name="productsServices" required />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Requested amenities</span>
          <textarea className="min-h-24 w-full rounded-md border px-3 py-2" name="amenities" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Assistant name</span>
            <input className="w-full rounded-md border px-3 py-2" name="assistantName" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Assistant email</span>
            <input className="w-full rounded-md border px-3 py-2" name="assistantEmail" type="email" />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          <span>Seating preference notes</span>
          <textarea className="min-h-24 w-full rounded-md border px-3 py-2" name="seatingPreferences" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Special placement notes</span>
          <textarea className="min-h-24 w-full rounded-md border px-3 py-2" name="seatingNotes" />
        </label>
        <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:w-fit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit application"}
        </button>
      </form>
    </main>
  );
}
