import { classifyTenantHost } from "@vfurst/tenant-context";
import { describe, expect, it } from "vitest";
import { parseTenantWebEnvironment } from "./environment";
import {
  createTenantWebHostPolicy,
  evaluateTenantWebShellHost,
  TENANT_WEB_RESERVED_SUBDOMAINS
} from "./tenant-host-policy";

const environment = parseTenantWebEnvironment({
  VFURST_TENANT_ROOT_DOMAIN: "vfurst.example.com",
  VFURST_MANAGER_URL: "https://vfurst.example.com",
  VFURST_CONSOLE_URL: "https://console.vfurst.example.com",
  VFURST_API_URL: "https://api.vfurst.example.com",
  VFURST_AUTH_CLIENT_ID: "tenant-web",
  VFURST_AUTH_TRANSACTION_KEY_BASE64URL: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  VFURST_TENANT_SESSION_SECRET_BASE64URL: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  VFURST_MANAGER_IDENTITY_PUBLIC_KEYS_JSON: JSON.stringify({
    "manager-2026-01": "unused-public-key-material-with-enough-characters"
  }),
  VFURST_IDENTITY_SERVICE_SECRET: "service-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://user:password@database.internal/vfurst",
  REDIS_URL: "redis://redis.internal:6379"
});
const policy = createTenantWebHostPolicy(environment);

describe("tenant web host policy adapter", () => {
  it("maps explicit environment hosts and reserves infrastructure labels", () => {
    expect(policy).toMatchObject({
      rootDomain: environment.rootDomain,
      managerHostname: environment.managerHostname,
      consoleHostname: environment.consoleHostname,
      apiHostname: environment.apiHostname,
      reservedSubdomains: [...TENANT_WEB_RESERVED_SUBDOMAINS]
    });
    expect(classifyTenantHost("assets.vfurst.example.com", policy)).toMatchObject({
      kind: "reserved-platform",
      reason: "reserved-subdomain"
    });
  });

  it("allows only the console and API hosts to reach the shell", () => {
    expect(evaluateTenantWebShellHost("console.vfurst.example.com:3001", policy)).toEqual({
      kind: "allow-shell",
      surface: "console",
      hostname: "console.vfurst.example.com"
    });
    expect(evaluateTenantWebShellHost("api.vfurst.example.com", policy)).toEqual({
      kind: "allow-shell",
      surface: "api",
      hostname: "api.vfurst.example.com"
    });
  });

  it("rejects manager, root, reserved, and nested platform hosts as misdirected", () => {
    expect(evaluateTenantWebShellHost("vfurst.example.com", policy)).toMatchObject({
      kind: "reject-misdirected",
      reason: "platform"
    });
    expect(evaluateTenantWebShellHost("www.vfurst.example.com", policy)).toMatchObject({
      kind: "reject-misdirected",
      reason: "reserved"
    });
    expect(evaluateTenantWebShellHost("nested.sample.vfurst.example.com", policy)).toMatchObject({
      kind: "reject-misdirected",
      reason: "reserved"
    });
  });

  it("does not authorize managed or custom candidates before directory integration", () => {
    expect(evaluateTenantWebShellHost("sample-con.vfurst.example.com", policy)).toEqual({
      kind: "tenant-resolution-unavailable",
      hostname: "sample-con.vfurst.example.com",
      candidate: "managed"
    });
    expect(evaluateTenantWebShellHost("events.customer.example", policy)).toEqual({
      kind: "tenant-resolution-unavailable",
      hostname: "events.customer.example",
      candidate: "custom"
    });
  });
});
