import { normalizeIdentityEmail } from "@vfurst/auth/core";
import type { prisma, Prisma } from "@vfurst/db";
import { z } from "zod";
import { getCoreEventSettings } from "@/lib/event-settings";
import type { PortalAccountSummary } from "@/lib/portal-session";
import { PublicActionError } from "@/lib/public-action-error";
import { registrationReservationStatuses } from "@/lib/registration-policy";

export const MAX_ATTENDEE_PROFILES_PER_ACCOUNT = 20;
export type AttendeeProfileInput = {
  fullName: string;
  badgeName: string | null;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
};
export type AttendeeProfileRecord = AttendeeProfileInput & {
  id: string;
  orgId: string;
  portalAccountId: string;
  accountHolderOf: string | null;
};
export type EventAttendee = {
  id: string;
  fullName: string;
  badgeName: string | null;
  isAccountHolder: boolean;
  registered: boolean;
};
export type EventAttendeeList = { cap: number; used: number; attendees: EventAttendee[] };

type ProfileAccount = Pick<PortalAccountSummary, "id" | "orgId" | "name" | "email">;
type ProfileClient = Pick<Prisma.TransactionClient, "attendeeProfile">;

function cleanFullName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function normalizeAttendeeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function profileInputSchema(now?: Date) {
  const optionalText = (message: string, max: number) => z.string({ error: message }).trim()
    .max(max, message).transform((value) => value || null);
  return z.object({
    fullName: z.string({ error: "Enter the attendee's full name." }).transform(cleanFullName).pipe(
      z.string().min(1, "Enter the attendee's full name.").max(120, "Full name must be 120 characters or fewer.")
    ),
    badgeName: optionalText("Badge name must be 32 characters or fewer.", 32),
    dateOfBirth: z.string({ error: "Enter a valid date of birth." }).trim().refine((value) => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
        && value >= "1900-01-01" && value <= (now ?? new Date()).toISOString().slice(0, 10);
    }, "Enter a valid date of birth.").transform((value) => value ? new Date(`${value}T00:00:00.000Z`) : null),
    email: z.string({ error: "Enter a valid email address." }).trim()
      .transform((value) => value ? normalizeIdentityEmail(value) : null)
      .pipe(z.email({ error: "Enter a valid email address." }).nullable()),
    phone: optionalText("Phone must be 32 characters or fewer.", 32)
  });
}

export const attendeeProfileInputSchema = profileInputSchema();

export function parseAttendeeProfileForm(formData: FormData, now?: Date):
  { ok: true; data: AttendeeProfileInput } | { ok: false; error: string } {
  const result = profileInputSchema(now).safeParse(Object.fromEntries(
    ["fullName", "badgeName", "dateOfBirth", "email", "phone"].map((key) => [key, formData.get(key) ?? ""])
  ));
  return result.success ? { ok: true, data: result.data } : {
    ok: false, error: result.error.issues[0]?.message ?? "Enter the attendee's full name."
  };
}

export async function assertAttendeeProfileCeiling(
  client: ProfileClient,
  input: { orgId: string; portalAccountId: string }
): Promise<void> {
  const count = await client.attendeeProfile.count({ where: { orgId: input.orgId, portalAccountId: input.portalAccountId } });
  if (count >= MAX_ATTENDEE_PROFILES_PER_ACCOUNT) {
    throw new PublicActionError("This account has reached the limit of 20 attendees.");
  }
}

export async function ensureAccountHolderProfile(client: ProfileClient, account: ProfileAccount): Promise<AttendeeProfileRecord> {
  const where = { accountHolderOf: account.id, orgId: account.orgId, portalAccountId: account.id };
  const existing = await client.attendeeProfile.findUnique({ where });
  if (existing) return existing;

  await assertAttendeeProfileCeiling(client, { orgId: account.orgId, portalAccountId: account.id });
  try {
    return await client.attendeeProfile.create({ data: {
      orgId: account.orgId,
      portalAccountId: account.id,
      accountHolderOf: account.id,
      fullName: (cleanFullName(account.name ?? "") || account.email).slice(0, 120),
      badgeName: null, dateOfBirth: null, email: null, phone: null
    } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const winner = await client.attendeeProfile.findUnique({ where });
      if (winner) return winner;
    }
    throw error;
  }
}

async function eventProfiles(client: Prisma.TransactionClient | typeof prisma, account: ProfileAccount, eventId: string) {
  const where = { orgId: account.orgId, portalAccountId: account.id };
  const [profiles, registrations] = await Promise.all([
    client.attendeeProfile.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    client.registration.findMany({
      where: { ...where, eventId, status: { in: [...registrationReservationStatuses] } },
      select: { attendeeProfileId: true }
    })
  ]);
  profiles.sort((left, right) => Number(right.accountHolderOf === account.id) - Number(left.accountHolderOf === account.id));
  return { profiles, registrations, registered: new Set(registrations.map((registration) => registration.attendeeProfileId)) };
}

export async function listEventAttendees(
  client: Prisma.TransactionClient | typeof prisma,
  input: { account: ProfileAccount; event: { id: string; orgId: string; settings: Prisma.JsonValue } }
): Promise<EventAttendeeList> {
  if (input.event.orgId !== input.account.orgId) throw new PublicActionError("That attendee is not available.");
  let listed = await eventProfiles(client, input.account, input.event.id);
  if (!listed.profiles.some((profile) => profile.accountHolderOf === input.account.id)) {
    await ensureAccountHolderProfile(client, input.account);
    listed = await eventProfiles(client, input.account, input.event.id);
  }
  const { profiles, registrations, registered } = listed;
  return {
    cap: getCoreEventSettings(input.event.settings).maxRegistrationsPerUser,
    used: registrations.length,
    attendees: profiles.map((profile) => ({
      id: profile.id, fullName: profile.fullName, badgeName: profile.badgeName,
      isAccountHolder: profile.accountHolderOf === input.account.id, registered: registered.has(profile.id)
    }))
  };
}

export async function resolveStaffAttendeeProfile(
  tx: Prisma.TransactionClient,
  input: { account: ProfileAccount; fullName: string; eventId: string }
): Promise<{ id: string }> {
  const fullName = cleanFullName(input.fullName);
  if (!fullName) throw new PublicActionError("Enter the attendee's full name.");
  if (fullName.length > 120) throw new PublicActionError("Full name must be 120 characters or fewer.");
  await ensureAccountHolderProfile(tx, { ...input.account, name: input.account.name ?? fullName });
  const { profiles, registered } = await eventProfiles(tx, input.account, input.eventId);
  const existing = profiles.find((profile) => !registered.has(profile.id)
    && normalizeAttendeeName(profile.fullName) === normalizeAttendeeName(fullName));
  if (existing) return { id: existing.id };

  await assertAttendeeProfileCeiling(tx, { orgId: input.account.orgId, portalAccountId: input.account.id });
  const created = await tx.attendeeProfile.create({
    data: { orgId: input.account.orgId, portalAccountId: input.account.id, accountHolderOf: null, fullName }
  });
  return { id: created.id };
}
