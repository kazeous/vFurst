import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    attendeeProfile: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    registration: { count: vi.fn() },
    badge: { findMany: vi.fn(), updateMany: vi.fn() }
  };
  return {
    tx, committed: false,
    transaction: vi.fn(), context: vi.fn(), rateLimit: vi.fn(), queue: vi.fn(), revalidate: vi.fn(), rethrow: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({
  prisma: { $transaction: mocks.transaction },
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" }, PrismaClientKnownRequestError: class extends Error {} }
}));
vi.mock("@/lib/portal-context", () => ({
  getPortalActionContext: mocks.context, isPortalRedirect: (value: object) => "redirectTo" in value
}));
vi.mock("@/lib/rate-limit", () => ({ assertActionRateLimit: mocks.rateLimit, RateLimitExceededError: class extends Error {} }));
vi.mock("@/lib/badge-queue", () => ({ badgeQueue: { add: mocks.queue } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.rethrow }));

import { PublicActionError } from "@/lib/public-action-error";
import { createAttendeeProfile, deleteAttendeeProfile, updateAttendeeProfile } from "./attendee-profile-actions";

const org = { id: "org-one" };
const account = { id: "account-one", orgId: org.id, name: "Owner", email: "owner@example.com" };
const profileId = "00000000-0000-4000-8000-000000000001";
const ownerWhere = { id: profileId, orgId: org.id, portalAccountId: account.id };
const activeStatuses = ["PENDING", "CONFIRMED", "CHECKED_IN"];

function form(context = "wizard") {
  const data = new FormData();
  data.set("profileId", profileId);
  data.set("context", context);
  data.set("fullName", "  Child   Attendee  ");
  data.set("badgeName", "Sam");
  data.set("dateOfBirth", "2010-05-01");
  return data;
}

describe("attendee profile actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.committed = false;
    mocks.context.mockResolvedValue({ org, account });
    mocks.tx.attendeeProfile.count.mockResolvedValue(1);
    mocks.tx.attendeeProfile.findFirst.mockResolvedValue({ id: profileId });
    mocks.tx.attendeeProfile.create.mockResolvedValue({ id: profileId });
    mocks.tx.registration.count.mockResolvedValue(0);
    mocks.tx.badge.findMany.mockResolvedValue([]);
    mocks.tx.badge.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => {
      const result = await callback(mocks.tx);
      mocks.committed = true;
      return result;
    });
    mocks.queue.mockImplementation(async () => {
      expect(mocks.committed).toBe(true);
    });
  });

  it("create enforces the ceiling and the rate limit and returns the new id for the wizard", async () => {
    mocks.tx.attendeeProfile.count.mockResolvedValue(19);
    await expect(createAttendeeProfile({}, form())).resolves.toEqual({ success: "Attendee added.", profileId });
    expect(mocks.context).toHaveBeenCalledWith("/register");
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith("portal:attendee-profile", `${org.id}:${account.id}`);
    expect(mocks.tx.attendeeProfile.count).toHaveBeenCalledWith({ where: { orgId: org.id, portalAccountId: account.id } });
    expect(mocks.tx.attendeeProfile.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      orgId: org.id, portalAccountId: account.id, accountHolderOf: null,
      fullName: "Child Attendee", badgeName: "Sam", dateOfBirth: new Date("2010-05-01T00:00:00.000Z"), email: null, phone: null
    } }));

    mocks.tx.attendeeProfile.create.mockClear();
    mocks.tx.attendeeProfile.count.mockResolvedValue(20);
    await expect(createAttendeeProfile({}, form())).resolves.toEqual({ error: "This account has reached the limit of 20 attendees." });
    expect(mocks.tx.attendeeProfile.create).not.toHaveBeenCalled();
    mocks.rateLimit.mockRejectedValueOnce(new PublicActionError("Rate limited."));
    await expect(createAttendeeProfile({}, form())).resolves.toEqual({ error: "Rate limited." });
    expect(mocks.tx.attendeeProfile.create).not.toHaveBeenCalled();
  });

  it("creates from the account page with its notice redirect", async () => {
    await expect(createAttendeeProfile({}, form("account"))).resolves.toEqual({ redirectTo: "/account/attendees?notice=added" });
    expect(mocks.context).toHaveBeenCalledWith("/account/attendees");
  });

  it("returns authentication redirects before any write", async () => {
    mocks.context.mockResolvedValue({ redirectTo: "/login" });
    for (const action of [createAttendeeProfile, updateAttendeeProfile, deleteAttendeeProfile]) {
      await expect(action({}, form())).resolves.toEqual({ redirectTo: "/login" });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("validates profile fields inline before writing", async () => {
    const invalid = form();
    invalid.set("dateOfBirth", "2025-02-30");
    await expect(updateAttendeeProfile({}, invalid)).resolves.toEqual({ error: "Enter a valid date of birth." });
    expect(mocks.tx.attendeeProfile.update).not.toHaveBeenCalled();
  });

  it.each(["another account", "another organization", "missing"])(
    'update and delete answer "Attendee not found." for a %s profile', async () => {
      mocks.tx.attendeeProfile.findFirst.mockResolvedValue(null);
      for (const action of [updateAttendeeProfile, deleteAttendeeProfile]) {
        await expect(action({}, form())).resolves.toEqual({ error: "Attendee not found." });
      }
      for (const [query] of mocks.tx.attendeeProfile.findFirst.mock.calls) expect(query.where).toEqual(ownerWhere);
      expect(mocks.tx.attendeeProfile.update).not.toHaveBeenCalled();
      expect(mocks.tx.attendeeProfile.delete).not.toHaveBeenCalled();
    }
  );

  it("delete refuses a profile with any registration, including a cancelled one", async () => {
    mocks.tx.registration.count.mockResolvedValue(1);
    await expect(deleteAttendeeProfile({}, form())).resolves.toEqual({ error: "This attendee has registrations and cannot be deleted." });
    expect(mocks.tx.registration.count).toHaveBeenCalledWith({ where: { orgId: org.id, portalAccountId: account.id, attendeeProfileId: profileId } });
    expect(mocks.tx.attendeeProfile.delete).not.toHaveBeenCalled();
  });

  it("deletes a never-registered profile with an owner-scoped write", async () => {
    await expect(deleteAttendeeProfile({}, form())).resolves.toEqual({ redirectTo: "/account/attendees?notice=deleted" });
    expect(mocks.tx.attendeeProfile.delete).toHaveBeenCalledWith({ where: ownerWhere });
  });

  it("update clears only unprinted badges of active registrations and queues their renders", async () => {
    const badges = [
      { id: "active-a", templateId: "template-one", registration: { eventId: "event-one" } },
      { id: "active-b", templateId: "template-one", registration: { eventId: "event-one" } },
      { id: "active-c", templateId: "template-two", registration: { eventId: "event-one" } },
      { id: "active-d", templateId: "template-one", registration: { eventId: "event-two" } }
    ];
    mocks.tx.badge.findMany.mockResolvedValue(badges);
    await expect(updateAttendeeProfile({}, form())).resolves.toEqual({ redirectTo: "/account/attendees?notice=saved" });
    const eligible = {
      orgId: org.id, printedAt: null,
      registration: { orgId: org.id, portalAccountId: account.id, attendeeProfileId: profileId, status: { in: activeStatuses } }
    };
    expect(mocks.tx.badge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: eligible }));
    expect(mocks.tx.badge.updateMany).toHaveBeenCalledWith({
      where: { ...eligible, id: { in: badges.map((badge) => badge.id) } },
      data: { pdfUrl: null, zplData: null, generatedAt: null, renderIssue: null }
    });
    expect(mocks.tx.attendeeProfile.update).toHaveBeenCalledWith(expect.objectContaining({ where: ownerWhere }));
    expect(mocks.queue.mock.calls).toEqual([
      ["generate-badges", { orgId: org.id, eventId: "event-one", templateId: "template-one", badgeIds: ["active-a", "active-b"] }],
      ["generate-badges", { orgId: org.id, eventId: "event-one", templateId: "template-two", badgeIds: ["active-c"] }],
      ["generate-badges", { orgId: org.id, eventId: "event-two", templateId: "template-one", badgeIds: ["active-d"] }]
    ]);
  });

  it("a queue failure leaves the update committed", async () => {
    mocks.tx.badge.findMany.mockResolvedValue([{ id: "badge-one", templateId: "template-one", registration: { eventId: "event-one" } }]);
    mocks.queue.mockRejectedValue(new Error("Redis unavailable"));
    await expect(updateAttendeeProfile({}, form())).resolves.toEqual({ redirectTo: "/account/attendees?notice=saved" });
    expect(mocks.committed).toBe(true);
    expect(mocks.tx.attendeeProfile.update).toHaveBeenCalledOnce();
    expect(mocks.tx.badge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { pdfUrl: null, zplData: null, generatedAt: null, renderIssue: null } }));
  });

  it("rethrows framework control flow before mapping expected errors", async () => {
    const redirect = new PublicActionError("redirect sentinel");
    mocks.context.mockRejectedValue(redirect);
    mocks.rethrow.mockImplementation(() => { throw redirect; });
    await expect(createAttendeeProfile({}, form())).rejects.toBe(redirect);
  });
});
