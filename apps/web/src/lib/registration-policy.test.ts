import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@vfurst/db";
import { getRegistrationApprovalStatus, assertRegistrationCapacity, assertTransfersAllowed, RegistrationPolicyError } from "./registration-policy";

const baseSettings = {
  requireApproval: false,
  allowTransfers: true,
  maxRegistrationsPerUser: 2
};

describe("registration policy", () => {
  function capacityTransaction(count: number) {
    return {
      event: { findUnique: vi.fn().mockResolvedValue({ id: "e1", orgId: "o1", settings: { maxRegistrationsPerUser: 2 } }) },
      registrationType: { findUnique: vi.fn().mockResolvedValue({ id: "t1", eventId: "e1", orgId: "o1", maxCapacity: null }) },
      attendeeProfile: { findUnique: vi.fn().mockResolvedValue({ id: "p1", orgId: "o1", portalAccountId: "acct-1" }) },
      registration: { count: vi.fn().mockResolvedValue(count).mockResolvedValueOnce(0) }
    };
  }

  it("counts the per-account registration limit by portal account", async () => {
    const tx = capacityTransaction(0);
    await assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, { eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1" });
    const { where } = tx.registration.count.mock.calls[1][0];
    expect(where).toHaveProperty("portalAccountId", "acct-1");
    expect(where).not.toHaveProperty("userId");
  });

  it("rejects an account that already holds the event's registration limit", async () => {
    const tx = capacityTransaction(2);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, { eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1" }))
      .rejects.toThrow(new RegistrationPolicyError("This event allows at most 2 attendees per account."));
  });

  it.each([
    null,
    { id: "p1", orgId: "other-org", portalAccountId: "acct-1" },
    { id: "p1", orgId: "o1", portalAccountId: "other-account" }
  ])("rejects a profile from another account or organization (%j)", async (profile) => {
    const tx = capacityTransaction(0);
    tx.attendeeProfile.findUnique.mockResolvedValue(profile);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1"
    })).rejects.toThrow("That attendee is not available.");
    expect(tx.registration.count).not.toHaveBeenCalled();
  });

  it("rejects a second active registration for the same profile and event", async () => {
    const tx = capacityTransaction(0);
    tx.registration.count.mockReset().mockResolvedValue(1);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1", excludeRegistrationId: "current"
    })).rejects.toThrow("This attendee is already registered for this event.");
    expect(tx.registration.count).toHaveBeenCalledExactlyOnceWith({ where: {
      orgId: "o1", eventId: "e1", attendeeProfileId: "p1", id: { not: "current" },
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }
    } });
  });

  it("lets a profile whose registration was cancelled register again", async () => {
    const tx = capacityTransaction(0);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1"
    })).resolves.toHaveProperty("event.id", "e1");
    expect(tx.registration.count.mock.calls[0][0].where.status.in).toEqual(["PENDING", "CONFIRMED", "CHECKED_IN"]);
  });

  it("uses attendee singular when the account cap is 1", async () => {
    const tx = capacityTransaction(1);
    tx.event.findUnique.mockResolvedValue({ id: "e1", orgId: "o1", settings: { maxRegistrationsPerUser: 1 } });
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1"
    })).rejects.toThrow("This event allows at most 1 attendee per account.");
  });

  it("skips the cap but not uniqueness when enforceUserLimit is false", async () => {
    const tx = capacityTransaction(20);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1", enforceUserLimit: false
    })).resolves.toHaveProperty("event.id", "e1");
    expect(tx.registration.count).toHaveBeenCalledTimes(1);
    tx.registration.count.mockResolvedValue(1);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1", enforceUserLimit: false
    })).rejects.toThrow("This attendee is already registered for this event.");
  });

  it("excludes the current registration during an upgrade", async () => {
    const tx = capacityTransaction(0);
    await assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, {
      eventId: "e1", portalAccountId: "acct-1", attendeeProfileId: "p1", typeId: "t1", excludeRegistrationId: "current", enforceUserLimit: false
    });
    expect(tx.registration.count).toHaveBeenCalledExactlyOnceWith({ where: {
      orgId: "o1", eventId: "e1", attendeeProfileId: "p1", id: { not: "current" }, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }
    } });
  });

  it("keeps payment status separate from required organizer approval", () => {
    expect(getRegistrationApprovalStatus({ ...baseSettings, requireApproval: true })).toBe("PENDING");
    expect(getRegistrationApprovalStatus(baseSettings)).toBe("APPROVED");
  });

  it("treats cashier and completed staff transfers as already approved", () => {
    expect(getRegistrationApprovalStatus({ ...baseSettings, requireApproval: true }, "CASHIER")).toBe("APPROVED");
    expect(getRegistrationApprovalStatus({ ...baseSettings, requireApproval: true }, "TRANSFER")).toBe("APPROVED");
  });

  it("rejects disabled transfers", () => {
    expect(() => assertTransfersAllowed({ ...baseSettings, allowTransfers: false })).toThrow(RegistrationPolicyError);
  });
});
