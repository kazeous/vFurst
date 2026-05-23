"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Member = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string;
};

type EventSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: {
    name: string | null;
    email: string | null;
  } | null;
};

type OrganizationDetailClientProps = {
  organizationId: string;
};

export function OrganizationDetailClient({ organizationId }: OrganizationDetailClientProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    const [orgResponse, membersResponse, invitesResponse, eventsResponse, auditResponse] = await Promise.all([
      fetch(`/api/orgs/${organizationId}`),
      fetch(`/api/orgs/${organizationId}/members`),
      fetch(`/api/orgs/${organizationId}/invites`),
      fetch(`/api/orgs/${organizationId}/events`),
      fetch(`/api/orgs/${organizationId}/audit?pageSize=10`)
    ]);

    const orgBody = (await orgResponse.json().catch(() => null)) as { organization?: Organization; error?: string } | null;
    if (!orgResponse.ok || !orgBody?.organization) {
      setError(orgBody?.error ?? "Unable to load organization.");
      return;
    }

    const membersBody = (await membersResponse.json().catch(() => null)) as { members?: Member[] } | null;
    const invitesBody = (await invitesResponse.json().catch(() => null)) as { invites?: Invite[] } | null;
    const eventsBody = (await eventsResponse.json().catch(() => null)) as { events?: EventSummary[] } | null;
    const auditBody = (await auditResponse.json().catch(() => null)) as { items?: AuditItem[] } | null;

    setOrganization(orgBody.organization);
    setMembers(membersBody?.members ?? []);
    setInvites(invitesBody?.invites ?? []);
    setEvents(eventsBody?.events ?? []);
    setAuditItems(auditBody?.items ?? []);
  }, [organizationId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function submitJson(url: string, method: string, payload?: unknown) {
    setMessage(null);
    setError(null);
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? "Request failed.");
      return false;
    }

    setMessage("Saved.");
    await loadAll();
    return true;
  }

  async function onUpdateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitJson(`/api/orgs/${organizationId}`, "PATCH", {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? "")
    });
  }

  async function onCreateEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const created = await submitJson(`/api/orgs/${organizationId}/events`, "POST", {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? "") || undefined,
      timezone: String(formData.get("timezone") ?? "UTC")
    });

    if (created) {
      form.reset();
    }
  }

  async function onCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const created = await submitJson(`/api/orgs/${organizationId}/invites`, "POST", {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "MEMBER")
    });

    if (created) {
      form.reset();
    }
  }

  if (!organization && !error) {
    return <p className="text-sm text-muted-foreground">Loading organization...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-medium text-primary" href="/dashboard">
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{organization?.name ?? "Organization"}</h1>
          <p className="text-sm text-muted-foreground">/{organization?.slug}</p>
        </div>
      </div>
      {message ? <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {organization ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-md border bg-card p-5">
            <h2 className="text-lg font-semibold tracking-normal">Organization settings</h2>
            <form className="mt-4 space-y-4" onSubmit={onUpdateOrganization}>
              <label className="block space-y-2 text-sm font-medium">
                <span>Name</span>
                <input className="w-full rounded-md border px-3 py-2" defaultValue={organization.name} name="name" />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Slug</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue={organization.slug}
                  name="slug"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
              </label>
              <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Save</button>
            </form>
          </section>
          <section className="rounded-md border bg-card p-5">
            <h2 className="text-lg font-semibold tracking-normal">Create event</h2>
            <form className="mt-4 space-y-4" onSubmit={onCreateEvent}>
              <label className="block space-y-2 text-sm font-medium">
                <span>Name</span>
                <input className="w-full rounded-md border px-3 py-2" name="name" required />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Slug</span>
                <input className="w-full rounded-md border px-3 py-2" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Timezone</span>
                <input className="w-full rounded-md border px-3 py-2" defaultValue="UTC" name="timezone" required />
              </label>
              <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Create</button>
            </form>
          </section>
        </div>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-normal">Events</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {events.map((event) => (
            <Link className="rounded-md border bg-card p-4 hover:border-primary" href={`/dashboard/events/${event.id}`} key={event.id}>
              <h3 className="font-semibold">{event.name}</h3>
              <p className="text-sm text-muted-foreground">
                /{event.slug} · {event.status} · {event.timezone}
              </p>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Members</h2>
          <div className="mt-4 space-y-3">
            {members.map((member) => (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" key={member.id}>
                <div>
                  <p className="font-medium">{member.user.name ?? member.user.email}</p>
                  <p className="text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    defaultValue={member.role}
                    disabled={member.role === "OWNER"}
                    onChange={(changeEvent) =>
                      void submitJson(`/api/orgs/${organizationId}/members/${member.id}`, "PATCH", {
                        role: changeEvent.currentTarget.value
                      })
                    }
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                  </select>
                  <button
                    className="rounded-md border px-2 py-1 text-sm"
                    disabled={member.role === "OWNER"}
                    onClick={() => void submitJson(`/api/orgs/${organizationId}/members/${member.id}`, "DELETE")}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Invites</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateInvite}>
            <input className="rounded-md border px-3 py-2" name="email" placeholder="email@example.com" required type="email" />
            <select className="rounded-md border px-3 py-2" name="role" defaultValue="MEMBER">
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Invite</button>
          </form>
          <div className="mt-4 space-y-3">
            {invites.map((invite) => (
              <div className="rounded-md border p-3 text-sm" key={invite.id}>
                <p className="font-medium">{invite.email}</p>
                <p className="text-muted-foreground">
                  {invite.role} · {invite.status}
                </p>
                <Link className="break-all text-primary" href={`/invites/${invite.token}`}>
                  /invites/{invite.token}
                </Link>
                <button
                  className="mt-2 block rounded-md border px-2 py-1 text-sm"
                  onClick={() => void submitJson(`/api/orgs/${organizationId}/invites/${invite.id}`, "DELETE")}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-normal">Audit log</h2>
        <div className="mt-4 space-y-2">
          {auditItems.map((item) => (
            <p className="text-sm text-muted-foreground" key={item.id}>
              {item.action} · {item.entityType} · {new Date(item.createdAt).toLocaleString()} ·{" "}
              {item.actor?.email ?? "system"}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
