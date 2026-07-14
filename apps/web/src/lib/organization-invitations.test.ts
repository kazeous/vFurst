import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
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
