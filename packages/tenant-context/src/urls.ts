import { InvalidTenantHostError, ReservedTenantHostError } from "./errors.js";
import { classifyTenantHost, normalizeHostname, type HostPolicy } from "./host.js";
import type { TenantContext, TenantRoutingAddress } from "./types.js";

export type UrlProtocol = "http" | "https";

function formatHostnameForUrl(hostname: string) {
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

export function normalizeApplicationPath(input = "/") {
  const value = input.trim();
  if (!value) return "/";
  if (value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    throw new Error("Application paths must remain on the selected host.");
  }
  if (Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  })) {
    throw new Error("Application paths cannot contain control characters.");
  }

  const localPath = value.startsWith("/") ? value : `/${value}`;
  const parsed = new URL(localPath, "https://path.invalid");
  if (parsed.origin !== "https://path.invalid") {
    throw new Error("Application paths must remain on the selected host.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildOrigin(hostname: string, protocol: UrlProtocol = "https") {
  const normalized = normalizeHostname(hostname);
  return `${protocol}://${formatHostnameForUrl(normalized)}`;
}

export function buildHostUrl(hostname: string, pathname = "/", protocol: UrlProtocol = "https") {
  return new URL(normalizeApplicationPath(pathname), `${buildOrigin(hostname, protocol)}/`).toString();
}

export function getCanonicalTenantHostname(address: TenantRoutingAddress, policy: HostPolicy) {
  if (address.customDomain) {
    const customHostname = normalizeHostname(address.customDomain);
    const classification = classifyTenantHost(customHostname, policy);
    if (classification.kind === "reserved-platform") {
      throw new ReservedTenantHostError(customHostname, classification.reason);
    }
    if (classification.kind !== "custom-domain") {
      throw new InvalidTenantHostError(customHostname, "An assigned custom domain cannot be a platform hostname.");
    }
    return customHostname;
  }

  const subdomain = normalizeHostname(address.subdomain);
  if (subdomain.includes(".")) {
    throw new InvalidTenantHostError(address.subdomain, "A managed tenant subdomain must be a single DNS label.");
  }
  const hostname = `${subdomain}.${policy.rootDomain}`;
  const classification = classifyTenantHost(hostname, policy);
  if (classification.kind === "reserved-platform") {
    throw new ReservedTenantHostError(hostname, classification.reason);
  }
  if (classification.kind !== "managed-subdomain" || classification.subdomain !== subdomain) {
    throw new InvalidTenantHostError(address.subdomain, "The subdomain is reserved by the platform.");
  }
  return hostname;
}

export function buildTenantUrl(
  address: TenantRoutingAddress,
  policy: HostPolicy,
  pathname = "/",
  protocol: UrlProtocol = "https"
) {
  return buildHostUrl(getCanonicalTenantHostname(address, policy), pathname, protocol);
}

export function buildTenantContextUrl(context: TenantContext, pathname = "/", protocol: UrlProtocol = "https") {
  return buildHostUrl(context.hostname, pathname, protocol);
}

export function buildManagerUrl(policy: HostPolicy, pathname = "/", protocol: UrlProtocol = "https") {
  return buildHostUrl(policy.managerHostname, pathname, protocol);
}

export function buildConsoleUrl(policy: HostPolicy, pathname = "/", protocol: UrlProtocol = "https") {
  return buildHostUrl(policy.consoleHostname, pathname, protocol);
}

export function buildApiUrl(policy: HostPolicy, pathname = "/", protocol: UrlProtocol = "https") {
  return buildHostUrl(policy.apiHostname, pathname, protocol);
}
