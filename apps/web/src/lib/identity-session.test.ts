import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn()
  },
  user: {
    findUnique: vi.fn()
  }
}));

vi.mock("@vfurst/db", () => ({
  prisma: mocks
}));

import {
  bindIdentitySessionToJwt,
  resolveIdentitySessionExpiry,
  revokeIdentitySession,
  validateIdentitySession
} from "./identity-session";

const now = new Date("2026-07-17T00:00:00.000Z");
const expires = new Date("2026-07-18T00:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";

describe("identity-session registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.deleteMany.mockResolvedValue({ count: 0 });
    mocks.session.updateMany.mockResolvedValue({ count: 1 });
    mocks.session.create.mockResolvedValue({ id: sessionId, userId, authVersion: 3, expires });
    mocks.user.findUnique.mockResolvedValue({ authVersion: 3, platformRole: "USER" });
  });

  it("binds a new JWT to a persisted identity session", async () => {
    const token = await bindIdentitySessionToJwt({}, userId, now);

    expect(token).toMatchObject({
      sub: userId,
      authVersion: 3,
      identitySessionId: sessionId,
      identitySessionValid: true,
      platformRole: "USER"
    });
    expect(mocks.session.create).toHaveBeenCalledWith({
      data: {
        sessionToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        userId,
        authVersion: 3,
        expires: new Date("2026-07-17T12:00:00.000Z"),
        oidcSid: null,
        idToken: null
      },
      select: { id: true, userId: true, authVersion: true, expires: true }
    });
  });

  it("validates a registered JWT and refreshes its slim platform role", async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      authVersion: 3,
      expires,
      revokedAt: null,
      user: { authVersion: 3, platformRole: "PLATFORM_ADMIN" }
    });

    const token = await bindIdentitySessionToJwt(
      { sub: userId, authVersion: 3, identitySessionId: sessionId },
      undefined,
      now
    );

    expect(token).toMatchObject({
      identitySessionValid: true,
      platformRole: "PLATFORM_ADMIN"
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
  });

  it("marks the registry row revoked after an authVersion change", async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      authVersion: 3,
      expires,
      revokedAt: null,
      user: { authVersion: 4, platformRole: "USER" }
    });

    const token = await bindIdentitySessionToJwt(
      { sub: userId, authVersion: 3, identitySessionId: sessionId, platformRole: "USER" },
      undefined,
      now
    );

    expect(token.identitySessionValid).toBe(false);
    expect(token.identitySessionId).toBeUndefined();
    expect(token.platformRole).toBeUndefined();
    expect(mocks.session.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, idToken: null }
    });
  });

  it("revokes a registry row whose stored issue version does not match the JWT", async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      authVersion: 2,
      expires,
      revokedAt: null,
      user: { authVersion: 3, platformRole: "USER" }
    });

    await expect(
      validateIdentitySession({ identitySessionId: sessionId, userId, authVersion: 3, now })
    ).resolves.toBeNull();
    expect(mocks.session.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, idToken: null }
    });
  });

  it("deletes expired identity sessions", async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      authVersion: 3,
      expires: new Date("2026-07-16T23:59:59.000Z"),
      revokedAt: null,
      user: { authVersion: 3, platformRole: "USER" }
    });

    await expect(
      validateIdentitySession({ identitySessionId: sessionId, userId, authVersion: 3, now })
    ).resolves.toBeNull();
    expect(mocks.session.deleteMany).toHaveBeenCalledWith({ where: { id: sessionId } });
  });

  it("rejects an already-revoked registry row without erasing its audit timestamp", async () => {
    mocks.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      authVersion: 3,
      expires,
      revokedAt: new Date("2026-07-16T12:00:00.000Z"),
      user: { authVersion: 3, platformRole: "USER" }
    });

    await expect(
      validateIdentitySession({ identitySessionId: sessionId, userId, authVersion: 3, now })
    ).resolves.toBeNull();
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });

  it("upgrades a valid legacy JWT into the registry", async () => {
    const token = await bindIdentitySessionToJwt(
      { sub: userId, authVersion: 3, exp: Math.floor(expires.getTime() / 1_000) },
      undefined,
      now
    );

    expect(token.identitySessionId).toBe(sessionId);
    expect(token.identitySessionValid).toBe(true);
    expect(mocks.session.create).toHaveBeenCalledOnce();
  });

  it("rejects a legacy JWT whose authVersion is stale", async () => {
    mocks.user.findUnique.mockResolvedValue({ authVersion: 4, platformRole: "USER" });

    const token = await bindIdentitySessionToJwt(
      { sub: userId, authVersion: 3, exp: Math.floor(expires.getTime() / 1_000) },
      undefined,
      now
    );

    expect(token.identitySessionValid).toBe(false);
    expect(mocks.session.create).not.toHaveBeenCalled();
  });

  it("caps registry expiry and refuses an already-expired JWT", () => {
    expect(resolveIdentitySessionExpiry(undefined, now)).toEqual(new Date("2026-07-17T12:00:00.000Z"));
    expect(resolveIdentitySessionExpiry(Math.floor(now.getTime() / 1_000), now)).toBeNull();
    expect(resolveIdentitySessionExpiry(Math.floor(new Date("2027-01-01").getTime() / 1_000), now)).toEqual(
      new Date("2026-07-17T12:00:00.000Z")
    );
  });

  it("stores the OIDC sid and ID token on a new identity session", async () => {
    await bindIdentitySessionToJwt({}, userId, now, { sid: "authentik-sid-1", idToken: "id.token.value" });

    expect(mocks.session.create.mock.calls[0]?.[0].data).toMatchObject({
      oidcSid: "authentik-sid-1",
      idToken: "id.token.value"
    });
  });

  it("revoking a session clears its ID token", async () => {
    await revokeIdentitySession(sessionId, now);

    expect(mocks.session.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, idToken: null }
    });
  });

  it("revokes only well-formed identity-session ids", async () => {
    await revokeIdentitySession("not-a-uuid");
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();

    await revokeIdentitySession(sessionId, now);
    expect(mocks.session.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, idToken: null }
    });
  });
});
