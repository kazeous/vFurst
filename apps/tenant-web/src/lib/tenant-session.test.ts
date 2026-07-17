import { randomBytes, randomUUID } from "node:crypto";
import {
  TENANT_SESSION_AUDIENCE,
  mintTenantSession
} from "@vfurst/auth";
import { describe, expect, it, vi } from "vitest";
import type { TenantWebEnvironment } from "./environment";
import {
  resolveTenantIdentity,
  type CentralIdentitySessionRecord
} from "./tenant-session";

const NOW = new Date("2026-07-17T10:00:00.000Z");
const SESSION_ID = randomUUID();
const USER_ID = randomUUID();
const tenantSecret = randomBytes(32).toString("base64url");
const environment: TenantWebEnvironment = {
  rootDomain: "vfurst.example.com",
  managerUrl: "https://manager.vfurst.example.com",
  managerHostname: "manager.vfurst.example.com",
  consoleUrl: "https://console.vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiUrl: "https://api.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  authClientId: "tenant-web",
  authTransactionKeyBase64Url: randomBytes(32).toString("base64url"),
  tenantSessionSecretBase64Url: tenantSecret,
  managerIdentityPublicKeys: { "manager-2026-01": "unused-public-key-material-with-enough-characters" },
  identityServiceSecret: "service-secret-with-at-least-32-characters",
  databaseUrl: "postgresql://database.internal/vfurst",
  redisUrl: "redis://redis.internal:6379"
};

const validRecord: CentralIdentitySessionRecord = {
  id: SESSION_ID,
  userId: USER_ID,
  authVersion: 9,
  revokedAt: null,
  expires: new Date(NOW.getTime() + 60 * 60 * 1_000),
  user: { id: USER_ID, authVersion: 9 }
};

function token() {
  return mintTenantSession({
    secret: Buffer.from(tenantSecret, "base64url"),
    audience: TENANT_SESSION_AUDIENCE,
    identitySessionId: SESSION_ID,
    userId: USER_ID,
    authVersion: 9,
    now: NOW
  }).token;
}

describe("fresh tenant identity lookup", () => {
  it("returns identity only after a fresh central session and user authVersion check", async () => {
    const lookup = vi.fn().mockResolvedValue(validRecord);
    await expect(resolveTenantIdentity(token(), environment, lookup, NOW)).resolves.toEqual({
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 9,
      expiresAt: validRecord.expires
    });
    expect(lookup).toHaveBeenCalledWith(SESSION_ID);

    await resolveTenantIdentity(token(), environment, lookup, NOW);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["revoked", { revokedAt: new Date(NOW.getTime() - 1) }],
    ["expired", { expires: NOW }],
    ["session authVersion", { authVersion: 10 }],
    ["user authVersion", { user: { id: USER_ID, authVersion: 10 } }],
    ["session user", { userId: randomUUID() }],
    ["related user", { user: { id: randomUUID(), authVersion: 9 } }]
  ])("rejects a %s central record", async (_label, override) => {
    const lookup = vi.fn().mockResolvedValue({ ...validRecord, ...override });
    await expect(resolveTenantIdentity(token(), environment, lookup, NOW)).resolves.toBeNull();
  });

  it("does not query the database for a tampered local cookie", async () => {
    const value = token();
    const tampered = `${value.slice(0, -2)}aa`;
    const lookup = vi.fn();
    await expect(resolveTenantIdentity(tampered, environment, lookup, NOW)).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
