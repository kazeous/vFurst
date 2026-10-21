import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@vfurst/db";
import {
  assertAttendeeProfileCeiling,
  ensureAccountHolderProfile,
  listEventAttendees,
  normalizeAttendeeName,
  parseAttendeeProfileForm,
  resolveStaffAttendeeProfile
} from "./attendee-profiles";

const account = { id: "a1", orgId: "o1", name: "Mai Le", email: "mai@example.com" };
const self = {
  id: "p1", orgId: "o1", portalAccountId: "a1", accountHolderOf: "a1", fullName: "Mai Le",
  badgeName: null, dateOfBirth: null, email: null, phone: null
};
const event = { id: "e1", orgId: "o1", settings: {} };
const now = new Date("2026-10-19T23:30:00.000Z");
const ceilingMessage = "This account has reached the limit of 20 attendees.";

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ fullName: "Mai Le", ...fields })) data.set(key, value);
  return data;
}

function client() {
  return {
    attendeeProfile: {
      findUnique: vi.fn().mockResolvedValue(self),
      findMany: vi.fn().mockResolvedValue([self]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn(async ({ data }: { data: Partial<typeof self> }) => ({ ...self, ...data, id: "created" }))
    },
    registration: { findMany: vi.fn().mockResolvedValue([]) }
  };
}
type Client = ReturnType<typeof client>;
const transaction = (value: Client) => value as unknown as Prisma.TransactionClient;

describe("parseAttendeeProfileForm", () => {
  it("trims and collapses the full name to NFC", () => {
    const result = parseAttendeeProfileForm(form({ fullName: "  Nguyễn  Văn An  ".normalize("NFD"), email: "  MAI@EXAMPLE.COM " }), now);
    expect(result).toMatchObject({ ok: true, data: { fullName: "Nguyễn Văn An", email: "mai@example.com" } });
  });

  it.each([
    [{ fullName: "   " }, "Enter the attendee's full name."],
    [{ fullName: "x".repeat(121) }, "Full name must be 120 characters or fewer."],
    [{ badgeName: "x".repeat(33) }, "Badge name must be 32 characters or fewer."],
    [{ dateOfBirth: "2025-02-30" }, "Enter a valid date of birth."],
    [{ dateOfBirth: "2026-10-20" }, "Enter a valid date of birth."],
    [{ dateOfBirth: "1899-12-31" }, "Enter a valid date of birth."],
    [{ dateOfBirth: "2010-5-1" }, "Enter a valid date of birth."],
    [{ email: "not-an-email" }, "Enter a valid email address."],
    [{ phone: "x".repeat(33) }, "Phone must be 32 characters or fewer."]
  ])("returns exact inline validation for %j", (fields, error) => {
    expect(parseAttendeeProfileForm(form(fields as Record<string, string>), now)).toEqual({ ok: false, error });
  });

  it("stores a whitespace badge name as null", () => {
    expect(parseAttendeeProfileForm(form({ badgeName: "  \t ", email: " ", phone: " " }), now)).toEqual({
      ok: true, data: { fullName: "Mai Le", badgeName: null, dateOfBirth: null, email: null, phone: null }
    });
  });

  it("stores 2010-05-01 as UTC midnight", () => {
    const result = parseAttendeeProfileForm(form({ dateOfBirth: "2010-05-01" }), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.dateOfBirth?.toISOString()).toBe("2010-05-01T00:00:00.000Z");
  });

  it("accepts a leap day and both date bounds", () => {
    for (const dateOfBirth of ["2000-02-29", "1900-01-01", "2026-10-19"]) {
      expect(parseAttendeeProfileForm(form({ dateOfBirth }), now).ok).toBe(true);
    }
  });
});

describe("normalizeAttendeeName", () => {
  it("matches Unicode and spacing variants", () => {
    expect(normalizeAttendeeName("Nguyễn  Văn An".normalize("NFD"))).toBe("nguyễn văn an");
  });
});

describe("ensureAccountHolderProfile", () => {
  it("returns the existing self profile without writing", async () => {
    const tx = client();
    await expect(ensureAccountHolderProfile(transaction(tx), { ...account, name: "A changed account name" })).resolves.toEqual(self);
    expect(tx.attendeeProfile.create).not.toHaveBeenCalled();
    expect(tx.attendeeProfile.findUnique).toHaveBeenCalledWith({ where: { accountHolderOf: account.id, orgId: account.orgId, portalAccountId: account.id } });
  });

  it.each(["  Mai Le  ", null])("creates the self profile named from the account name, falling back to the email (%s)", async (name) => {
    const tx = client();
    tx.attendeeProfile.findUnique.mockResolvedValue(null);
    const result = await ensureAccountHolderProfile(transaction(tx), { ...account, name });
    expect(result.fullName).toBe(name ? "Mai Le" : account.email);
    expect(tx.attendeeProfile.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orgId: account.orgId, portalAccountId: account.id, accountHolderOf: account.id, email: null
    }) });
  });

  it("re-reads after a P2002 race", async () => {
    const tx = client();
    tx.attendeeProfile.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(self);
    tx.attendeeProfile.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(ensureAccountHolderProfile(transaction(tx), account)).resolves.toEqual(self);
    expect(tx.attendeeProfile.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("assertAttendeeProfileCeiling", () => {
  it("rejects the 21st profile with the ceiling message", async () => {
    const tx = client();
    tx.attendeeProfile.count.mockResolvedValue(20);
    await expect(assertAttendeeProfileCeiling(transaction(tx), { orgId: account.orgId, portalAccountId: account.id })).rejects.toThrow(ceilingMessage);
    expect(tx.attendeeProfile.count).toHaveBeenCalledWith({ where: { orgId: account.orgId, portalAccountId: account.id } });
  });
});

describe("listEventAttendees", () => {
  it("lists without a separate self-profile read when the account holder is listed", async () => {
    const tx = client();
    const result = await listEventAttendees(transaction(tx), { account, event });
    expect(result.attendees[0].isAccountHolder).toBe(true);
    expect(tx.attendeeProfile.findUnique).not.toHaveBeenCalled();
    expect(tx.attendeeProfile.create).not.toHaveBeenCalled();
    expect(tx.attendeeProfile.findMany).toHaveBeenCalledOnce();
  });

  it("ensures the account holder profile and lists it first", async () => {
    const tx = client();
    tx.attendeeProfile.findUnique.mockResolvedValue(null);
    tx.attendeeProfile.findMany
      .mockResolvedValueOnce([{ ...self, id: "other", accountHolderOf: null }])
      .mockResolvedValueOnce([{ ...self, id: "other", accountHolderOf: null }, { ...self, id: "created" }]);
    const result = await listEventAttendees(transaction(tx), { account, event });
    expect(tx.attendeeProfile.create).toHaveBeenCalledOnce();
    expect(tx.attendeeProfile.findMany).toHaveBeenCalledTimes(2);
    expect(result.attendees.map(({ id }) => id)).toEqual(["created", "other"]);
    expect(result.attendees[0].isAccountHolder).toBe(true);
    expect(tx.attendeeProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: account.orgId, portalAccountId: account.id } }));
  });

  it("marks profiles with an active registration for the event as registered and reports cap and used", async () => {
    const tx = client();
    tx.attendeeProfile.findMany.mockResolvedValue([self, { ...self, id: "p2", accountHolderOf: null }]);
    tx.registration.findMany.mockResolvedValue([{ attendeeProfileId: "p2" }]);
    const result = await listEventAttendees(transaction(tx), { account, event: { ...event, settings: { maxRegistrationsPerUser: 2 } } });
    expect(result).toEqual({ cap: 2, used: 1, attendees: [
      { id: "p1", fullName: "Mai Le", badgeName: null, isAccountHolder: true, registered: false },
      { id: "p2", fullName: "Mai Le", badgeName: null, isAccountHolder: false, registered: true }
    ] });
    expect(tx.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      orgId: account.orgId, portalAccountId: account.id, eventId: event.id, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }
    } }));
    expect((await listEventAttendees(transaction(tx), { account, event })).cap).toBe(4);
  });
});

describe("resolveStaffAttendeeProfile", () => {
  it("reuses a free same-named profile, self first, matching Unicode and spacing variants", async () => {
    const tx = client();
    const namedSelf = { ...self, fullName: "Nguyễn Văn An" };
    tx.attendeeProfile.findUnique.mockResolvedValue(namedSelf);
    tx.attendeeProfile.findMany.mockResolvedValue([{ ...namedSelf, id: "p2", accountHolderOf: null }, namedSelf]);
    await expect(resolveStaffAttendeeProfile(transaction(tx), { account, eventId: event.id, fullName: "  Nguyễn  Văn An  ".normalize("NFD") })).resolves.toEqual({ id: "p1" });
    expect(tx.attendeeProfile.create).not.toHaveBeenCalled();
  });

  it.each(["Mai Le", null])("creates the self profile for an account without one when names match or the account name is null (%s)", async (name) => {
    const tx = client();
    tx.attendeeProfile.findUnique.mockResolvedValue(null);
    tx.attendeeProfile.findMany.mockResolvedValue([{ ...self, id: "created", fullName: "Mai Le" }]);
    await expect(resolveStaffAttendeeProfile(transaction(tx), { account: { ...account, name }, eventId: event.id, fullName: "Mai Le" })).resolves.toEqual({ id: "created" });
    expect(tx.attendeeProfile.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accountHolderOf: account.id, fullName: "Mai Le" }) });
  });

  it("creates a separate profile for a different name under an existing account", async () => {
    const tx = client();
    await expect(resolveStaffAttendeeProfile(transaction(tx), { account, eventId: event.id, fullName: "  Nguyễn  Văn An ".normalize("NFD") })).resolves.toEqual({ id: "created" });
    expect(tx.attendeeProfile.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orgId: account.orgId, portalAccountId: account.id, accountHolderOf: null, fullName: "Nguyễn Văn An"
    }) });
  });

  it("skips a same-named profile that is already registered for the event", async () => {
    const tx = client();
    tx.attendeeProfile.findMany.mockResolvedValue([self, { ...self, id: "p2", accountHolderOf: null }]);
    tx.registration.findMany.mockResolvedValue([{ attendeeProfileId: self.id }]);
    await expect(resolveStaffAttendeeProfile(transaction(tx), { account, eventId: event.id, fullName: self.fullName })).resolves.toEqual({ id: "p2" });
    expect(tx.attendeeProfile.create).not.toHaveBeenCalled();
  });

  it("enforces the ceiling", async () => {
    const tx = client();
    tx.attendeeProfile.count.mockResolvedValue(20);
    await expect(resolveStaffAttendeeProfile(transaction(tx), { account, eventId: event.id, fullName: "Different attendee" })).rejects.toThrow(ceilingMessage);
    expect(tx.attendeeProfile.create).not.toHaveBeenCalled();
  });
});
