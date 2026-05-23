"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EventDetail = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  venueName: string | null;
  contactEmail: string | null;
  description: string | null;
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
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: {
    email: string | null;
  } | null;
};

type EventDetailClientProps = {
  eventId: string;
};

export function EventDetailClient({ eventId }: EventDetailClientProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    const [eventResponse, membersResponse, invitesResponse, auditResponse] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/members`),
      fetch(`/api/events/${eventId}/invites`),
      fetch(`/api/events/${eventId}/audit?pageSize=10`)
    ]);

    const eventBody = (await eventResponse.json().catch(() => null)) as { event?: EventDetail; error?: string } | null;
    if (!eventResponse.ok || !eventBody?.event) {
      setError(eventBody?.error ?? "Unable to load event.");
      return;
    }

    const membersBody = (await membersResponse.json().catch(() => null)) as { members?: Member[] } | null;
    const invitesBody = (await invitesResponse.json().catch(() => null)) as { invites?: Invite[] } | null;
    const auditBody = (await auditResponse.json().catch(() => null)) as { items?: AuditItem[] } | null;

    setEvent(eventBody.event);
    setMembers(membersBody?.members ?? []);
    setInvites(invitesBody?.invites ?? []);
    setAuditItems(auditBody?.items ?? []);
  }, [eventId]);

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

  async function onUpdateEvent(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    await submitJson(`/api/events/${eventId}`, "PATCH", {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      status: String(formData.get("status") ?? "DRAFT"),
      timezone: String(formData.get("timezone") ?? "UTC"),
      venueName: String(formData.get("venueName") ?? "") || undefined,
      contactEmail: String(formData.get("contactEmail") ?? "") || undefined,
      description: String(formData.get("description") ?? "") || undefined
    });
  }

  async function onCreateInvite(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    const created = await submitJson(`/api/events/${eventId}/invites`, "POST", {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "VIEWER")
    });

    if (created) {
      formEvent.currentTarget.reset();
    }
  }

  if (!event && !error) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        {event ? (
          <Link className="text-sm font-medium text-primary" href={`/dashboard/orgs/${event.organizationId}`}>
            Back to organization
          </Link>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">{event?.name ?? "Event"}</h1>
        <p className="text-sm text-muted-foreground">/{event?.slug}</p>
      </div>
      {message ? <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {event ? (
        <section className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Event settings</h2>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onUpdateEvent}>
            <label className="block space-y-2 text-sm font-medium">
              <span>Name</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.name} name="name" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Slug</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                defaultValue={event.slug}
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Status</span>
              <select className="w-full rounded-md border px-3 py-2" defaultValue={event.status} name="status">
                <option value="DRAFT">DRAFT</option>
                <option value="REGISTRATION_OPEN">REGISTRATION_OPEN</option>
                <option value="LIVE">LIVE</option>
                <option value="CLOSED">CLOSED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Timezone</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.timezone} name="timezone" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Venue</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.venueName ?? ""} name="venueName" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Contact email</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                defaultValue={event.contactEmail ?? ""}
                name="contactEmail"
                type="email"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium md:col-span-2">
              <span>Description</span>
              <textarea
                className="min-h-28 w-full rounded-md border px-3 py-2"
                defaultValue={event.description ?? ""}
                name="description"
              />
            </label>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:w-fit">Save</button>
          </form>
        </section>
      ) : null}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Event team</h2>
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
                    onChange={(changeEvent) =>
                      void submitJson(`/api/events/${eventId}/members/${member.id}`, "PATCH", {
                        role: changeEvent.currentTarget.value
                      })
                    }
                  >
                    <option value="EVENT_ADMIN">EVENT_ADMIN</option>
                    <option value="STAFF">STAFF</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    className="rounded-md border px-2 py-1 text-sm"
                    onClick={() => void submitJson(`/api/events/${eventId}/members/${member.id}`, "DELETE")}
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
          <h2 className="text-lg font-semibold tracking-normal">Event invites</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateInvite}>
            <input className="rounded-md border px-3 py-2" name="email" placeholder="email@example.com" required type="email" />
            <select className="rounded-md border px-3 py-2" name="role" defaultValue="VIEWER">
              <option value="EVENT_ADMIN">EVENT_ADMIN</option>
              <option value="STAFF">STAFF</option>
              <option value="VIEWER">VIEWER</option>
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
                  onClick={() => void submitJson(`/api/events/${eventId}/invites/${invite.id}`, "DELETE")}
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
