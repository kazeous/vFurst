import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { updateMany: vi.fn() },
  account: { findUnique: vi.fn() },
  user: { update: vi.fn() },
  staffOidcRevocation: { findUnique: vi.fn(), upsert: vi.fn() },
  staffOidcLogoutReceipt: { createMany: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock("@vfurst/db", () => ({ prisma: mocks, Prisma: {
  TransactionIsolationLevel: { Serializable: "Serializable" }, PrismaClientKnownRequestError: class extends Error {}
} }));

import {
  applyBackchannelLogout,
  LogoutTokenError,
  verifyLogoutToken
} from "./staff-backchannel-logout";

const issuer = "http://localhost:8090/vfurst";
const clientId = "vfurst-local";
const now = new Date("2026-10-17T10:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1_000);
const event = { "http://schemas.openid.net/event/backchannel-logout": {} };
let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  otherKey = other.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.updateMany.mockResolvedValue({ count: 2 });
  mocks.account.findUnique.mockResolvedValue({ userId: "user-1" });
  mocks.staffOidcRevocation.findUnique.mockResolvedValue(null);
  mocks.staffOidcLogoutReceipt.createMany.mockResolvedValue({ count: 1 });
  mocks.$transaction.mockImplementation((operation) => operation(mocks));
  vi.stubEnv("AUTH_AUTHENTIK_ISSUER", issuer);
  vi.stubEnv("AUTH_AUTHENTIK_ID", clientId);
});
afterEach(() => vi.unstubAllEnvs());

const receipt = { jti: "jti-1", issuedAt: now };

async function logoutToken(claims: JWTPayload, key: CryptoKey = signingKey) {
  // Claims go into the payload directly, so a test can override iss, aud, or iat.
  return new SignJWT({ iss: issuer, aud: clientId, iat: nowSeconds, events: event, jti: "jti-1", sid: "sid-1", sub: "sub-1", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .sign(key);
}

async function rejection(token: string) {
  return verifyLogoutToken(token, { issuer, clientId, jwks, now }).then(
    () => null,
    (error: unknown) => (error instanceof LogoutTokenError ? error.code : error)
  );
}

describe("back-channel logout token validation", () => {
  it("accepts a valid token with sid only", async () => {
    const token = await new SignJWT({ events: event, jti: "jti-2", sid: "sid-only" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setIssuedAt(nowSeconds)
      .sign(signingKey);

    await expect(verifyLogoutToken(token, { issuer, clientId, jwks, now })).resolves.toEqual({
      sub: null,
      sid: "sid-only",
      jti: "jti-2", issuedAt: now
    });
  });

  it("rejects a logout token with a signature from another key", async () => {
    expect(await rejection(await logoutToken({}, otherKey))).toBe("signature");
  });

  it("rejects a logout token with a wrong issuer", async () => {
    expect(await rejection(await logoutToken({ iss: "http://evil.example/vfurst" }))).toBe("issuer");
  });

  it("rejects a logout token with a wrong audience", async () => {
    expect(await rejection(await logoutToken({ aud: "another-client" }))).toBe("audience");
  });

  it("rejects a logout token with an iat older than five minutes", async () => {
    expect(await rejection(await logoutToken({ iat: nowSeconds - 301 }))).toBe("iat");
  });

  it("rejects a logout token with an iat more than a minute ahead", async () => {
    expect(await rejection(await logoutToken({ iat: nowSeconds + 61 }))).toBe("iat");
  });

  it("rejects a logout token with no back-channel logout event", async () => {
    expect(await rejection(await logoutToken({ events: {} }))).toBe("events");
  });

  it("rejects a logout token with neither sub nor sid", async () => {
    expect(await rejection(await logoutToken({ sub: undefined, sid: undefined }))).toBe("subject");
  });

  it("rejects a logout token with a nonce", async () => {
    expect(await rejection(await logoutToken({ nonce: "n-1" }))).toBe("nonce");
  });

  it("rejects a logout token with no jti", async () => {
    expect(await rejection(await logoutToken({ jti: undefined }))).toBe("jti");
  });
  it.each([null, [], "logout", { reason: "ended" }])("rejects an event whose value is not an empty object: %j", async (value) => {
    expect(await rejection(await logoutToken({ events: { "http://schemas.openid.net/event/backchannel-logout": value } }))).toBe("events");
  });
  it("rejects malformed sub even if sid is usable, and fractional iat", async () => {
    expect(await rejection(await logoutToken({ sub: 7 } as unknown as JWTPayload))).toBe("subject");
    expect(await rejection(await logoutToken({ iat: nowSeconds - 0.5 }))).toBe("iat");
  });
});

describe("back-channel logout effect", () => {
  it("revokes only sessions with the sid that belong to the subject", async () => {
    await expect(applyBackchannelLogout({ sub: "sub-1", sid: "sid-1", ...receipt }, now)).resolves.toEqual({
      revokedSessions: 2,
      authVersionBumped: false
    });
    expect(mocks.session.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        oidcSid: "sid-1",
        oidcIssuer: issuer, oidcClientId: clientId,
        revokedAt: null,
        user: { accounts: { some: { provider: "authentik", providerAccountId: "sub-1" } } }
      },
      data: { revokedAt: now, idToken: null }
    });
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it("revokes every session with the sid when the token has no subject", async () => {
    await applyBackchannelLogout({ sub: null, sid: "sid-1", ...receipt }, now);

    expect(mocks.session.updateMany.mock.calls[0]?.[0].where).toEqual({ oidcSid: "sid-1", oidcIssuer: issuer, oidcClientId: clientId, revokedAt: null });
  });

  it("revokes subject sessions through the logout event without revoking a later fresh login", async () => {
    await expect(applyBackchannelLogout({ sub: "sub-1", sid: null, ...receipt }, now)).resolves.toEqual({
      revokedSessions: 2,
      authVersionBumped: false
    });
    expect(mocks.account.findUnique).toHaveBeenCalledWith({
      where: { provider_providerAccountId: { provider: "authentik", providerAccountId: "sub-1" } },
      select: { userId: true }
    });
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", oidcIssuer: issuer, oidcClientId: clientId, revokedAt: null,
        OR: [{ primaryAuthenticatedAt: { lte: now } }, { primaryAuthenticatedAt: null }] }, data: { revokedAt: now, idToken: null }
    });
  });

  it("ignores an unknown subject", async () => {
    mocks.account.findUnique.mockResolvedValue(null);

    await expect(applyBackchannelLogout({ sub: "unknown", sid: null, ...receipt }, now)).resolves.toEqual({
      revokedSessions: 0,
      authVersionBumped: false
    });
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.staffOidcRevocation.upsert).toHaveBeenCalled();
  });
  it("treats an already committed replay as success without repeating revocation", async () => {
    mocks.staffOidcLogoutReceipt.createMany.mockResolvedValue({ count: 0 });
    await expect(applyBackchannelLogout({ sub: "sub-1", sid: null, ...receipt }, now)).resolves.toEqual({ revokedSessions: 0, authVersionBumped: false });
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });
});
