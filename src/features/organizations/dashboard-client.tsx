"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  eventCount: number;
  memberCount: number;
};

export function DashboardClient() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  async function loadOrganizations() {
    setIsLoading(true);
    const response = await fetch("/api/orgs");
    const body = (await response.json().catch(() => null)) as { organizations?: OrganizationSummary[]; error?: string } | null;
    setIsLoading(false);

    if (!response.ok) {
      setError(body?.error ?? "Unable to load organizations.");
      return;
    }

    setOrganizations(body?.organizations ?? []);
  }

  useEffect(() => {
    void loadOrganizations();
  }, []);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreating(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        slug: String(formData.get("slug") ?? "") || undefined
      })
    });

    const body = (await response.json().catch(() => null)) as { organization?: { id: string }; error?: string } | null;
    setIsCreating(false);

    if (!response.ok || !body?.organization) {
      setError(body?.error ?? "Unable to create organization.");
      return;
    }

    window.location.assign(`/dashboard/orgs/${body.organization.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Organizations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Dashboard</h1>
        </div>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading organizations...</p> : null}
        {!isLoading && organizations.length === 0 ? (
          <div className="rounded-md border bg-card p-5">
            <p className="font-medium">No organizations yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Create an organization to begin Phase 2 event setup.</p>
          </div>
        ) : null}
        <div className="grid gap-3">
          {organizations.map((organization) => (
            <Link
              className="rounded-md border bg-card p-5 transition hover:border-primary"
              href={`/dashboard/orgs/${organization.id}`}
              key={organization.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-normal">{organization.name}</h2>
                  <p className="text-sm text-muted-foreground">/{organization.slug}</p>
                </div>
                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{organization.role}</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {organization.eventCount} events · {organization.memberCount} members
              </p>
            </Link>
          ))}
        </div>
      </section>
      <aside className="rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-normal">Create organization</h2>
        <form className="mt-4 space-y-4" onSubmit={onCreate}>
          <label className="block space-y-2 text-sm font-medium">
            <span>Name</span>
            <input className="w-full rounded-md border px-3 py-2" maxLength={120} name="name" required />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Slug</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              maxLength={80}
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="optional"
            />
          </label>
          <button
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </form>
      </aside>
    </div>
  );
}
