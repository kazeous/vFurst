"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PublicEvent = {
  name: string;
  slug: string;
  status: string;
  organization: {
    name: string;
  };
};

type VolunteerApplicationClientProps = {
  slug: string;
};

export function VolunteerApplicationClient({ slug }: VolunteerApplicationClientProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadEvent = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/public/events/${slug}`);
    const body = (await response.json().catch(() => null)) as { event?: PublicEvent; error?: string } | null;

    if (!response.ok || !body?.event) {
      setError(body?.error ?? "Event not found.");
      return;
    }

    setEvent(body.event);
  }, [slug]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  async function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/public/events/${slug}/volunteer-applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? "") || undefined,
        preferredContactMethod: String(formData.get("preferredContactMethod") ?? "EMAIL"),
        availability: String(formData.get("availability") ?? ""),
        departmentInterests: String(formData.get("departmentInterests") ?? ""),
        priorExperience: String(formData.get("priorExperience") ?? "") || undefined
      })
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setIsSubmitting(false);

    if (!response.ok) {
      setError(body?.error ?? "Volunteer application failed.");
      return;
    }

    form.reset();
    setMessage("Volunteer application submitted.");
  }

  if (error && !event) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>
      </main>
    );
  }

  if (!event) {
    return <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">Loading volunteer application...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link className="text-sm font-medium text-primary" href={`/events/${slug}`}>
        Back to event
      </Link>
      <p className="mt-6 text-sm font-medium uppercase tracking-[0.16em] text-accent">{event.organization.name}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-normal">Volunteer application</h1>
      <p className="mt-2 text-muted-foreground">{event.name}</p>
      {message ? <p className="mt-6 rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <form className="mt-8 grid gap-5 rounded-md border bg-card p-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>First name</span>
            <input className="w-full rounded-md border px-3 py-2" name="firstName" required />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Last name</span>
            <input className="w-full rounded-md border px-3 py-2" name="lastName" required />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Email</span>
            <input className="w-full rounded-md border px-3 py-2" name="email" required type="email" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Phone</span>
            <input className="w-full rounded-md border px-3 py-2" name="phone" />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          <span>Preferred contact method</span>
          <select className="w-full rounded-md border px-3 py-2" defaultValue="EMAIL" name="preferredContactMethod">
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="SMS">SMS</option>
            <option value="DISCORD">Discord</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Availability</span>
          <textarea className="min-h-28 w-full rounded-md border px-3 py-2" name="availability" required />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Department interests</span>
          <textarea className="min-h-24 w-full rounded-md border px-3 py-2" name="departmentInterests" required />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Prior experience</span>
          <textarea className="min-h-24 w-full rounded-md border px-3 py-2" name="priorExperience" />
        </label>
        <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:w-fit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit application"}
        </button>
      </form>
    </main>
  );
}
