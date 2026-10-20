import { deleteAttendeeProfile, updateAttendeeProfile } from "@/actions/attendee-profile-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { AttendeeProfileFields } from "@/components/account/attendee-profile-fields";
import { Button } from "@/components/ui/button";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import { z } from "zod";

export default async function EditAttendeePage({ params }: { params: Promise<{ orgSlug: string; profileId: string }> }) {
  const { orgSlug, profileId } = await params;
  const { org, account } = await requirePortalPageContext(orgSlug, `/account/attendees/${profileId}`);
  if (!z.string().uuid().safeParse(profileId).success) notFound();
  const profile = await prisma.attendeeProfile.findFirst({
    where: { id: profileId, orgId: org.id, portalAccountId: account.id },
    include: { _count: { select: { registrations: { where: { orgId: org.id, portalAccountId: account.id } } } } }
  });
  if (!profile) notFound();

  return (
    <section className="vf-section vf-stack">
      <h2>Edit attendee</h2>
      <ActionStateForm action={updateAttendeeProfile} className="vf-form">
        <input type="hidden" name="profileId" value={profile.id} />
        <AttendeeProfileFields defaults={{ ...profile, dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) }} />
        <Button label="Save attendee" type="submit" variant="primary" />
      </ActionStateForm>
      {!profile._count.registrations ? <ActionStateForm action={deleteAttendeeProfile}>
        <input type="hidden" name="profileId" value={profile.id} /><Button label="Delete" type="submit" variant="destructive" />
      </ActionStateForm> : null}
      <Button label="Back to attendees" href="/account/attendees" />
    </section>
  );
}
