import { createHostPolicy, normalizeHostname } from "@vfurst/tenant-context";

const FALLBACK_ROOT_DOMAIN = "vfurst.reyuugames.com";

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
  return hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_ROOT_DOMAIN) || FALLBACK_ROOT_DOMAIN;
}

export function getTenantHostPolicy() {
  const rootDomain = getConfiguredRootDomain();
  const managerHostname =
    hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_MANAGER_URL) ||
    hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_APP_URL) ||
    hostnameFromUrlOrHost(process.env.AUTH_URL) ||
    rootDomain;
  const consoleHostname =
    hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_CONSOLE_URL) || `app.${rootDomain}`;
  const apiHostname = hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_API_URL) || `api.${rootDomain}`;

  return createHostPolicy({
    rootDomain,
    managerHostname,
    consoleHostname,
    apiHostname,
    reservedSubdomains: ["api", "app", "console", "manager", "www"]
  });
}
