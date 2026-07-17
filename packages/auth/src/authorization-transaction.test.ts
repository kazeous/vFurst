import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_TRANSACTION_TTL_SECONDS,
  AuthorizationTransactionError,
  consumeAuthorizationTransaction,
  startAuthorizationTransaction
} from "./authorization-transaction.js";
import { AUTH_COOKIE_NAMES, createPkceS256Challenge } from "./core.js";

const NOW = new Date("2026-07-17T04:00:00.000Z");
const REDIRECT_URI = "https://acme.example.test/auth/callback";

describe("host-only authorization transaction", () => {
  it("encrypts PKCE and return state in a host-only HttpOnly cookie", () => {
    const encryptionKey = randomBytes(32);
    const started = startAuthorizationTransaction({
      encryptionKey,
      redirectUri: REDIRECT_URI,
      returnTo: "/dashboard/events?filter=active",
      now: NOW
    });
    const consumed = consumeAuthorizationTransaction({
      encryptionKey,
      cookieValue: started.cookie.value,
      state: started.authorization.state,
      now: NOW
    });

    expect(started.cookie.name).toBe(AUTH_COOKIE_NAMES.tenantTransaction);
    expect(started.cookie.options).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: 300
    });
    expect("domain" in started.cookie.options).toBe(false);
    expect(started.cookie.value).not.toContain(consumed.codeVerifier);
    expect(started.cookie.value).not.toContain(consumed.returnTo);
    expect(consumed.redirectUri).toBe(REDIRECT_URI);
    expect(consumed.returnTo).toBe("/dashboard/events?filter=active");
    expect(createPkceS256Challenge(consumed.codeVerifier)).toBe(
      started.authorization.codeChallenge
    );
    expect(consumed.expiresAt - consumed.issuedAt).toBe(AUTHORIZATION_TRANSACTION_TTL_SECONDS);
  });

  it("falls back to a local return path without accepting absolute navigation", () => {
    const encryptionKey = randomBytes(32);
    const started = startAuthorizationTransaction({
      encryptionKey,
      redirectUri: REDIRECT_URI,
      returnTo: "https://attacker.example/after-login",
      now: NOW
    });
    const consumed = consumeAuthorizationTransaction({
      encryptionKey,
      cookieValue: started.cookie.value,
      state: started.authorization.state,
      now: NOW
    });

    expect(started.authorization.redirectUri).toBe(REDIRECT_URI);
    expect(consumed.returnTo).toBe("/dashboard");
  });

  it("rejects state mismatch, tampering, expiry, and the wrong encryption key", () => {
    const encryptionKey = randomBytes(32);
    const started = startAuthorizationTransaction({
      encryptionKey,
      redirectUri: REDIRECT_URI,
      now: NOW
    });

    expect(() =>
      consumeAuthorizationTransaction({
        encryptionKey,
        cookieValue: started.cookie.value,
        state: "x".repeat(43),
        now: NOW
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_state" }));

    const parts = started.cookie.value.split(".");
    parts[2] = `${parts[2]?.startsWith("A") ? "B" : "A"}${parts[2]?.slice(1)}`;
    expect(() =>
      consumeAuthorizationTransaction({
        encryptionKey,
        cookieValue: parts.join("."),
        state: started.authorization.state,
        now: NOW
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_transaction" }));

    expect(() =>
      consumeAuthorizationTransaction({
        encryptionKey,
        cookieValue: started.cookie.value,
        state: started.authorization.state,
        now: new Date(NOW.getTime() + AUTHORIZATION_TRANSACTION_TTL_SECONDS * 1_000)
      })
    ).toThrowError(expect.objectContaining({ reason: "expired_transaction" }));

    expect(() =>
      consumeAuthorizationTransaction({
        encryptionKey: randomBytes(32),
        cookieValue: started.cookie.value,
        state: started.authorization.state,
        now: NOW
      })
    ).toThrowError(expect.objectContaining({ reason: "invalid_transaction" }));
  });

  it("requires an AES-256 key", () => {
    expect(() =>
      startAuthorizationTransaction({
        encryptionKey: randomBytes(31),
        redirectUri: REDIRECT_URI,
        now: NOW
      })
    ).toThrow(RangeError);
    expect(AuthorizationTransactionError).toBeDefined();
  });
});
