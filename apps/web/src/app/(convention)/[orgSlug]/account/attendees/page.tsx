import { createAttendeeProfile, deleteAttendeeProfile } from "@/actions/attendee-profile-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { AttendeeProfileFields } from "@/components/account/attendee-profile-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ensureAccountHolderProfile, listEventAttendees, MAX_ATTENDEE_PROFILES_PER_ACCOUNT } from "@/lib/attendee-profiles";
import { requirePortalPageContext } from "@/lib/portal-context";
import { registrationReservationStatuses } from "@/lib/registration-policy";
import { prisma } from "@vfurst/db";

const notices: Record<string, string> = { added: "Attendee added.", saved: "Attendee saved.", deleted: "Attendee deleted." };

export default async function AccountAttendeesPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const { org, account } = await requirePortalPageContext(orgSlug, "/account/attendees");
  const event = await prisma.event.findFirst({
    where: { orgId: org.id, status: "PUBLISHED" }, orderBy: { startDate: "asc" },
    select: { id: true, orgId: true, name: true, settings: true }
  });
  const summary = event ? await listEventAttendees(prisma, { account, event }) : null;
  if (!event) await ensureAccountHolderProfile(prisma, account);
  const profiles = await prisma.attendeeProfile.findMany({
    where: { orgId: org.id, portalAccountId: account.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true, fullName: true, badgeName: true, accountHolderOf: true,
      registrations: { where: { orgId: org.id, portalAccountId: account.id }, select: { id: true, eventId: true, status: true } }
    }
  });
  profiles.sort((left, right) => Number(right.accountHolderOf === account.id) - Number(left.accountHolderOf === account.id));
  const notice = notices[Array.isArray(query.notice) ? query.notice[0] : query.notice ?? ""];

  return (
    <section className="vf-stack">
      <div><p className="vf-label">People</p><h2>Attendees</h2><p className="vf-muted">{event && summary ? `${summary.used} of ${summary.cap} registered for ${event.name}.` : "Attendees you can register for this organizer's events."}</p></div>
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {profiles.map((profile) => {
        const registration = profile.registrations.find((registration) => registration.eventId === event?.id
          && registrationReservationStatuses.includes(registration.status as typeof registrationReservationStatuses[number]));
        return <article key={profile.id} className="vf-section vf-stack">
          <div><h3>{profile.fullName}</h3>{profile.badgeName ? <p>Badge: {profile.badgeName}</p> : null}
            {profile.accountHolderOf === account.id ? <p className="vf-muted">Account holder</p> : null}
            {event ? <p>{registration ? "Registered" : "Not registered"}</p> : null}</div>
          <div className="vf-actions">
            <Button label="Edit" href={`/account/attendees/${profile.id}`} size="sm" />
            {event && summary && !registration && summary.used < summary.cap ? <Button label="Register" href={`/register?attendee=${profile.id}`} size="sm" variant="primary" /> : null}
            {registration ? <Button label="View registration" href={`/account/registrations/${registration.id}`} size="sm" /> : null}
            {!profile.registrations.length ? <ActionStateForm action={deleteAttendeeProfile}>
              <input type="hidden" name="profileId" value={profile.id} /><Button label="Delete" type="submit" size="sm" variant="destructive" />
            </ActionStateForm> : null}
          </div>
        </article>;
      })}
      <div className="vf-section vf-stack"><h3>Add an attendee</h3>
        {profiles.length >= MAX_ATTENDEE_PROFILES_PER_ACCOUNT ? <Alert>This account has reached the limit of 20 attendees.</Alert> :
          <ActionStateForm action={createAttendeeProfile} className="vf-form">
            <input type="hidden" name="context" value="account" /><AttendeeProfileFields /><Button label="Add attendee" type="submit" variant="primary" />
          </ActionStateForm>}
      </div>
    </section>
  );
}
