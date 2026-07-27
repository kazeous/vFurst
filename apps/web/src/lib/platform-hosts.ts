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

function isPrivateIpv4(hostname: string) {
  if (!/^\d{1,3}(?:[.]\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function developmentMachineHostnames() {
  return [process.env.COMPUTERNAME, process.env.HOSTNAME]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => {
      try {
        const normalized = normalizeHostname(value);
        return normalized.includes(".") ? [normalized, normalized.split(".")[0]!] : [normalized];
      } catch {
        return [];
      }
    });
}

export function isDevelopmentPlatformHostname(hostname: string) {
  if (process.env.NODE_ENV === "production") return false;
  const normalized = normalizeHostname(hostname);

  return (
    ["::1", "0.0.0.0", "127.0.0.1"].includes(normalized) ||
    isPrivateIpv4(normalized) ||
    developmentMachineHostnames().includes(normalized)
  );
}

export function isPlatformHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (isDevelopmentPlatformHostname(normalized)) return true;

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
