"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { AttendeeProfileFormState } from "@/lib/attendee-profile-form-state";
import { assertAttendeeProfileCeiling, parseAttendeeProfileForm } from "@/lib/attendee-profiles";
import { badgeQueue, type GenerateBadgesJob } from "@/lib/badge-queue";
import { getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { registrationReservationStatuses, runRegistrationPolicyTransaction } from "@/lib/registration-policy";

function parseProfileId(formData: FormData): string {
  const parsed = z.string().uuid().safeParse(formData.get("profileId"));
  if (!parsed.success) throw new PublicActionError("Attendee not found.");
  return parsed.data;
}

function revalidateAttendees() {
  revalidatePath("/[orgSlug]/account/attendees", "page");
  revalidatePath("/[orgSlug]/account/attendees/[profileId]", "page");
  revalidatePath("/[orgSlug]/account/registrations", "page");
  revalidatePath("/[orgSlug]/account/registrations/[registrationId]", "page");
}

export async function createAttendeeProfile(
  _state: AttendeeProfileFormState,
  formData: FormData
): Promise<AttendeeProfileFormState> {
  try {
    return await createAttendeeProfileInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function createAttendeeProfileInner(formData: FormData): Promise<AttendeeProfileFormState> {
  const wizard = formData.get("context") === "wizard";
  const context = await getPortalActionContext(wizard ? "/register" : "/account/attendees");
  if (isPortalRedirect(context)) return context;
  const { org, account } = context;
  await assertActionRateLimit("portal:attendee-profile", `${org.id}:${account.id}`);
  const parsed = parseAttendeeProfileForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const profile = await runRegistrationPolicyTransaction(async (tx) => {
    await assertAttendeeProfileCeiling(tx, { orgId: org.id, portalAccountId: account.id });
    return tx.attendeeProfile.create({
      data: { orgId: org.id, portalAccountId: account.id, accountHolderOf: null, ...parsed.data },
      select: { id: true }
    });
  });
  revalidateAttendees();
  return wizard ? { success: "Attendee added.", profileId: profile.id } : { redirectTo: "/account/attendees?notice=added" };
}

export async function updateAttendeeProfile(
  _state: AttendeeProfileFormState,
  formData: FormData
): Promise<AttendeeProfileFormState> {
  try {
    return await updateAttendeeProfileInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function updateAttendeeProfileInner(formData: FormData): Promise<AttendeeProfileFormState> {
  const context = await getPortalActionContext("/account/attendees");
  if (isPortalRedirect(context)) return context;
  const { org, account } = context;
  await assertActionRateLimit("portal:attendee-profile", `${org.id}:${account.id}`);
  const id = parseProfileId(formData);
  const parsed = parseAttendeeProfileForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const where = { id, orgId: org.id, portalAccountId: account.id };

  const jobs = await runRegistrationPolicyTransaction(async (tx) => {
    const profile = await tx.attendeeProfile.findFirst({ where, select: { id: true } });
    if (!profile) throw new PublicActionError("Attendee not found.");
    await tx.attendeeProfile.update({ where, data: parsed.data });
    const eligible = {
      orgId: org.id,
      printedAt: null,
      registration: {
        orgId: org.id, portalAccountId: account.id, attendeeProfileId: profile.id,
        status: { in: [...registrationReservationStatuses] }
      }
    };
    const badges = await tx.badge.findMany({
      where: eligible,
      select: { id: true, templateId: true, registration: { select: { eventId: true } } }
    });
    if (badges.length) {
      await tx.badge.updateMany({
        where: { ...eligible, id: { in: badges.map((badge) => badge.id) } },
        data: { pdfUrl: null, zplData: null, generatedAt: null, renderIssue: null }
      });
    }
    const grouped = new Map<string, GenerateBadgesJob & { badgeIds: string[] }>();
    for (const badge of badges) {
      const eventId = badge.registration.eventId;
      const key = `${eventId}:${badge.templateId}`;
      const job = grouped.get(key) ?? { orgId: org.id, eventId, templateId: badge.templateId, badgeIds: [] };
      job.badgeIds.push(badge.id);
      grouped.set(key, job);
    }
    return [...grouped.values()];
  });

  for (const job of jobs) {
    try {
      await badgeQueue.add("generate-badges", job);
    } catch {
      // The invalidated badges remain pending for regeneration from the event badge queue.
    }
  }
  revalidateAttendees();
  return { redirectTo: "/account/attendees?notice=saved" };
}

export async function deleteAttendeeProfile(
  _state: AttendeeProfileFormState,
  formData: FormData
): Promise<AttendeeProfileFormState> {
  try {
    return await deleteAttendeeProfileInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function deleteAttendeeProfileInner(formData: FormData): Promise<AttendeeProfileFormState> {
  const context = await getPortalActionContext("/account/attendees");
  if (isPortalRedirect(context)) return context;
  const { org, account } = context;
  await assertActionRateLimit("portal:attendee-profile", `${org.id}:${account.id}`);
  const id = parseProfileId(formData);
  const where = { id, orgId: org.id, portalAccountId: account.id };

  await runRegistrationPolicyTransaction(async (tx) => {
    const profile = await tx.attendeeProfile.findFirst({ where, select: { id: true } });
    if (!profile) throw new PublicActionError("Attendee not found.");
    const registrations = await tx.registration.count({ where: { orgId: org.id, portalAccountId: account.id, attendeeProfileId: profile.id } });
    if (registrations) throw new PublicActionError("This attendee has registrations and cannot be deleted.");
    await tx.attendeeProfile.delete({ where });
  });
  revalidateAttendees();
  return { redirectTo: "/account/attendees?notice=deleted" };
}
