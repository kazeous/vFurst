import { InvalidTenantHostError } from "./errors.js";

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const hostPolicyBrand: unique symbol = Symbol("HostPolicy");

export type PlatformHostRole = "root" | "manager" | "console" | "api";

export type HostPolicyInput = Readonly<{
  rootDomain: string;
  managerHostname: string;
  consoleHostname: string;
  apiHostname: string;
  reservedSubdomains?: readonly string[];
}>;

export type HostPolicy = Readonly<{
  rootDomain: string;
  managerHostname: string;
  consoleHostname: string;
  apiHostname: string;
  reservedSubdomains: readonly string[];
  [hostPolicyBrand]: true;
}>;

export type TenantHostClassification =
  | Readonly<{ kind: "platform"; hostname: string; roles: readonly PlatformHostRole[] }>
  | Readonly<{ kind: "managed-subdomain"; hostname: string; subdomain: string }>
  | Readonly<{ kind: "custom-domain"; hostname: string }>
  | Readonly<{
      kind: "reserved-platform";
      hostname: string;
      reason: "reserved-subdomain" | "nested-platform-subdomain";
    }>;

function invalidHost(input: string, message?: string): never {
  throw new InvalidTenantHostError(input, message);
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function validateNormalizedHostname(hostname: string, input: string) {
  if (!hostname || hostname.length > 253) {
    invalidHost(input, "The hostname must contain between 1 and 253 characters.");
  }

  if (hostname.includes(":")) {
    return;
  }

  const labels = hostname.split(".");
  if (labels.some((label) => !DNS_LABEL.test(label))) {
    invalidHost(input, "The hostname contains an invalid DNS label.");
  }
}

/**
 * Canonicalizes a Host header value without consulting process environment.
 * DNS names are lower-cased and IDNs are converted by the URL parser. IPv6
 * literals may be bracketed with a port or supplied unbracketed without one.
 */
export function normalizeHostname(input: string) {
  const value = input.trim();
  if (!value) {
    invalidHost(input);
  }
  if (value.includes("/") || value.includes("?") || value.includes("#") || value.includes("@")) {
    invalidHost(input, "Expected a hostname or Host header value, not a URL.");
  }
  if (Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  })) {
    invalidHost(input, "The hostname contains a control character.");
  }

  let parsed: URL;
  try {
    const colonCount = (value.match(/:/g) ?? []).length;
    if (colonCount > 1 && !value.startsWith("[")) {
      parsed = new URL(`http://[${value}]`);
    } else {
      parsed = new URL(`http://${value}`);
    }
  } catch {
    invalidHost(input);
  }

  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    invalidHost(input);
  }
  if (parsed.port && (!/^\d+$/.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535)) {
    invalidHost(input, "The hostname contains an invalid port.");
  }

  const hostname = stripIpv6Brackets(parsed.hostname).toLowerCase().replace(/\.+$/, "");
  validateNormalizedHostname(hostname, input);
  return hostname;
}

function normalizeSubdomain(input: string) {
  const normalized = input.trim().toLowerCase();
  if (!DNS_LABEL.test(normalized)) {
    invalidHost(input, "Reserved subdomains must be a single valid DNS label.");
  }
  return normalized;
}

export function createHostPolicy(input: HostPolicyInput): HostPolicy {
  const rootDomain = normalizeHostname(input.rootDomain);
  if (rootDomain.includes(":")) {
    invalidHost(input.rootDomain, "The tenant root domain cannot be an IPv6 literal.");
  }

  const reservedSubdomains = [...new Set((input.reservedSubdomains ?? []).map(normalizeSubdomain))].sort();
  return Object.freeze({
    rootDomain,
    managerHostname: normalizeHostname(input.managerHostname),
    consoleHostname: normalizeHostname(input.consoleHostname),
    apiHostname: normalizeHostname(input.apiHostname),
    reservedSubdomains: Object.freeze(reservedSubdomains),
    [hostPolicyBrand]: true as const
  });
}

export function classifyTenantHost(input: string, policy: HostPolicy): TenantHostClassification {
  const hostname = normalizeHostname(input);
  const roles: PlatformHostRole[] = [];
  if (hostname === policy.rootDomain) roles.push("root");
  if (hostname === policy.managerHostname) roles.push("manager");
  if (hostname === policy.consoleHostname) roles.push("console");
  if (hostname === policy.apiHostname) roles.push("api");

  if (roles.length > 0) {
    return Object.freeze({ kind: "platform", hostname, roles: Object.freeze(roles) });
  }

  const platformSuffix = `.${policy.rootDomain}`;
  if (hostname.endsWith(platformSuffix)) {
    const subdomain = hostname.slice(0, -platformSuffix.length);
    if (subdomain.includes(".")) {
      return Object.freeze({ kind: "reserved-platform", hostname, reason: "nested-platform-subdomain" });
    }
    if (policy.reservedSubdomains.includes(subdomain)) {
      return Object.freeze({ kind: "reserved-platform", hostname, reason: "reserved-subdomain" });
    }
    return Object.freeze({ kind: "managed-subdomain", hostname, subdomain });
  }

  return Object.freeze({ kind: "custom-domain", hostname });
}
