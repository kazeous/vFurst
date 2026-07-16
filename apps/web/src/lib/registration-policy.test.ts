import { describe, expect, it } from "vitest";
import { getRegistrationApprovalStatus, assertTransfersAllowed, RegistrationPolicyError } from "./registration-policy";

const baseSettings = {
  requireApproval: false,
  allowTransfers: true,
  maxRegistrationsPerUser: 2
};

describe("registration policy", () => {
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
