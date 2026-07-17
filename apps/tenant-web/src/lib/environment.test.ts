import { describe, expect, it } from "vitest";
import {
  parseTenantWebEnvironment,
  TENANT_WEB_ENV_NAMES,
  TenantWebEnvironmentError
} from "./environment";

const validEnvironment: Readonly<Record<string, string | undefined>> = {
  VFURST_TENANT_ROOT_DOMAIN: "vfurst.example.com.",
  VFURST_MANAGER_URL: "https://vfurst.example.com/",
  VFURST_CONSOLE_URL: "https://console.vfurst.example.com",
  VFURST_API_URL: "https://api.vfurst.example.com",
  VFURST_AUTH_CLIENT_ID: "tenant-web",
  VFURST_AUTH_TRANSACTION_KEY_BASE64URL: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  VFURST_TENANT_SESSION_SECRET_BASE64URL: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  VFURST_MANAGER_IDENTITY_PUBLIC_KEYS_JSON: JSON.stringify({
    "manager-2026-01": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA000000000000000000000000000000000000000=\n-----END PUBLIC KEY-----"
  }),
  VFURST_IDENTITY_SERVICE_SECRET: "service-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://user:password@database.internal:5432/vfurst?schema=public",
  REDIS_URL: "rediss://:password@redis.internal:6380/0"
};

describe("parseTenantWebEnvironment", () => {
  it("normalizes the six explicit runtime boundaries", () => {
    expect(parseTenantWebEnvironment(validEnvironment)).toEqual({
      rootDomain: "vfurst.example.com",
      managerUrl: "https://vfurst.example.com",
      managerHostname: "vfurst.example.com",
      consoleUrl: "https://console.vfurst.example.com",
      consoleHostname: "console.vfurst.example.com",
      apiUrl: "https://api.vfurst.example.com",
      apiHostname: "api.vfurst.example.com",
      authClientId: "tenant-web",
      authTransactionKeyBase64Url: validEnvironment.VFURST_AUTH_TRANSACTION_KEY_BASE64URL,
      tenantSessionSecretBase64Url: validEnvironment.VFURST_TENANT_SESSION_SECRET_BASE64URL,
      managerIdentityPublicKeys: {
        "manager-2026-01": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA000000000000000000000000000000000000000=\n-----END PUBLIC KEY-----"
      },
      identityServiceSecret: validEnvironment.VFURST_IDENTITY_SERVICE_SECRET,
      databaseUrl: validEnvironment.DATABASE_URL,
      redisUrl: validEnvironment.REDIS_URL
    });
  });

  it("reports every missing variable by name without inventing defaults", () => {
    expect.assertions(2);
    try {
      parseTenantWebEnvironment({});
    } catch (error) {
      expect(error).toBeInstanceOf(TenantWebEnvironmentError);
      expect((error as TenantWebEnvironmentError).issues.map((issue) => issue.name)).toEqual([
        TENANT_WEB_ENV_NAMES.rootDomain,
        TENANT_WEB_ENV_NAMES.managerUrl,
        TENANT_WEB_ENV_NAMES.consoleUrl,
        TENANT_WEB_ENV_NAMES.apiUrl,
        TENANT_WEB_ENV_NAMES.authClientId,
        TENANT_WEB_ENV_NAMES.authTransactionKey,
        TENANT_WEB_ENV_NAMES.tenantSessionSecret,
        TENANT_WEB_ENV_NAMES.managerIdentityPublicKeys,
        TENANT_WEB_ENV_NAMES.identityServiceSecret,
        TENANT_WEB_ENV_NAMES.databaseUrl,
        TENANT_WEB_ENV_NAMES.redisUrl
      ]);
    }
  });

  it.each([
    ["VFURST_TENANT_ROOT_DOMAIN", "https://vfurst.example.com"],
    ["VFURST_MANAGER_URL", "https://user:secret@vfurst.example.com"],
    ["VFURST_CONSOLE_URL", "https://console.vfurst.example.com/dashboard"],
    ["VFURST_API_URL", "ftp://api.vfurst.example.com"],
    ["VFURST_AUTH_CLIENT_ID", "tenant web"],
    ["VFURST_AUTH_TRANSACTION_KEY_BASE64URL", "too-short"],
    ["VFURST_TENANT_SESSION_SECRET_BASE64URL", "also-too-short"],
    ["VFURST_MANAGER_IDENTITY_PUBLIC_KEYS_JSON", "[]"],
    ["VFURST_IDENTITY_SERVICE_SECRET", "short"],
    ["DATABASE_URL", "mysql://database.internal/vfurst"],
    ["REDIS_URL", "http://redis.internal:6379"]
  ])("rejects invalid %s configuration", (name, value) => {
    expect(() => parseTenantWebEnvironment({ ...validEnvironment, [name]: value })).toThrow(TenantWebEnvironmentError);
  });

  it("requires manager, console, and API hosts to remain under the configured root", () => {
    expect(() => parseTenantWebEnvironment({
      ...validEnvironment,
      VFURST_CONSOLE_URL: "https://console.attacker.example"
    })).toThrowError(/VFURST_CONSOLE_URL/);
  });

  it("requires distinct manager, console, and API hostnames", () => {
    expect(() => parseTenantWebEnvironment({
      ...validEnvironment,
      VFURST_API_URL: "https://console.vfurst.example.com:444"
    })).toThrowError(/VFURST_API_URL/);
  });

  it("does not include database or Redis credentials in validation errors", () => {
    const secret = "do-not-leak-this-password";
    expect.assertions(2);
    try {
      parseTenantWebEnvironment({
        ...validEnvironment,
        DATABASE_URL: `mysql://user:${secret}@database.internal/vfurst`,
        REDIS_URL: `http://:${secret}@redis.internal`
      });
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain(secret);
      expect((error as TenantWebEnvironmentError).issues.join(" ")).not.toContain(secret);
    }
  });
});
