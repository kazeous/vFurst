import {
  AuthorizationCodeError,
  AuthorizationCodeService,
  type AuthorizationCodeRecord,
  type AuthorizationCodeStore
} from "@vfurst/auth/authorization-code";
import { createAuthorizationState, createPkceS256Challenge, createPkceVerifier } from "@vfurst/auth/core";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAuthorizationCallback,
  buildManagerLoginRedirect,
  hasValidServiceBearer,
  mapProtocolError,
  parseAuthorizedStart,
  parseIdentitySessionRevocation,
  readBoundedJson
} from "./identity-protocol.js";

const CALLBACK = "https://console.vfurst.example/auth/callback";
const CLIENT_ID = "tenant-web";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

class MemoryCodeStore implements AuthorizationCodeStore {
  readonly records = new Map<string, AuthorizationCodeRecord>();
  readonly consumed = new Set<string>();

  async create(record: AuthorizationCodeRecord) {
    this.records.set(record.codeHash, record);
  }

  async consume(codeHash: string) {
    const record = this.records.get(codeHash);
    if (!record) return { status: "missing" } as const;
    if (this.consumed.has(codeHash)) return { status: "replayed" } as const;
    this.consumed.add(codeHash);
    return {
      status: "consumed",
      record: {
        ...record,
        currentUserAuthVersion: record.authVersion,
        identitySessionRevokedAt: null
      }
    } as const;
  }
}

function authorizationQuery(redirectUri = CALLBACK) {
  const verifier = createPkceVerifier();
  return {
    verifier,
    params: new URLSearchParams({
      audience: "tenant-web",
      clientId: CLIENT_ID,
      redirectUri,
      state: createAuthorizationState(),
      codeChallenge: createPkceS256Challenge(verifier)
    })
  };
}

describe("manager identity protocol", () => {
  it("requires the exact client and callback allowlist entry", () => {
    const { params } = authorizationQuery();
    expect(
      parseAuthorizedStart(params, { authClientId: CLIENT_ID, authCallbackUrls: [CALLBACK] })
    ).toMatchObject({ clientId: CLIENT_ID, redirectUri: CALLBACK });

    const hostile = authorizationQuery("https://attacker.example/auth/callback").params;
    expect(() =>
      parseAuthorizedStart(hostile, { authClientId: CLIENT_ID, authCallbackUrls: [CALLBACK] })
    ).toThrowError(expect.objectContaining({ code: "invalid_redirect_uri" }));

    const lookalike = authorizationQuery(`${CALLBACK}/extra`).params;
    expect(() =>
      parseAuthorizedStart(lookalike, { authClientId: CLIENT_ID, authCallbackUrls: [CALLBACK] })
    ).toThrowError(expect.objectContaining({ code: "invalid_redirect_uri" }));
  });

  it("creates a callback containing only the one-time code and state", () => {
    const callback = buildAuthorizationCallback(`${CALLBACK}?injected=true#fragment`, "code-value", "state-value");
    expect(callback.origin + callback.pathname).toBe(CALLBACK);
    expect([...callback.searchParams.entries()]).toEqual([
      ["code", "code-value"],
      ["state", "state-value"]
    ]);
    expect(callback.hash).toBe("");
  });

  it("always sends unauthenticated users to the configured manager origin", () => {
    const login = buildManagerLoginRedirect(
      "https://manager.vfurst.example",
      "/api/identity/authorize?clientId=tenant-web"
    );
    expect(login.origin).toBe("https://manager.vfurst.example");
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("returnTo")).toBe("/api/identity/authorize?clientId=tenant-web");

    const hostile = buildManagerLoginRedirect("https://manager.vfurst.example", "//attacker.example/path");
    expect(hostile.origin).toBe("https://manager.vfurst.example");
    expect(hostile.searchParams.get("returnTo")).toBe("/api/identity/authorize");
  });

  it("compares strict bearer service credentials", () => {
    const secret = "service-secret-at-least-32-bytes-long";
    expect(hasValidServiceBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(hasValidServiceBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(hasValidServiceBearer(`bearer ${secret}`, secret)).toBe(false);
    expect(hasValidServiceBearer(`Bearer ${secret} `, secret)).toBe(false);
    expect(hasValidServiceBearer(null, secret)).toBe(false);
  });

  it("issues a 90-second code, exchanges it once, and rejects replay", async () => {
    const store = new MemoryCodeStore();
    const { privateKey } = generateKeyPairSync("ed25519");
    const now = new Date("2026-07-17T00:00:00.000Z");
    const service = new AuthorizationCodeService({
      store,
      signing: { privateKey, keyId: "manager-test", ttlSeconds: 60 },
      codeTtlSeconds: 90,
      now: () => now
    });
    const { verifier } = authorizationQuery();
    const issued = await service.issue({
      audience: "tenant-web",
      clientId: CLIENT_ID,
      redirectUri: CALLBACK,
      codeChallenge: createPkceS256Challenge(verifier),
      userId: USER_ID,
      identitySessionId: SESSION_ID,
      identitySessionExpiresAt: Math.floor(now.getTime() / 1_000) + 3_600,
      authVersion: 4
    });

    expect(issued.expiresAt).toBe(Math.floor(now.getTime() / 1_000) + 90);
    const input = {
      audience: "tenant-web" as const,
      clientId: CLIENT_ID,
      redirectUri: CALLBACK,
      code: issued.code,
      codeVerifier: verifier
    };
    await expect(service.exchange(input)).resolves.toMatchObject({
      claims: { sessionId: SESSION_ID, userId: USER_ID, authVersion: 4 }
    });
    await expect(service.exchange(input)).rejects.toMatchObject({ code: "replayed_code" });
  });

  it("accepts a UUID revocation body through the shared contract", () => {
    expect(parseIdentitySessionRevocation({ identitySessionId: SESSION_ID })).toEqual({
      identitySessionId: SESSION_ID
    });
    expect(() => parseIdentitySessionRevocation({ identitySessionId: "not-an-id" })).toThrowError(
      expect.objectContaining({ code: "invalid_request" })
    );
    expect(
      parseIdentitySessionRevocation({ identitySessionId: SESSION_ID, redirectUri: "https://attacker.example" })
    ).toEqual({ identitySessionId: SESSION_ID });
  });

  it("bounds JSON bodies by actual UTF-8 bytes, not only Content-Length", async () => {
    const body = JSON.stringify({ identitySessionId: SESSION_ID });
    await expect(
      readBoundedJson({ headers: new Headers(), text: async () => body }, Buffer.byteLength(body))
    ).resolves.toEqual({ identitySessionId: SESSION_ID });
    await expect(
      readBoundedJson({ headers: new Headers(), text: async () => `${body}padding` }, Buffer.byteLength(body))
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      readBoundedJson(
        { headers: new Headers({ "content-length": "9000" }), text: async () => "{}" },
        8_192
      )
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("maps protocol failures without exposing internal messages", () => {
    const mapped = mapProtocolError(new AuthorizationCodeError("replayed_code", "sensitive database detail"));
    expect(mapped.status).toBe(400);
    expect(mapped.body).toMatchObject({
      error: "replayed_code",
      message: "The identity request could not be completed."
    });
    expect(JSON.stringify(mapped.body)).not.toContain("sensitive");

    const unexpected = mapProtocolError(new Error("database credentials leaked"));
    expect(unexpected.status).toBe(503);
    expect(JSON.stringify(unexpected.body)).not.toContain("database credentials");
  });
});
