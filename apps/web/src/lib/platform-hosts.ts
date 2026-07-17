import { classifyTenantHost, normalizeHostname } from "@vfurst/tenant-context";
import { getConfiguredRootDomain, getTenantHostPolicy } from "./tenant-host-policy";

export { normalizeHostname } from "@vfurst/tenant-context";

function hostnameFromUrlOrHost(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return normalizeHostname(url.hostname);
  } catch {
    return "";
  }
}

export function getRootDomain() {
  return getConfiguredRootDomain();
}

export function getPlatformHostnames() {
  const rootDomain = getRootDomain();
  const hostnames = new Set(["localhost", "127.0.0.1", rootDomain, `app.${rootDomain}`]);

  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL, process.env.VFURST_LAUNCH_URL]) {
    const hostname = hostnameFromUrlOrHost(value);

    if (hostname) {
      hostnames.add(hostname);
    }
  }

  return hostnames;
}

export function isPlatformHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (getPlatformHostnames().has(normalized)) return true;
  return classifyTenantHost(normalized, getTenantHostPolicy()).kind === "platform";
}

export function isPlatformDomain(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const rootDomain = getRootDomain();

  return normalized === rootDomain || normalized.endsWith(`.${rootDomain}`);
}
