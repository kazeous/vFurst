import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import {
  AUTH_COOKIE_NAMES,
  TENANT_SESSION_AUDIENCE,
  mintTenantSession,
  signIdentityAssertion,
  verifyTenantSession
} from "@vfurst/auth";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  beginTenantAuthorization,
  completeTenantAuthorization,
  logoutTenantSession
} from "./auth-handoff";
import type { TenantWebEnvironment } from "./environment";

const NOW = new Date("2026-07-17T10:00:00.000Z");
const SESSION_ID = randomUUID();
const USER_ID = randomUUID();
const KEY_ID = "manager-2026-01";
const keyPair = generateKeyPairSync("ed25519");
const transactionKey = randomBytes(32).toString("base64url");
const tenantSecret = randomBytes(32).toString("base64url");

const environment: TenantWebEnvironment = Object.freeze({
  rootDomain: "vfurst.example.com",
  managerUrl: "https://manager.vfurst.example.com",
  managerHostname: "manager.vfurst.example.com",
  consoleUrl: "https://console.vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiUrl: "https://api.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  authClientId: "tenant-web",
  authTransactionKeyBase64Url: transactionKey,
  tenantSessionSecretBase64Url: tenantSecret,
  managerIdentityPublicKeys: Object.freeze({
    [KEY_ID]: keyPair.publicKey.export({ type: "spki", format: "pem" }).toString()
  }),
  identityServiceSecret: "service-secret-with-at-least-32-characters",
  databaseUrl: "postgresql://database.internal/vfurst",
  redisUrl: "redis://redis.internal:6379"
});

function begin(returnTo = "/dashboard/events?view=active") {
  return beginTenantAuthorization(
    new NextRequest(`https://console.vfurst.example.com/auth/start?returnTo=${encodeURIComponent(returnTo)}`, {
      headers: { host: "console.vfurst.example.com" }
    }),
    environment,
    NOW
  );
}

function createExchangeAssertion(now = NOW) {
  return signIdentityAssertion({
    audience: "tenant-web",
    sessionId: SESSION_ID,
    userId: USER_ID,
    authVersion: 4
  }, {
    privateKey: keyPair.privateKey,
    keyId: KEY_ID,
    now,
    ttlSeconds: 60
  }).token;
}

describe("tenant browser authorization handoff", () => {
  it("starts only on the console host with an encrypted host-only PKCE transaction", () => {
    const response = begin();
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://manager.vfurst.example.com/api/identity/authorize");
    expect(Object.fromEntries(location.searchParams)).toEqual({
      audience: "tenant-web",
      clientId: "tenant-web",
      redirectUri: "https://console.vfurst.example.com/auth/callback",
      state: expect.any(String),
      codeChallenge: expect.any(String)
    });
    expect(location.search).not.toContain("codeVerifier");
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE_NAMES.tenantTransaction}=`);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(response.headers.get("set-cookie")).not.toMatch(/Domain=/i);

    const wrongHost = beginTenantAuthorization(
      new NextRequest("https://tenant.vfurst.example.com/auth/start", {
        headers: { host: "tenant.vfurst.example.com" }
      }),
      environment,
      NOW
    );
    expect(wrongHost.status).toBe(421);
  });

  it("exchanges server-side, mints a tenant cookie, and never leaks the assertion", async () => {
    const startResponse = begin();
    const authorizeUrl = new URL(startResponse.headers.get("location")!);
    const transactionCookie = startResponse.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)!.value;
    const assertion = createExchangeAssertion();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      tokenType: "vfurst_identity_assertion",
      identityAssertion: assertion
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const code = randomBytes(32).toString("base64url");
    const callback = new NextRequest(
      `https://console.vfurst.example.com/auth/callback?code=${code}&state=${authorizeUrl.searchParams.get("state")}`,
      {
        headers: {
          host: "console.vfurst.example.com",
          cookie: `${AUTH_COOKIE_NAMES.tenantTransaction}=${transactionCookie}`
        }
      }
    );

    const response = await completeTenantAuthorization(callback, environment, {
      fetch: fetchMock,
      now: NOW
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://console.vfurst.example.com/dashboard/events?view=active");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, exchangeInit] = fetchMock.mock.calls[0]!;
    expect(exchangeInit?.headers).toMatchObject({
      authorization: `Bearer ${environment.identityServiceSecret}`,
      "content-type": "application/json"
    });
    expect(JSON.parse(String(exchangeInit?.body))).toMatchObject({
      audience: "tenant-web",
      clientId: "tenant-web",
      code,
      redirectUri: "https://console.vfurst.example.com/auth/callback",
      codeVerifier: expect.any(String)
    });
    const sessionToken = response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)!.value;
    expect(verifyTenantSession(sessionToken, {
      secret: Buffer.from(tenantSecret, "base64url"),
      audience: TENANT_SESSION_AUDIENCE,
      now: NOW
    })).toMatchObject({
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 4
    });

    const browserVisible = `${response.headers.get("location")}\n${response.headers.get("set-cookie")}\n${await response.text()}`;
    expect(browserVisible).not.toContain(assertion);
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)?.value).toBe("");
  });

  it("validates a manager assertion against a fresh post-exchange clock", async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const startResponse = begin();
      const authorizeUrl = new URL(startResponse.headers.get("location")!);
      const transactionCookie = startResponse.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)!.value;
      const callback = new NextRequest(
        `https://console.vfurst.example.com/auth/callback?code=${randomBytes(32).toString("base64url")}&state=${authorizeUrl.searchParams.get("state")}`,
        {
          headers: {
            host: "console.vfurst.example.com",
            cookie: `${AUTH_COOKIE_NAMES.tenantTransaction}=${transactionCookie}`
          }
        }
      );
      const response = await completeTenantAuthorization(callback, environment, {
        fetch: vi.fn<typeof fetch>().mockImplementation(async () => {
          const issuedAt = new Date(NOW.getTime() + 1_500);
          vi.setSystemTime(issuedAt);
          return new Response(JSON.stringify({
            tokenType: "vfurst_identity_assertion",
            identityAssertion: createExchangeAssertion(issuedAt)
          }), { status: 200, headers: { "content-type": "application/json" } });
        })
      });

      expect(response.status).toBe(303);
      expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)?.value).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the transaction and refuses exchange when state is wrong", async () => {
    const startResponse = begin("//attacker.example");
    const transactionCookie = startResponse.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)!.value;
    const fetchMock = vi.fn<typeof fetch>();
    const callback = new NextRequest(
      `https://console.vfurst.example.com/auth/callback?code=${randomBytes(32).toString("base64url")}&state=${randomBytes(32).toString("base64url")}`,
      {
        headers: {
          host: "console.vfurst.example.com",
          cookie: `${AUTH_COOKIE_NAMES.tenantTransaction}=${transactionCookie}`
        }
      }
    );

    const response = await completeTenantAuthorization(callback, environment, {
      fetch: fetchMock,
      now: NOW
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)?.value).toBe("");
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects expired assertions without emitting them", async () => {
    const startResponse = begin();
    const authorizeUrl = new URL(startResponse.headers.get("location")!);
    const transactionCookie = startResponse.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)!.value;
    const assertion = createExchangeAssertion(new Date(NOW.getTime() - 120_000));
    const callback = new NextRequest(
      `https://console.vfurst.example.com/auth/callback?code=${randomBytes(32).toString("base64url")}&state=${authorizeUrl.searchParams.get("state")}`,
      {
        headers: {
          host: "console.vfurst.example.com",
          cookie: `${AUTH_COOKIE_NAMES.tenantTransaction}=${transactionCookie}`
        }
      }
    );
    const response = await completeTenantAuthorization(callback, environment, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        tokenType: "vfurst_identity_assertion",
        identityAssertion: assertion
      }), { status: 200, headers: { "content-type": "application/json" } })),
      now: NOW
    });

    expect(response.status).toBe(400);
    expect(`${response.headers.get("set-cookie")} ${await response.text()}`).not.toContain(assertion);
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)).toBeUndefined();
  });

  it("revokes a verified central session best-effort and always clears locally", async () => {
    const session = mintTenantSession({
      secret: Buffer.from(tenantSecret, "base64url"),
      audience: TENANT_SESSION_AUDIENCE,
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 4,
      now: NOW
    });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("manager unavailable"));
    const request = new NextRequest("https://console.vfurst.example.com/auth/logout", {
      method: "POST",
      headers: {
        host: "console.vfurst.example.com",
        cookie: `${AUTH_COOKIE_NAMES.tenantSession}=${session.token}`
      }
    });

    const response = await logoutTenantSession(request, environment, {
      fetch: fetchMock,
      now: NOW
    });
    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      identitySessionId: SESSION_ID
    });
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)?.value).toBe("");
  });

  it("does not send revocation from a non-console host and still clears locally", async () => {
    const session = mintTenantSession({
      secret: Buffer.from(tenantSecret, "base64url"),
      audience: TENANT_SESSION_AUDIENCE,
      identitySessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 4,
      now: NOW
    });
    const fetchMock = vi.fn<typeof fetch>();
    const response = await logoutTenantSession(new NextRequest(
      "https://event.vfurst.example.com/auth/logout",
      {
        method: "POST",
        headers: {
          host: "event.vfurst.example.com",
          cookie: `${AUTH_COOKIE_NAMES.tenantSession}=${session.token}`
        }
      }
    ), environment, { fetch: fetchMock, now: NOW });

    expect(response.status).toBe(421);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)?.value).toBe("");
  });
});
