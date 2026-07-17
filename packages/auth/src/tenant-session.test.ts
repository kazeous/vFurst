import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_TENANT_SESSION_TTL_SECONDS,
  TENANT_SESSION_AUDIENCE,
  TenantSessionError,
  mintTenantSession,
  verifyTenantSession
} from "./tenant-session.js";

const NOW = new Date("2026-07-17T08:00:00.000Z");
const SECRET = randomBytes(32);
const SESSION_ID = randomUUID();
const USER_ID = randomUUID();

function mint() {
  return mintTenantSession({
    secret: SECRET,
    audience: TENANT_SESSION_AUDIENCE,
    identitySessionId: SESSION_ID,
    userId: USER_ID,
    authVersion: 7,
    ttlSeconds: 3_600,
    now: NOW
  });
}

describe("tenant relying session", () => {
  it("round-trips only the central identity reference and bounded claims", () => {
    const session = mint();
    expect(verifyTenantSession(session.token, {
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      now: new Date(NOW.getTime() + 1_000)
    })).toEqual(session.claims);
    expect(session.claims).toMatchObject({
      issuer: "tenant-web",
      audience: "tenant-web",
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 7
    });
    expect(session.token).not.toContain(SESSION_ID);
    expect(session.token).not.toContain(USER_ID);
  });

  it("rejects payload and signature tampering", () => {
    const { token } = mint();
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    payload.sub = randomUUID();
    parts[1] = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

    expect(() => verifyTenantSession(parts.join("."), {
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      now: NOW
    })).toThrowError(expect.objectContaining({ reason: "invalid_signature" }));

    const validParts = token.split(".");
    validParts[2] = `${validParts[2]!.startsWith("A") ? "B" : "A"}${validParts[2]!.slice(1)}`;
    expect(() => verifyTenantSession(validParts.join("."), {
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      now: NOW
    })).toThrow(TenantSessionError);
  });

  it("rejects expiry and the wrong audience", () => {
    const { token } = mint();
    expect(() => verifyTenantSession(token, {
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      now: new Date(NOW.getTime() + 3_600_000)
    })).toThrowError(expect.objectContaining({ reason: "expired_token" }));
    expect(() => verifyTenantSession(token, {
      secret: SECRET,
      audience: "another-runtime",
      now: NOW
    })).toThrowError(expect.objectContaining({ reason: "invalid_audience" }));
  });

  it("rejects overlong mint lifetimes and forged overlong signed lifetimes", () => {
    expect(() => mintTenantSession({
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 7,
      ttlSeconds: MAX_TENANT_SESSION_TTL_SECONDS + 1,
      now: NOW
    })).toThrow(RangeError);

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "vfurst-tenant-session+jwt" })).toString("base64url");
    const issuedAt = Math.floor(NOW.getTime() / 1_000);
    const payload = Buffer.from(JSON.stringify({
      iss: "tenant-web",
      aud: "tenant-web",
      sid: SESSION_ID,
      sub: USER_ID,
      authVersion: 7,
      iat: issuedAt,
      exp: issuedAt + MAX_TENANT_SESSION_TTL_SECONDS + 1,
      jti: randomUUID()
    })).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`, "ascii").digest("base64url");
    expect(() => verifyTenantSession(`${header}.${payload}.${signature}`, {
      secret: SECRET,
      audience: TENANT_SESSION_AUDIENCE,
      now: NOW
    })).toThrowError(expect.objectContaining({ reason: "invalid_token" }));
  });

  it("requires a high-entropy secret", () => {
    expect(() => mintTenantSession({
      secret: randomBytes(16),
      audience: TENANT_SESSION_AUDIENCE,
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 0,
      now: NOW
    })).toThrow(RangeError);
  });
});
