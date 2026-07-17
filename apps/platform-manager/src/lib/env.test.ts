import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  PLATFORM_MANAGER_ENV_NAMES,
  parsePlatformManagerEnv,
  requireManagerRateLimitRuntimeEnv,
  requireIdentityProtocolEnv
} from "./env.js";

describe("platform-manager environment", () => {
  it("documents the runtime-specific environment names", () => {
    expect(PLATFORM_MANAGER_ENV_NAMES).toEqual({
      managerUrl: "NEXT_PUBLIC_PLATFORM_MANAGER_URL",
      rootDomain: "NEXT_PUBLIC_ROOT_DOMAIN",
      authUrl: "AUTH_URL",
      authSecret: "AUTH_SECRET",
      googleClientId: "GOOGLE_CLIENT_ID",
      googleClientSecret: "GOOGLE_CLIENT_SECRET",
      authClientId: "VFURST_AUTH_CLIENT_ID",
      authCallbackUrls: "VFURST_AUTH_CALLBACK_URLS",
      identityServiceSecret: "VFURST_IDENTITY_SERVICE_SECRET",
      identityPrivateKeyBase64: "VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64",
      identityKeyId: "VFURST_MANAGER_IDENTITY_KEY_ID",
      databaseUrl: "DATABASE_URL",
      redisUrl: "REDIS_URL",
      trustedClientIpHeader: "VFURST_TRUSTED_CLIENT_IP_HEADER",
      rateLimitPrefix: "VFURST_MANAGER_RATE_LIMIT_PREFIX",
      credentialAccountRateLimitPerMinute: "VFURST_MANAGER_CREDENTIAL_ACCOUNT_RATE_LIMIT_PER_MINUTE",
      credentialIpRateLimitPerMinute: "VFURST_MANAGER_CREDENTIAL_IP_RATE_LIMIT_PER_MINUTE",
      authorizeRateLimitPerMinute: "VFURST_MANAGER_AUTHORIZE_RATE_LIMIT_PER_MINUTE",
      exchangeRateLimitPerMinute: "VFURST_MANAGER_EXCHANGE_RATE_LIMIT_PER_MINUTE",
      revokeRateLimitPerMinute: "VFURST_MANAGER_REVOKE_RATE_LIMIT_PER_MINUTE"
    });
  });

  it("uses build-safe local defaults without production credentials", () => {
    expect(parsePlatformManagerEnv({})).toEqual({
      managerUrl: "http://localhost:3000",
      rootDomain: "localhost",
      authUrl: "http://localhost:3000",
      authSecret: undefined,
      googleClientId: undefined,
      googleClientSecret: undefined,
      authClientId: "tenant-web",
      authCallbackUrls: ["http://localhost:3001/auth/callback"],
      identityServiceSecret: undefined,
      identityPrivateKey: undefined,
      identityKeyId: "manager-local",
      databaseUrl: undefined,
      redisUrl: undefined,
      trustedClientIpHeader: undefined,
      rateLimitPrefix: "vfurst:manager:rate-limit",
      credentialAccountRateLimitPerMinute: 10,
      credentialIpRateLimitPerMinute: 50,
      authorizeRateLimitPerMinute: 60,
      exchangeRateLimitPerMinute: 600,
      revokeRateLimitPerMinute: 600
    });
  });

  it("normalizes a complete deployment configuration", () => {
    expect(
      parsePlatformManagerEnv({
        NEXT_PUBLIC_PLATFORM_MANAGER_URL: "https://vfurst.example/",
        NEXT_PUBLIC_ROOT_DOMAIN: "VFUrst.Example.",
        AUTH_URL: "https://vfurst.example",
        AUTH_SECRET: " manager-secret-at-least-32-bytes-long ",
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        VFURST_AUTH_CLIENT_ID: "tenant-console",
        VFURST_AUTH_CALLBACK_URLS:
          "https://console.vfurst.example/auth/callback, https://customer.example/sso/callback",
        VFURST_IDENTITY_SERVICE_SECRET: "service-secret-at-least-32-bytes-long",
        VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64: Buffer.from(
          "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----"
        ).toString("base64"),
        VFURST_MANAGER_IDENTITY_KEY_ID: "manager-2026-01",
        DATABASE_URL: "postgresql://manager:secret@db.example:5432/vfurst",
        REDIS_URL: "rediss://cache.example:6379",
        VFURST_TRUSTED_CLIENT_IP_HEADER: "X-Real-IP",
        VFURST_MANAGER_RATE_LIMIT_PREFIX: "vfurst:manager:test",
        VFURST_MANAGER_CREDENTIAL_ACCOUNT_RATE_LIMIT_PER_MINUTE: "8",
        VFURST_MANAGER_CREDENTIAL_IP_RATE_LIMIT_PER_MINUTE: "30",
        VFURST_MANAGER_AUTHORIZE_RATE_LIMIT_PER_MINUTE: "40",
        VFURST_MANAGER_EXCHANGE_RATE_LIMIT_PER_MINUTE: "500",
        VFURST_MANAGER_REVOKE_RATE_LIMIT_PER_MINUTE: "450"
      })
    ).toEqual({
      managerUrl: "https://vfurst.example",
      rootDomain: "vfurst.example",
      authUrl: "https://vfurst.example",
      authSecret: "manager-secret-at-least-32-bytes-long",
      googleClientId: "google-id",
      googleClientSecret: "google-secret",
      authClientId: "tenant-console",
      authCallbackUrls: [
        "https://console.vfurst.example/auth/callback",
        "https://customer.example/sso/callback"
      ],
      identityServiceSecret: "service-secret-at-least-32-bytes-long",
      identityPrivateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
      identityKeyId: "manager-2026-01",
      databaseUrl: "postgresql://manager:secret@db.example:5432/vfurst",
      redisUrl: "rediss://cache.example:6379",
      trustedClientIpHeader: "x-real-ip",
      rateLimitPrefix: "vfurst:manager:test",
      credentialAccountRateLimitPerMinute: 8,
      credentialIpRateLimitPerMinute: 30,
      authorizeRateLimitPerMinute: 40,
      exchangeRateLimitPerMinute: 500,
      revokeRateLimitPerMinute: 450
    });
  });

  it.each([
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "vfurst.example" }, /absolute HTTP\(S\) URL/],
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "ftp://vfurst.example" }, /HTTP or HTTPS/],
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "https://vfurst.example/path" }, /must be an origin/],
    [{ NEXT_PUBLIC_ROOT_DOMAIN: "https://vfurst.example" }, /must be a hostname/],
    [{ AUTH_URL: "https://auth.example" }, /must match the platform-manager origin/],
    [{ DATABASE_URL: "mysql://db.example/vfurst" }, /unsupported protocol/],
    [{ REDIS_URL: "http://cache.example" }, /unsupported protocol/],
    [{ VFURST_AUTH_CALLBACK_URLS: "https://console.example/callback?next=evil" }, /cannot contain/],
    [
      { VFURST_AUTH_CALLBACK_URLS: "https://console.example/callback,https://console.example/callback" },
      /unique/
    ],
    [{ GOOGLE_CLIENT_ID: "id" }, /must either both be set/],
    [{ VFURST_IDENTITY_SERVICE_SECRET: "too-short" }, /at least 32 bytes/],
    [{ VFURST_TRUSTED_CLIENT_IP_HEADER: "x-client-ip" }, /supported ingress-provided/],
    [{ VFURST_MANAGER_RATE_LIMIT_PREFIX: "invalid prefix" }, /unsupported characters/],
    [{ VFURST_MANAGER_CREDENTIAL_ACCOUNT_RATE_LIMIT_PER_MINUTE: "0" }, /integer between/],
    [{ VFURST_MANAGER_EXCHANGE_RATE_LIMIT_PER_MINUTE: "1.5" }, /integer between/],
    [{ NODE_ENV: "production", AUTH_SECRET: "too-short" }, /at least 32 bytes in production/]
  ])("rejects malformed supplied configuration %#", (input, expected) => {
    expect(() => parsePlatformManagerEnv(input)).toThrow(expected);
  });

  it("requires an explicitly trusted ingress IP header in production", () => {
    expect(parsePlatformManagerEnv({ NODE_ENV: "production" }).trustedClientIpHeader).toBeUndefined();
    expect(() =>
      requireManagerRateLimitRuntimeEnv({
        NODE_ENV: "production",
        AUTH_SECRET: "manager-auth-secret-at-least-32-bytes"
      })
    ).toThrow(/VFURST_TRUSTED_CLIENT_IP_HEADER is required in production/);

    expect(
      requireManagerRateLimitRuntimeEnv({
        NODE_ENV: "production",
        AUTH_SECRET: "manager-auth-secret-at-least-32-bytes",
        VFURST_TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip"
      }).trustedClientIpHeader
    ).toBe("cf-connecting-ip");
  });

  it("requires complete, sufficiently strong identity protocol secrets at request time", () => {
    expect(() => requireIdentityProtocolEnv({})).toThrow(/configuration is incomplete/);
    expect(() =>
      requireIdentityProtocolEnv({
        AUTH_SECRET: "short",
        VFURST_IDENTITY_SERVICE_SECRET: "service-secret-at-least-32-bytes-long",
        VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64: Buffer.from(
          "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----"
        ).toString("base64")
      })
    ).toThrow(/AUTH_SECRET must be at least 32 bytes/);

    const { privateKey } = generateKeyPairSync("ed25519");
    const privateKeyBase64 = Buffer.from(
      privateKey.export({ format: "pem", type: "pkcs8" })
    ).toString("base64");
    expect(
      requireIdentityProtocolEnv({
        AUTH_SECRET: "manager-auth-secret-at-least-32-bytes",
        VFURST_IDENTITY_SERVICE_SECRET: "service-auth-secret-at-least-32-bytes",
        VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64: privateKeyBase64
      })
    ).toMatchObject({
      authClientId: "tenant-web",
      identityKeyId: "manager-local"
    });
    expect(() =>
      requireIdentityProtocolEnv({
        AUTH_SECRET: "same-secret-at-least-32-bytes-long",
        VFURST_IDENTITY_SERVICE_SECRET: "same-secret-at-least-32-bytes-long",
        VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64: privateKeyBase64
      })
    ).toThrow(/must be separate credentials/);
  });
});
