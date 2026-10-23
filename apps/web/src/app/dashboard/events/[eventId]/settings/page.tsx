import { updateEventSettings } from "@/actions/event-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { getCoreEventSettings } from "@/lib/event-settings";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function EventSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { eventId } = await params;
  const { saved } = await searchParams;
  await requireEventPageAccess(eventId);

  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true
    }
  });

  if (!event) {
    notFound();
  }

  const settings = getCoreEventSettings(event.settings);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Event settings</p>
          <h1>{event.name}</h1>
          <p className="vf-muted">Update public event details and registration behavior.</p>
        </div>
        <div className="vf-actions">
          <Button label="Registration form" href={`/dashboard/events/${event.id}/settings/registration-form`} />
          <Button label="Email templates" href={`/dashboard/events/${event.id}/settings/emails`} />
        </div>
      </header>

      {saved === "1" ? <div className="vf-banner vf-banner-success">Event settings saved.</div> : null}

      <Card>
        <ActionStateForm action={updateEventSettings} className="vf-form" errorTestId="event-settings-error">
          <input type="hidden" name="eventId" value={event.id} />
          <h2>Event details</h2>
          <label>
            Name
            <input name="name" defaultValue={event.name} required />
          </label>
          <label>
            Slug
            <input name="slug" defaultValue={event.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
          </label>
          <label>
            Currency
            <input value={event.currency} readOnly aria-readonly="true" />
            <small className="vf-muted">Currency is fixed when the event is created.</small>
          </label>
          <label>
            Description
            <textarea name="description" rows={4} defaultValue={event.description ?? ""} />
          </label>
          <label>
            Venue
            <input name="venue" defaultValue={event.venue ?? ""} />
          </label>
          <div className="vf-form-grid">
            <label>
              Start date
              <DateField name="startDate" defaultValue={dateInputValue(event.startDate)} required />
            </label>
            <label>
              End date
              <DateField name="endDate" defaultValue={dateInputValue(event.endDate)} required />
            </label>
          </div>

          <h2>Registration controls</h2>
          <label className="vf-check">
            <input name="requireApproval" type="checkbox" defaultChecked={settings.requireApproval} />
            Require manual registration approval
          </label>
          <label className="vf-check">
            <input name="allowTransfers" type="checkbox" defaultChecked={settings.allowTransfers} />
            Allow attendee transfers
          </label>
          <label>
            Maximum registrations per user
            <input
              name="maxRegistrationsPerUser"
              type="number"
              min="1"
              max="20"
              defaultValue={settings.maxRegistrationsPerUser}
              required
            />
          </label>

          <Button label="Save event settings" type="submit" variant="primary" />
        </ActionStateForm>
      </Card>
    </div>
  );
}
