import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  PLATFORM_MANAGER_ENV_NAMES,
  parsePlatformManagerEnv,
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
      redisUrl: "REDIS_URL"
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
      redisUrl: undefined
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
        REDIS_URL: "rediss://cache.example:6379"
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
      redisUrl: "rediss://cache.example:6379"
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
    [{ NODE_ENV: "production", AUTH_SECRET: "too-short" }, /at least 32 bytes in production/]
  ])("rejects malformed supplied configuration %#", (input, expected) => {
    expect(() => parsePlatformManagerEnv(input)).toThrow(expected);
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
