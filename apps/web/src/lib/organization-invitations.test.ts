import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    orgInvitation: { findUnique: vi.fn(), updateMany: vi.fn() },
    orgMember: { upsert: vi.fn() }
  };
  return { tx, prisma: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } };
});

vi.mock("@vfurst/db", () => ({
  prisma: db.prisma,
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } }
}));

import {
  acceptOrganizationInvitation,
  createOrganizationInvitationCredential,
  getOrganizationInvitationState,
  hashOrganizationInvitationToken,
  normalizeInvitationEmail
} from "./organization-invitations";
import { safeReturnTo } from "./return-to";

describe("organization invitation credentials", () => {
  it("creates a high-entropy token and stores only its deterministic SHA-256 hash", () => {
    const first = createOrganizationInvitationCredential();
    const second = createOrganizationInvitationCredential();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toBe(first.token);
    expect(first.tokenHash).toBe(createHash("sha256").update(first.token).digest("hex"));
    expect(second.token).not.toBe(first.token);
    expect(hashOrganizationInvitationToken(first.token)).toBe(first.tokenHash);
  });

  it("normalizes the recipient identity", () => {
    expect(normalizeInvitationEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });
});

describe("organization invitation state", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");

  it("distinguishes pending, expired, revoked, and accepted invitations", () => {
    expect(getOrganizationInvitationState({ acceptedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() + 1) }, now)).toBe("PENDING");
    expect(getOrganizationInvitationState({ acceptedAt: null, revokedAt: null, expiresAt: now }, now)).toBe("EXPIRED");
    expect(getOrganizationInvitationState({ acceptedAt: null, revokedAt: now, expiresAt: new Date(now.getTime() + 1) }, now)).toBe("REVOKED");
    expect(getOrganizationInvitationState({ acceptedAt: now, revokedAt: now, expiresAt: new Date(now.getTime() - 1) }, now)).toBe("ACCEPTED");
  });
});

describe("safe auth return paths", () => {
  it("keeps local invitation paths and rejects external or ambiguous redirects", () => {
    expect(safeReturnTo("/invitations/token_123")).toBe("/invitations/token_123");
    expect(safeReturnTo("https://attacker.example")).toBe("/dashboard");
    expect(safeReturnTo("//attacker.example")).toBe("/dashboard");
    expect(safeReturnTo("/\\attacker.example")).toBe("/dashboard");
  });
});

describe("organization invitation acceptance", () => {
  it("does not create a membership for an unverified invitee", async () => {
    db.tx.orgInvitation.findUnique.mockResolvedValue({
      id: "invitation-1",
      orgId: "org-1",
      email: "recipient@example.com",
      role: "ADMIN",
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
      org: { status: "ACTIVE" }
    });

    await expect(
      acceptOrganizationInvitation({
        token: "t".repeat(43),
        userId: "user-1",
        userEmail: "recipient@example.com",
        userEmailVerified: false
      })
    ).rejects.toMatchObject({ code: "EMAIL_UNVERIFIED" });
    expect(db.tx.orgInvitation.updateMany).not.toHaveBeenCalled();
    expect(db.tx.orgMember.upsert).not.toHaveBeenCalled();
  });
});
