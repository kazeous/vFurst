import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTenantWebEnvironment } from "@/lib/environment";
import {
  decideOrganizerDashboardAuth,
  decideOrganizerDashboardHost,
  loadOrganizerWorkspace
} from "@/lib/organizer-dashboard.server";
import { createTenantWebHostPolicy } from "@/lib/tenant-host-policy";
import { getCurrentTenantIdentity } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC"
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const environment = getTenantWebEnvironment();
  const requestHeaders = await headers();
  const hostDecision = decideOrganizerDashboardHost(
    requestHeaders.get("host") ?? "",
    createTenantWebHostPolicy(environment)
  );

  // Middleware returns 421 for the normal request path. This server-side check
  // remains the final authority in case the component is invoked internally.
  if (hostDecision.kind === "reject") notFound();

  const authDecision = decideOrganizerDashboardAuth(await getCurrentTenantIdentity());
  if (authDecision.kind === "redirect") redirect(authDecision.location);

  // The identity contributes only userId. Organization/event authority is
  // always loaded fresh from OrgMember and its database relations.
  const workspace = await loadOrganizerWorkspace(authDecision.identity.userId);

  return (
    <main className="organizer-dashboard">
      <header className="organizer-header">
        <div>
          <p className="eyebrow">Organizer console</p>
          <h1>Workspace</h1>
          <p>
            {workspace.isEmpty
              ? "Your central account is active, but it has no organizer membership."
              : `${workspace.organizations.length} organization${workspace.organizations.length === 1 ? "" : "s"} · ${workspace.eventCount} event${workspace.eventCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <nav aria-label="Account">
          <a href="/dashboard" aria-current="page">Dashboard</a>
          <a href="/auth/logout">Sign out</a>
        </nav>
      </header>

      {workspace.isEmpty ? (
        <section className="organizer-empty" aria-labelledby="no-access-heading">
          <p className="eyebrow">No organizer access</p>
          <h2 id="no-access-heading">Ask an organization owner for access</h2>
          <p>
            Platform administration does not grant organizer access. An OWNER or ADMIN membership is required.
          </p>
        </section>
      ) : (
        <div className="organizer-grid">
          <aside className="organizer-memberships" aria-labelledby="memberships-heading">
            <h2 id="memberships-heading">Your organizations</h2>
            {workspace.organizations.map((organization) => (
              <section key={organization.id} className="organizer-membership">
                <div className="organizer-membership-heading">
                  <div>
                    <h3>{organization.name}</h3>
                    <p>{organization.role.toLowerCase()} · {organization.status.toLowerCase()}</p>
                  </div>
                  <span>{organization.events.length}</span>
                </div>
                {organization.events.length === 0 ? (
                  <p className="organizer-no-events">No events in this organization.</p>
                ) : (
                  <ul>
                    {organization.events.map((event) => (
                      <li key={event.id}>
                        <div>
                          <strong>{event.name}</strong>
                          <span>{formatDate(event.startDate)} – {formatDate(event.endDate)}</span>
                        </div>
                        <small>{event.status.toLowerCase()}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </aside>
          <section className="organizer-content">{children}</section>
        </div>
      )}
    </main>
  );
}
