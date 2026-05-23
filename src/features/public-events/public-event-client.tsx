"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  contactEmail: string | null;
  description: string | null;
  organization: {
    name: string;
    slug: string;
  };
};

type PublicProduct = {
  id: string;
  category: string;
  displayName: string;
  description: string | null;
  basePriceCents: number;
  stockLimit: number | null;
  minPurchaseAge: number | null;
  maxPurchaseAge: number | null;
  registrationCount: number;
  images: Array<{ id: string; url: string; altText: string | null }>;
};

type PublicQuestion = {
  id: string;
  label: string;
  helpText: string | null;
  type: string;
  required: boolean;
};

type PublicEventClientProps = {
  slug: string;
};

export function PublicEventClient({ slug }: PublicEventClientProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPublicEvent = useCallback(async () => {
    setError(null);
    const [eventResponse, productsResponse, questionsResponse] = await Promise.all([
      fetch(`/api/public/events/${slug}`),
      fetch(`/api/public/events/${slug}/products`),
      fetch(`/api/public/events/${slug}/registration-questions`)
    ]);

    const eventBody = (await eventResponse.json().catch(() => null)) as { event?: PublicEvent; error?: string } | null;
    if (!eventResponse.ok || !eventBody?.event) {
      setError(eventBody?.error ?? "Event not found.");
      return;
    }

    const productsBody = (await productsResponse.json().catch(() => null)) as { products?: PublicProduct[] } | null;
    const questionsBody = (await questionsResponse.json().catch(() => null)) as { questions?: PublicQuestion[] } | null;
    const nextProducts = productsBody?.products ?? [];
    const registrationProducts = nextProducts.filter((product) => product.category === "REGISTRATION");

    setEvent(eventBody.event);
    setProducts(nextProducts);
    setQuestions(questionsBody?.questions ?? []);
    setSelectedProductId((current) => current || registrationProducts[0]?.id || "");
  }, [slug]);

  useEffect(() => {
    void loadPublicEvent();
  }, [loadPublicEvent]);

  const registrationProducts = useMemo(
    () => products.filter((product) => product.category === "REGISTRATION"),
    [products]
  );

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(formEvent.currentTarget);
    const answers = questions.map((question) => ({
      questionId: question.id,
      value:
        question.type === "CHECKBOX"
          ? formData.get(`question-${question.id}`) === "on"
            ? "true"
            : ""
          : String(formData.get(`question-${question.id}`) ?? "")
    }));

    const response = await fetch(`/api/public/events/${slug}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: String(formData.get("productId") ?? selectedProductId),
        email: String(formData.get("email") ?? ""),
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        birthDate: String(formData.get("birthDate") ?? "") || undefined,
        answers
      })
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setIsSubmitting(false);

    if (!response.ok) {
      setError(body?.error ?? "Registration failed.");
      return;
    }

    form.reset();
    setMessage("Registration submitted.");
    await loadPublicEvent();
  }

  if (error && !event) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>
      </main>
    );
  }

  if (!event) {
    return <main className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl px-6 py-16">Loading event...</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="grid gap-8 border-b pb-8 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">{event.organization.name}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-normal md:text-5xl">{event.name}</h1>
          <p className="mt-4 max-w-3xl text-muted-foreground">{event.description ?? "Registration details are available below."}</p>
        </div>
        <aside className="rounded-md border bg-card p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Event details</p>
          <p className="mt-3">Status: {event.status}</p>
          <p>Timezone: {event.timezone}</p>
          {event.venueName ? <p>Venue: {event.venueName}</p> : null}
          {event.contactEmail ? <p>Contact: {event.contactEmail}</p> : null}
        </aside>
      </section>
      <section className="grid gap-8 py-8 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-normal">Registration tiers</h2>
          {registrationProducts.length === 0 ? (
            <p className="rounded-md border bg-card p-5 text-sm text-muted-foreground">No registration tiers are currently available.</p>
          ) : null}
          {registrationProducts.map((product) => (
            <button
              className={`w-full rounded-md border bg-card p-5 text-left transition ${
                selectedProductId === product.id ? "border-primary" : "hover:border-primary"
              }`}
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              type="button"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-normal">{product.displayName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                </div>
                <p className="font-semibold">${(product.basePriceCents / 100).toFixed(2)}</p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {product.stockLimit ? `${product.stockLimit - product.registrationCount} remaining` : "Open capacity"}
              </p>
            </button>
          ))}
        </div>
        <form className="rounded-md border bg-card p-5" onSubmit={onSubmit}>
          <h2 className="text-xl font-semibold tracking-normal">Register</h2>
          {message ? <p className="mt-4 rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
          {error ? <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
          <div className="mt-4 space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Tier</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                name="productId"
                onChange={(selectEvent) => setSelectedProductId(selectEvent.currentTarget.value)}
                required
                value={selectedProductId}
              >
                <option value="">Select a tier</option>
                {registrationProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium">
                <span>First name</span>
                <input className="w-full rounded-md border px-3 py-2" name="firstName" required />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Last name</span>
                <input className="w-full rounded-md border px-3 py-2" name="lastName" required />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>Email</span>
              <input className="w-full rounded-md border px-3 py-2" name="email" required type="email" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Birth date</span>
              <input className="w-full rounded-md border px-3 py-2" name="birthDate" type="date" />
            </label>
            {questions.map((question) => (
              <label className="block space-y-2 text-sm font-medium" key={question.id}>
                <span>
                  {question.label}
                  {question.required ? " *" : ""}
                </span>
                {question.helpText ? <span className="block text-xs font-normal text-muted-foreground">{question.helpText}</span> : null}
                {question.type === "LONG_TEXT" ? (
                  <textarea
                    className="min-h-24 w-full rounded-md border px-3 py-2"
                    name={`question-${question.id}`}
                    required={question.required}
                  />
                ) : question.type === "CHECKBOX" ? (
                  <input className="h-4 w-4" name={`question-${question.id}`} required={question.required} type="checkbox" />
                ) : (
                  <input className="w-full rounded-md border px-3 py-2" name={`question-${question.id}`} required={question.required} />
                )}
              </label>
            ))}
          </div>
          <button
            className="mt-5 w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            disabled={isSubmitting || !selectedProductId}
          >
            {isSubmitting ? "Submitting..." : "Submit registration"}
          </button>
        </form>
      </section>
    </main>
  );
}
