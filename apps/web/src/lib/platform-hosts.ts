import { classifyTenantHost, normalizeHostname } from "@vfurst/tenant-context";
import {
  getCanonicalTenantHostPolicy,
  getConfiguredRootDomain,
  getTenantHostPolicy
} from "./tenant-host-policy";

export { normalizeHostname } from "@vfurst/tenant-context";

export function getRootDomain() {
  return getConfiguredRootDomain();
}

export function isPlatformHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (normalized === "127.0.0.1") return true;

  return [getTenantHostPolicy(), getCanonicalTenantHostPolicy()].some((policy) => {
    const classification = classifyTenantHost(normalized, policy);
    return classification.kind === "platform" || classification.kind === "reserved-platform";
  });
}

export function isPlatformDomain(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const rootDomain = getRootDomain();

  return normalized === rootDomain || normalized.endsWith(`.${rootDomain}`);
}
