import { createEvent, archiveEvent, deleteEvent, publishEvent } from "@/actions/event-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { EventNameSlugFields } from "@/components/forms/event-name-slug-fields";
import { DateField } from "@/components/ui/date-field";
import { getConventionUrl } from "@/lib/subdomain";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function OrganizationOverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    },
    include: {
      members: {
        include: {
          user: true
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      events: {
        orderBy: {
          startDate: "desc"
        }
      },
      stripeConnect: true
    }
  });

  if (!org) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">{getConventionUrl(org)}</p>
          <h1>{org.name}</h1>
        </div>
        <div className="vf-actions">
          <Button label="Members" href={`/dashboard/organizations/${org.id}/members`} />
          <Button label="Settings" href={`/dashboard/organizations/${org.id}/settings`} />
          <Button label="Billing" href={`/dashboard/organizations/${org.id}/billing`} />
          <Button label="API keys" href={`/dashboard/organizations/${org.id}/api-keys`} />
          <Button label="Webhooks" href={`/dashboard/organizations/${org.id}/webhooks`} />
          <Button label="Stripe" href={`/dashboard/organizations/${org.id}/stripe-connect`} variant="primary" />
        </div>
      </header>
      <section className="vf-stat-grid">
        <div className="vf-stat-card">
          <p className="vf-label">Members</p>
          <strong>{org.members.length}</strong>
          <span>Team access</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Events</p>
          <strong>{org.events.length}</strong>
          <span>Conventions managed</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Stripe</p>
          <strong>{org.stripeConnect?.onboardingComplete ? "Ready" : "Pending"}</strong>
          <span>Destination charges</span>
        </div>
      </section>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Events</h2>
          <div className="vf-list">
            {org.events.map((event) => (
              <div key={event.id} className="vf-list-row">
                <span>{event.name}</span>
                <small>{event.status}</small>
                <div className="vf-inline-forms">
                  <form action={publishEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button label="Publish" type="submit" size="sm" />
                  </form>
                  <form action={archiveEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button label="Archive" type="submit" size="sm" />
                  </form>
                  <form action={deleteEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button label="Delete" type="submit" size="sm" variant="destructive" />
                  </form>
                </div>
              </div>
            ))}
            {org.events.length === 0 ? <p className="vf-empty">No events yet.</p> : null}
          </div>
        </div>
        <div className="vf-section">
          <h2>Create event</h2>
          <ActionStateForm action={createEvent} className="vf-form" errorTestId="create-event-error">
            <input type="hidden" name="orgId" value={org.id} />
            <EventNameSlugFields nameLabel="Name" />
            <label>
              Venue
              <input name="venue" placeholder="Convention Center" />
            </label>
            <label>
              Start date
              <DateField name="startDate" required />
            </label>
            <label>
              End date
              <DateField name="endDate" required />
            </label>
            <Button label="Create event" type="submit" variant="primary" />
          </ActionStateForm>
        </div>
      </section>
    </div>
  );
}
