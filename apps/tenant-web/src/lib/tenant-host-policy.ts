import { classifyTenantHost, createHostPolicy, type HostPolicy } from "@vfurst/tenant-context";
import type { TenantWebEnvironment } from "./environment";

export const TENANT_WEB_RESERVED_SUBDOMAINS = Object.freeze([
  "admin",
  "app",
  "assets",
  "auth",
  "cdn",
  "docs",
  "monitoring",
  "platform",
  "status",
  "www"
]);

export type TenantWebShellHostDecision =
  | Readonly<{ kind: "allow-shell"; surface: "console" | "api"; hostname: string }>
  | Readonly<{ kind: "allow-tenant-candidate"; hostname: string; candidate: "managed" | "custom" }>
  | Readonly<{ kind: "reject-misdirected"; hostname: string; reason: "platform" | "reserved" }>;

export function createTenantWebHostPolicy(environment: TenantWebEnvironment): HostPolicy {
  return createHostPolicy({
    rootDomain: environment.rootDomain,
    managerHostname: environment.managerHostname,
    consoleHostname: environment.consoleHostname,
    apiHostname: environment.apiHostname,
    reservedSubdomains: TENANT_WEB_RESERVED_SUBDOMAINS
  });
}

/** Middleware classifies only. Tenant candidates still need the Node/Prisma
 * resolution boundary before any route may trust an organization identity. */
export function evaluateTenantWebShellHost(host: string, policy: HostPolicy): TenantWebShellHostDecision {
  const classification = classifyTenantHost(host, policy);
  if (classification.kind === "platform") {
    if (classification.roles.includes("console")) {
      return Object.freeze({ kind: "allow-shell", surface: "console", hostname: classification.hostname });
    }
    if (classification.roles.includes("api")) {
      return Object.freeze({ kind: "allow-shell", surface: "api", hostname: classification.hostname });
    }
    return Object.freeze({ kind: "reject-misdirected", hostname: classification.hostname, reason: "platform" });
  }
  if (classification.kind === "reserved-platform") {
    return Object.freeze({ kind: "reject-misdirected", hostname: classification.hostname, reason: "reserved" });
  }
  return Object.freeze({
    kind: "allow-tenant-candidate",
    hostname: classification.hostname,
    candidate: classification.kind === "managed-subdomain" ? "managed" : "custom"
  });
}
