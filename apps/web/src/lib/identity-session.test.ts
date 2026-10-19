import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@vfurst/db", () => ({ prisma: mocks }));
import { bindIdentitySessionToJwt, issueIdentitySession, resolveIdentitySessionExpiry, revokeIdentitySession, validateIdentitySession, type IdentityJwtClaims } from "./identity-session";

const now = new Date("2026-10-19T00:00:00Z");
const expires = new Date("2026-10-19T12:00:00Z");
const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const issuer = "http://localhost:8090/vfurst";
function sessionRecord(overrides = {}) {
  return { id: sessionId, userId, authVersion: 3, expires, revokedAt: null, createdAt: now, lastUsedAt: now,
    idleExpiresAt: new Date(now.getTime() + 1_800_000), idpValidUntil: new Date(now.getTime() + 300_000),
    oidcIssuer: issuer, oidcClientId: "vfurst-local", oidcSubject: "sub-1", primaryAuthenticatedAt: now,
    mfaEnrolled: true, mfaVerifiedAt: now,
    user: { authVersion: 3, platformRole: "USER", name: "Current name", email: "current@example.com", image: null, emailVerified: now },
    ...overrides };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_AUTHENTIK_ISSUER", issuer);
  vi.stubEnv("AUTH_AUTHENTIK_ID", "vfurst-local");
  mocks.session.findUnique.mockResolvedValue(sessionRecord());
  mocks.session.updateMany.mockResolvedValue({ count: 1 });
  mocks.session.create.mockResolvedValue({ id: sessionId });
});
afterEach(() => vi.unstubAllEnvs());

describe("staff identity session registry", () => {
  it("issues a host session with real authentication evidence and fixed deadlines", async () => {
    await issueIdentitySession({ userId, authVersion: 3, expires, now, issuer, clientId: "vfurst-local", subject: "sub-1",
      oidcSid: "sid-1", idToken: "id.token", idpValidUntil: new Date(now.getTime() + 300_000),
      assurance: { primaryAuthenticatedAt: now, mfaEnrolled: true, mfaVerifiedAt: now } });
    expect(mocks.session.create.mock.calls[0][0].data).toMatchObject({
      sessionToken: expect.stringMatching(/^[0-9a-f]{64}$/), expires, idleExpiresAt: new Date(now.getTime() + 1_800_000),
      oidcIssuer: issuer, oidcSubject: "sub-1", oidcSid: "sid-1", idToken: "id.token", primaryAuthenticatedAt: now
    });
  });
  it("refreshes current profile and role from the database", async () => {
    const record = sessionRecord();
    record.user.platformRole = "PLATFORM_ADMIN";
    mocks.session.findUnique.mockResolvedValue(record);
    const token = await bindIdentitySessionToJwt({ sub: userId, authVersion: 3, identitySessionId: sessionId, email: "old@example.com" }, now);
    expect(token).toMatchObject({ identitySessionValid: true, platformRole: "PLATFORM_ADMIN", email: "current@example.com", name: "Current name" });
  });
  it.each(["revoked", "expired", "deleted", "idle", "version", "issuer", "client", "missing-proof"])(
    "rejects %s sessions on every subsequent request without recreating them", async (reason) => {
      const record = sessionRecord({
        ...(reason === "revoked" ? { revokedAt: now } : {}), ...(reason === "expired" ? { expires: now } : {}),
        ...(reason === "idle" ? { idleExpiresAt: now } : {}), ...(reason === "version" ? { authVersion: 2 } : {}),
        ...(reason === "issuer" ? { oidcIssuer: "https://other.example" } : {}), ...(reason === "client" ? { oidcClientId: "other" } : {}),
        ...(reason === "missing-proof" ? { primaryAuthenticatedAt: null } : {})
      });
      mocks.session.findUnique.mockResolvedValue(reason === "deleted" ? null : record);
      let token: IdentityJwtClaims = { sub: userId, authVersion: 3, identitySessionId: sessionId, platformRole: "PLATFORM_ADMIN" };
      for (let attempt = 0; attempt < 3; attempt++) {
        token = await bindIdentitySessionToJwt(token, now);
        expect(token.identitySessionValid).toBe(false);
        expect(token.identitySessionId).toBeUndefined();
        expect(token.platformRole).toBeUndefined();
      }
      expect(mocks.session.create).not.toHaveBeenCalled();
    }
  );
  it("rejects unbound legacy JWTs even with a current authVersion", async () => {
    expect((await bindIdentitySessionToJwt({ sub: userId, authVersion: 3 }, now)).identitySessionValid).toBe(false);
    expect(mocks.session.create).not.toHaveBeenCalled();
    expect(mocks.session.findUnique).not.toHaveBeenCalled();
  });
  it("requires an IdP check after five minutes without revoking or extending the local session", async () => {
    mocks.session.findUnique.mockResolvedValue(sessionRecord({ idpValidUntil: now }));
    const result = await validateIdentitySession({ userId, authVersion: 3, identitySessionId: sessionId, now });
    expect(result?.security.leaseRequired).toBe(true);
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });
  it("touches activity at most once per minute without extending absolute expiry", async () => {
    mocks.session.findUnique.mockResolvedValue(sessionRecord({ lastUsedAt: new Date(now.getTime() - 60_000) }));
    await validateIdentitySession({ userId, authVersion: 3, identitySessionId: sessionId, now });
    expect(mocks.session.updateMany.mock.calls[0][0].data).toEqual({ lastUsedAt: now, idleExpiresAt: new Date(now.getTime() + 1_800_000) });
    expect(mocks.session.updateMany.mock.calls[0][0].where.revokedAt).toBeNull();
  });
  it("does not revoke a different user's session and ignores malformed IDs", async () => {
    expect(await validateIdentitySession({ userId: "other", authVersion: 3, identitySessionId: sessionId, now })).toBeNull();
    await revokeIdentitySession("malformed");
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });
  it("clears the ID token on revocation without rewriting an existing timestamp", async () => {
    await revokeIdentitySession(sessionId, now);
    expect(mocks.session.updateMany).toHaveBeenCalledWith({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now, idToken: null } });
  });
  it("caps expiry and refuses expired or invalid JWT timestamps", () => {
    expect(resolveIdentitySessionExpiry(undefined, now)).toEqual(expires);
    expect(resolveIdentitySessionExpiry(now.getTime() / 1_000, now)).toBeNull();
    expect(resolveIdentitySessionExpiry(Number.NaN, now)).toBeNull();
    expect(resolveIdentitySessionExpiry(expires.getTime() / 1_000 + 86_400, now)).toEqual(expires);
  });
});
