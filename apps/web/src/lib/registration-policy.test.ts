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
      registration: { count: vi.fn().mockResolvedValue(count) }
    };
  }

  it("counts the per-account registration limit by portal account", async () => {
    const tx = capacityTransaction(0);
    await assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, { eventId: "e1", portalAccountId: "acct-1", typeId: "t1" });
    const { where } = tx.registration.count.mock.calls[0][0];
    expect(where).toHaveProperty("portalAccountId", "acct-1");
    expect(where).not.toHaveProperty("userId");
  });

  it("rejects an account that already holds the event's registration limit", async () => {
    const tx = capacityTransaction(2);
    await expect(assertRegistrationCapacity(tx as unknown as Prisma.TransactionClient, { eventId: "e1", portalAccountId: "acct-1", typeId: "t1" }))
      .rejects.toThrow(new RegistrationPolicyError("This event allows at most 2 active registrations per account."));
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
