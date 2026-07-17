import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_INVITATION_TOKEN_BYTES,
  ORGANIZATION_INVITATION_TTL_MS,
  OrganizationInvitationError,
  assertOrganizationInvitationCanBeAccepted,
  createOrganizationInvitationCredential,
  getOrganizationInvitationState,
  hashOrganizationInvitationToken,
  isInvitationRoleAllowed,
  isValidOrganizationInvitationToken,
  normalizeInvitationEmail,
  organizationAcceptsInvitations,
  type InvitationOrganizationStatus,
  type OrganizationInvitationAcceptanceInput,
  type OrganizationInvitationErrorCode
} from "./invitations.js";

const now = new Date("2026-07-17T12:00:00.000Z");

function pendingInvitation(
  overrides: Partial<OrganizationInvitationAcceptanceInput> = {}
): OrganizationInvitationAcceptanceInput {
  return {
    acceptedAt: null,
    email: "recipient@example.com",
    expiresAt: new Date(now.getTime() + 60_000),
    organizationStatus: "ACTIVE",
    revokedAt: null,
    ...overrides
  };
}

function expectInvitationError(run: () => void, code: OrganizationInvitationErrorCode) {
  try {
    run();
    throw new Error("Expected invitation validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(OrganizationInvitationError);
    expect((error as OrganizationInvitationError).code).toBe(code);
  }
}

describe("organization invitation credentials", () => {
  it("creates independent high-entropy tokens while exposing only their hashes for persistence", () => {
    const first = createOrganizationInvitationCredential();
    const second = createOrganizationInvitationCredential();

    expect(ORGANIZATION_INVITATION_TOKEN_BYTES).toBe(32);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toBe(createHash("sha256").update(first.token).digest("hex"));
    expect(hashOrganizationInvitationToken(first.token)).toBe(first.tokenHash);
    expect(second.token).not.toBe(first.token);
  });

  it("accepts the legacy-compatible bounded base64url token shape", () => {
    expect(isValidOrganizationInvitationToken("a".repeat(32))).toBe(true);
    expect(isValidOrganizationInvitationToken("a".repeat(128))).toBe(true);
    expect(isValidOrganizationInvitationToken("a".repeat(31))).toBe(false);
    expect(isValidOrganizationInvitationToken("a".repeat(129))).toBe(false);
    expect(isValidOrganizationInvitationToken(`${"a".repeat(31)}!`)).toBe(false);
  });

  it("normalizes recipient email and retains the seven-day policy", () => {
    expect(normalizeInvitationEmail(" Recipient@Example.COM ")).toBe("recipient@example.com");
    expect(ORGANIZATION_INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1_000);
  });
});

describe("organization invitation state and acceptance", () => {
  it("applies accepted, revoked, expired, then pending precedence", () => {
    expect(getOrganizationInvitationState(pendingInvitation(), now)).toBe("PENDING");
    expect(getOrganizationInvitationState(pendingInvitation({ expiresAt: now }), now)).toBe("EXPIRED");
    expect(getOrganizationInvitationState(pendingInvitation({ revokedAt: now }), now)).toBe("REVOKED");
    expect(
      getOrganizationInvitationState(
        pendingInvitation({ acceptedAt: now, revokedAt: now, expiresAt: new Date(now.getTime() - 1) }),
        now
      )
    ).toBe("ACCEPTED");
  });

  it("allows active and provisioning tenants but rejects suspended and retired tenants", () => {
    const expected = new Map<InvitationOrganizationStatus, boolean>([
      ["ACTIVE", true],
      ["PROVISIONING", true],
      ["SUSPENDED", false],
      ["RETIRED", false]
    ]);

    for (const [status, allowed] of expected) {
      expect(organizationAcceptsInvitations(status)).toBe(allowed);
    }
  });

  it("accepts a pending invitation for the normalized recipient", () => {
    expect(() =>
      assertOrganizationInvitationCanBeAccepted(pendingInvitation(), " Recipient@Example.COM ", now)
    ).not.toThrow();
  });

  it("reports every terminal or identity-bound acceptance failure", () => {
    expectInvitationError(
      () => assertOrganizationInvitationCanBeAccepted(pendingInvitation({ acceptedAt: now }), "recipient@example.com", now),
      "ALREADY_ACCEPTED"
    );
    expectInvitationError(
      () => assertOrganizationInvitationCanBeAccepted(pendingInvitation({ revokedAt: now }), "recipient@example.com", now),
      "REVOKED"
    );
    expectInvitationError(
      () => assertOrganizationInvitationCanBeAccepted(pendingInvitation({ expiresAt: now }), "recipient@example.com", now),
      "EXPIRED"
    );
    expectInvitationError(
      () => assertOrganizationInvitationCanBeAccepted(pendingInvitation(), "other@example.com", now),
      "EMAIL_MISMATCH"
    );
    expectInvitationError(
      () =>
        assertOrganizationInvitationCanBeAccepted(
          pendingInvitation({ organizationStatus: "SUSPENDED" }),
          "recipient@example.com",
          now
        ),
      "UNAVAILABLE"
    );
  });
});

describe("organization invitation role policy", () => {
  it("lets owners invite any organization role", () => {
    expect(isInvitationRoleAllowed("OWNER", "OWNER")).toBe(true);
    expect(isInvitationRoleAllowed("OWNER", "ADMIN")).toBe(true);
    expect(isInvitationRoleAllowed("OWNER", "MEMBER")).toBe(true);
  });

  it("lets admins invite admins or members, while members cannot invite", () => {
    expect(isInvitationRoleAllowed("ADMIN", "OWNER")).toBe(false);
    expect(isInvitationRoleAllowed("ADMIN", "ADMIN")).toBe(true);
    expect(isInvitationRoleAllowed("ADMIN", "MEMBER")).toBe(true);
    expect(isInvitationRoleAllowed("MEMBER", "MEMBER")).toBe(false);
  });
});
