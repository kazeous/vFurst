import { hashOpaqueToken } from "@vfurst/auth/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  portalSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock("@vfurst/db", () => ({
  prisma: mocks
}));

import {
  PORTAL_SESSION_MAX_AGE_SECONDS,
  createPortalSession,
  portalSessionCookieName,
  portalSessionCookieOptions,
  resolvePortalSession,
  revokePortalSession
} from "./portal-session";

const now = new Date("2026-10-14T00:00:00.000Z");
const expiresAt = new Date("2026-11-13T00:00:00.000Z");
const orgId = "00000000-0000-4000-8000-000000000001";
const portalAccountId = "00000000-0000-4000-8000-000000000002";
const token = "opaque-portal-session-token";
const account = {
  id: portalAccountId,
  orgId,
  email: "attendee@example.com",
  name: "Attendee",
  authVersion: 3
};

function liveSession() {
  return {
    orgId,
    portalAccountId,
    tokenHash: hashOpaqueToken(token),
    authVersion: 3,
    expiresAt,
    revokedAt: null,
    portalAccount: { ...account }
  };
}

describe("portal sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.portalSession.create.mockResolvedValue({});
    mocks.portalSession.findUnique.mockResolvedValue(liveSession());
    mocks.portalSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it("stores only the token hash and expires exactly 30 days after creation", async () => {
    const created = await createPortalSession({ orgId, portalAccountId, authVersion: 3, now });

    expect(PORTAL_SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.expiresAt).toEqual(expiresAt);
    expect(mocks.portalSession.create).toHaveBeenCalledWith({
      data: {
        orgId,
        portalAccountId,
        tokenHash: hashOpaqueToken(created.token),
        authVersion: 3,
        expiresAt
      }
    });
    expect(JSON.stringify(mocks.portalSession.create.mock.calls)).not.toContain(created.token);
  });

  it("returns only the account summary for a live session", async () => {
    await expect(resolvePortalSession({ token, orgId, now })).resolves.toEqual({
      id: portalAccountId,
      orgId,
      email: "attendee@example.com",
      name: "Attendee"
    });
    expect(mocks.portalSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashOpaqueToken(token) },
      include: {
        portalAccount: {
          select: { id: true, orgId: true, email: true, name: true, authVersion: true }
        }
      }
    });
    expect(mocks.portalSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns null when the session row is missing", async () => {
    mocks.portalSession.findUnique.mockResolvedValue(null);

    await expect(resolvePortalSession({ token, orgId, now })).resolves.toBeNull();
  });

  it("returns null when the session is revoked", async () => {
    mocks.portalSession.findUnique.mockResolvedValue({
      ...liveSession(),
      revokedAt: new Date("2026-10-13T12:00:00.000Z")
    });

    await expect(resolvePortalSession({ token, orgId, now })).resolves.toBeNull();
  });

  it("returns null when the session expires at or before now", async () => {
    for (const expiredAt of [now, new Date(now.getTime() - 1)]) {
      mocks.portalSession.findUnique.mockResolvedValue({ ...liveSession(), expiresAt: expiredAt });

      await expect(resolvePortalSession({ token, orgId, now })).resolves.toBeNull();
    }
  });

  it("returns null when the session authVersion differs from the account", async () => {
    mocks.portalSession.findUnique.mockResolvedValue({
      ...liveSession(),
      portalAccount: { ...account, authVersion: 4 }
    });

    await expect(resolvePortalSession({ token, orgId, now })).resolves.toBeNull();
  });

  it("returns null when the session belongs to a different host organization", async () => {
    await expect(
      resolvePortalSession({ token, orgId: "00000000-0000-4000-8000-000000000003", now })
    ).resolves.toBeNull();
  });

  it("uses the secure cookie name only for HTTPS", () => {
    expect(portalSessionCookieName(true)).toBe("__Host-vfurst-portal");
    expect(portalSessionCookieName(false)).toBe("vfurst-portal");
  });

  it("sets host-only cookie options with the root path and absolute expiry", () => {
    for (const secure of [true, false]) {
      const options = portalSessionCookieOptions(secure, expiresAt);

      expect(options).toEqual({ httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt });
      expect(options).not.toHaveProperty("domain");
    }
  });

  it("revokes only an unrevoked session identified by its token hash", async () => {
    await revokePortalSession(token, now);

    expect(mocks.portalSession.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: now }
    });
  });
});
