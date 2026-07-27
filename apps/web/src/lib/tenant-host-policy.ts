import { createHostPolicy, normalizeHostname } from "@vfurst/tenant-context";

export const CANONICAL_ROOT_DOMAIN = "vfurst.reyuugames.com";
export const RESERVED_PLATFORM_SUBDOMAINS = ["api", "app", "console", "manager", "www"] as const;

export function isReservedPlatformSubdomain(value: string) {
  return (RESERVED_PLATFORM_SUBDOMAINS as readonly string[]).includes(value.trim().toLowerCase());
}

function hostnameFromUrlOrHost(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return normalizeHostname(url.hostname);
  } catch {
    return "";
  }
}

export function getConfiguredRootDomain() {
  return hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_ROOT_DOMAIN) || CANONICAL_ROOT_DOMAIN;
}

function createConfiguredHostPolicy(rootDomain: string, useEnvironment: boolean) {
  const managerHostname =
    (useEnvironment && hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_MANAGER_URL)) ||
    (useEnvironment && hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_APP_URL)) ||
    (useEnvironment && hostnameFromUrlOrHost(process.env.AUTH_URL)) ||
    rootDomain;
  const consoleHostname =
    (useEnvironment && hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_CONSOLE_URL)) || `app.${rootDomain}`;
  const apiHostname =
    (useEnvironment && hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_API_URL)) || `api.${rootDomain}`;

  return createHostPolicy({
    rootDomain,
    managerHostname,
    consoleHostname,
    apiHostname,
    reservedSubdomains: RESERVED_PLATFORM_SUBDOMAINS
  });
}

export function getTenantHostPolicy() {
  return createConfiguredHostPolicy(getConfiguredRootDomain(), true);
}

export function getCanonicalTenantHostPolicy() {
  return createConfiguredHostPolicy(CANONICAL_ROOT_DOMAIN, false);
}
