import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  AuthorizationCodeError,
  AuthorizationCodeService,
  type AtomicAuthorizationCodeConsumeResult,
  type AuthorizationCodeRecord,
  type AuthorizationCodeStore
} from "./authorization-code.js";
import { createPkceS256Challenge, createPkceVerifier, hashOpaqueToken } from "./core.js";
import {
  IdentityAssertionError,
  verifyIdentityAssertion
} from "./identity-assertion.js";

const USER_ID = "51cc910b-ea6d-4d3c-918a-f62a4a362a45";
const SESSION_ID = "08626eb8-7f74-4d63-998d-2cfe9bf86714";
const REDIRECT_URI = "https://events.example.test/auth/callback";
const CLIENT_ID = "tenant-web-production";
const START_TIME = new Date("2026-07-17T01:00:00.000Z");

class MemoryAuthorizationCodeStore implements AuthorizationCodeStore {
  readonly records = new Map<string, { record: AuthorizationCodeRecord; consumedAt?: number }>();

  async create(record: AuthorizationCodeRecord) {
    if (this.records.has(record.codeHash)) {
      throw new Error("duplicate code hash");
    }
    this.records.set(record.codeHash, { record });
  }

  async consume(codeHash: string, consumedAt: number): Promise<AtomicAuthorizationCodeConsumeResult> {
    const stored = this.records.get(codeHash);

    if (!stored) {
      return { status: "missing" };
    }
    if (stored.consumedAt !== undefined) {
      return { status: "replayed" };
    }

    stored.consumedAt = consumedAt;
    return { status: "consumed", record: stored.record };
  }
}

function expectAuthorizationError(error: unknown, code: AuthorizationCodeError["code"]) {
  expect(error).toBeInstanceOf(AuthorizationCodeError);
  expect((error as AuthorizationCodeError).code).toBe(code);
}

function createFixture() {
  const signingKeys = generateKeyPairSync("ed25519");
  const store = new MemoryAuthorizationCodeStore();
  let now = START_TIME;
  const service = new AuthorizationCodeService({
    store,
    signing: {
      privateKey: signingKeys.privateKey,
      keyId: "manager-2026-07",
      ttlSeconds: 60
    },
    now: () => now
  });

  async function issue(verifier = createPkceVerifier()) {
    const result = await service.issue({
      audience: "tenant-web",
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: createPkceS256Challenge(verifier),
      userId: USER_ID,
      identitySessionId: SESSION_ID,
      identitySessionExpiresAt: Math.floor(START_TIME.getTime() / 1_000) + 3_600,
      authVersion: 7
    });

    return { ...result, verifier };
  }

  function exchange(code: string, verifier: string, overrides = {}) {
    return service.exchange({
      code,
      codeVerifier: verifier,
      redirectUri: REDIRECT_URI,
      audience: "tenant-web",
      clientId: CLIENT_ID,
      currentAuthVersion: 7,
      ...overrides
    });
  }

  return {
    service,
    store,
    publicKey: signingKeys.publicKey,
    issue,
    exchange,
    setNow(value: Date) {
      now = value;
    }
  };
}

describe("authorization code issuance and exchange", () => {
  it("stores only a 32-byte code hash with exact binding and a 90 second lifetime", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const stored = fixture.store.records.get(hashOpaqueToken(issued.code))?.record;

    expect(AUTHORIZATION_CODE_TTL_SECONDS).toBe(90);
    expect(issued.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored).toMatchObject({
      codeHash: hashOpaqueToken(issued.code),
      clientId: CLIENT_ID,
      audience: "tenant-web",
      redirectUri: REDIRECT_URI,
      authVersion: 7
    });
    expect(stored).toBeDefined();
    expect(stored!.expiresAt - stored!.issuedAt).toBe(90);
    expect(JSON.stringify(stored)).not.toContain(issued.code);
  });

  it("atomically exchanges once and returns a server-only signed identity assertion", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const result = await fixture.exchange(issued.code, issued.verifier);
    const claims = verifyIdentityAssertion(result.identityAssertion, {
      audience: "tenant-web",
      publicKeys: new Map([["manager-2026-07", fixture.publicKey]]),
      now: START_TIME
    });

    expect(result).not.toHaveProperty("sessionToken");
    expect(result.identityAssertion).toMatch(/^[A-Za-z0-9_-]+$/);
    const envelope = JSON.parse(
      Buffer.from(result.identityAssertion, "base64url").toString("utf8")
    ) as { protected: string; payload: string };
    const protectedHeader = JSON.parse(
      Buffer.from(envelope.protected, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const signedPayload = JSON.parse(
      Buffer.from(envelope.payload, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    expect(protectedHeader).toMatchObject({
      alg: "EdDSA",
      kid: "manager-2026-07",
      typ: "vfurst-identity-assertion+jws"
    });
    expect(signedPayload).toMatchObject({
      iss: "platform-manager",
      aud: "tenant-web",
      sid: SESSION_ID,
      sub: USER_ID,
      authVersion: 7,
      iat: Math.floor(START_TIME.getTime() / 1_000),
      exp: Math.floor(START_TIME.getTime() / 1_000) + 60
    });
    expect(signedPayload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims).toMatchObject({
      issuer: "platform-manager",
      audience: "tenant-web",
      sessionId: SESSION_ID,
      userId: USER_ID,
      authVersion: 7,
      keyId: "manager-2026-07"
    });
    expect(claims.expiresAt - claims.issuedAt).toBe(60);

    await expect(fixture.exchange(issued.code, issued.verifier)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "replayed_code");
      return true;
    });
  });

  it("allows only one winner under concurrent exchange attempts", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const attempts = await Promise.allSettled([
      fixture.exchange(issued.code, issued.verifier),
      fixture.exchange(issued.code, issued.verifier)
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expectAuthorizationError(rejected && "reason" in rejected ? rejected.reason : undefined, "replayed_code");
  });

  it("rejects an expired code and leaves it consumed", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    fixture.setNow(new Date(START_TIME.getTime() + 90_000));

    await expect(fixture.exchange(issued.code, issued.verifier)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "expired_code");
      return true;
    });
    await expect(fixture.exchange(issued.code, issued.verifier)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "replayed_code");
      return true;
    });
  });

  it.each([
    ["redirect URI", { redirectUri: "https://events.example.test/auth/other" }, "invalid_redirect_uri"],
    ["client id", { clientId: "another-tenant-client" }, "invalid_audience"],
    ["auth version", { currentAuthVersion: 8 }, "session_revoked"]
  ] as const)("rejects a code bound to a different %s", async (_label, overrides, expectedCode) => {
    const fixture = createFixture();
    const issued = await fixture.issue();

    await expect(fixture.exchange(issued.code, issued.verifier, overrides)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, expectedCode);
      return true;
    });
  });

  it("prefers the store's fresh auth version and revocation state over caller input", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const stored = fixture.store.records.get(hashOpaqueToken(issued.code));
    expect(stored).toBeDefined();
    stored!.record = {
      ...stored!.record,
      currentUserAuthVersion: 8,
      identitySessionRevokedAt: null
    };

    await expect(
      fixture.exchange(issued.code, issued.verifier, { currentAuthVersion: 7 })
    ).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "session_revoked");
      return true;
    });
  });

  it("rejects the wrong PKCE verifier and consumes the code", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const wrongVerifier = createPkceVerifier();

    await expect(fixture.exchange(issued.code, wrongVerifier)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "invalid_code_verifier");
      return true;
    });
    await expect(fixture.exchange(issued.code, issued.verifier)).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "replayed_code");
      return true;
    });
  });

  it("rejects an unexpected audience before exchanging the code", async () => {
    const fixture = createFixture();
    const issued = await fixture.issue();

    await expect(
      fixture.exchange(issued.code, issued.verifier, { audience: "platform-manager" })
    ).rejects.toSatisfy((error) => {
      expectAuthorizationError(error, "invalid_audience");
      return true;
    });

    await expect(fixture.exchange(issued.code, issued.verifier)).resolves.toBeDefined();
  });

  it("enforces the authorization-code TTL range", () => {
    const store = new MemoryAuthorizationCodeStore();
    const { privateKey } = generateKeyPairSync("ed25519");
    const options = {
      store,
      signing: { privateKey, keyId: "manager-key" }
    };

    expect(() => new AuthorizationCodeService({ ...options, codeTtlSeconds: 59 })).toThrow(RangeError);
    expect(() => new AuthorizationCodeService({ ...options, codeTtlSeconds: 121 })).toThrow(RangeError);
    expect(() => new AuthorizationCodeService({ ...options, codeTtlSeconds: 60 })).not.toThrow();
    expect(() => new AuthorizationCodeService({ ...options, codeTtlSeconds: 120 })).not.toThrow();
  });
});

describe("identity assertion verification", () => {
  async function createAssertion() {
    const fixture = createFixture();
    const issued = await fixture.issue();
    const result = await fixture.exchange(issued.code, issued.verifier);
    return { fixture, token: result.identityAssertion };
  }

  it("rejects expiry and an audience mismatch", async () => {
    const { fixture, token } = await createAssertion();
    const keys = new Map<string, KeyObject>([["manager-2026-07", fixture.publicKey]]);

    expect(() =>
      verifyIdentityAssertion(token, {
        audience: "tenant-web-canary",
        publicKeys: keys,
        now: START_TIME
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_audience" }));

    expect(() =>
      verifyIdentityAssertion(token, {
        audience: "tenant-web",
        publicKeys: keys,
        now: new Date(START_TIME.getTime() + 60_000)
      })
    ).toThrowError(expect.objectContaining({ reason: "expired_token" }));
  });

  it("rejects an unknown key and a signature made by another manager key", async () => {
    const { token } = await createAssertion();
    const otherKeys = generateKeyPairSync("ed25519");

    expect(() =>
      verifyIdentityAssertion(token, {
        audience: "tenant-web",
        publicKeys: new Map(),
        now: START_TIME
      })
    ).toThrowError(expect.objectContaining({ reason: "unknown_key" }));

    expect(() =>
      verifyIdentityAssertion(token, {
        audience: "tenant-web",
        publicKeys: new Map([["manager-2026-07", otherKeys.publicKey]]),
        now: START_TIME
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_signature" }));
  });

  it("rejects a tampered signed payload", async () => {
    const { fixture, token } = await createAssertion();
    const envelope = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      protected: string;
      payload: string;
      signature: string;
    };
    const payload = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")) as {
      sub: string;
    };
    payload.sub = "2dd0e56b-4a7d-44d5-9f62-f3058245bdaa";
    envelope.payload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const tampered = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");

    expect(() =>
      verifyIdentityAssertion(tampered, {
        audience: "tenant-web",
        publicKeys: new Map([["manager-2026-07", fixture.publicKey]]),
        now: START_TIME
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_signature" }));
  });

  it("does not accept a symmetric key for assertion verification", async () => {
    const { token } = await createAssertion();

    expect(() =>
      verifyIdentityAssertion(token, {
        audience: "tenant-web",
        publicKeys: new Map([["manager-2026-07", Buffer.alloc(32, 1)]]),
        now: START_TIME
      })
    ).toThrow();
    expect(IdentityAssertionError).toBeDefined();
  });
});
