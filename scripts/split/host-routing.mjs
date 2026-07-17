import process from "node:process";

const DEFAULT_ROOT_DOMAIN = "vfurst.reyuugames.com";

function commaSeparated(value, fallback = []) {
  const source = value == null || value.trim() === "" ? fallback : value.split(",");
  return Array.from(new Set(source.map(normalizeHostname).filter(Boolean)));
}

function positivePort(name, value, fallback, { allowZero = false } = {}) {
  const normalized = String(value ?? fallback).trim();
  const port = Number(normalized);
  const minimum = allowZero ? 0 : 1;

  if (!Number.isSafeInteger(port) || port < minimum || port > 65_535) {
    throw new Error(`${name} must be an integer between ${minimum} and 65535.`);
  }

  return port;
}

export function normalizeHostname(value) {
  const candidate = String(value ?? "").trim().toLowerCase();

  if (!candidate) {
    return "";
  }

  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    return closingBracket > 0 ? candidate.slice(1, closingBracket) : "";
  }

  return candidate.split(":", 1)[0]?.replace(/\.$/, "") ?? "";
}

function assertNoOverlap(leftName, left, rightName, right) {
  const overlap = left.filter((hostname) => right.includes(hostname));

  if (overlap.length > 0) {
    throw new Error(`${leftName} and ${rightName} overlap: ${overlap.join(", ")}.`);
  }
}

export function readSplitHostConfig(environment = process.env) {
  const primaryRoot = normalizeHostname(environment.NEXT_PUBLIC_ROOT_DOMAIN) || DEFAULT_ROOT_DOMAIN;
  const managedRootDomains = commaSeparated(environment.VFURST_SPLIT_MANAGED_ROOT_DOMAINS, [
    "localhost",
    primaryRoot
  ]);
  const managerHosts = commaSeparated(environment.VFURST_SPLIT_MANAGER_HOSTS, [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "manager.localhost",
    primaryRoot,
    `app.${primaryRoot}`,
    `manager.${primaryRoot}`
  ]);
  const tenantHosts = commaSeparated(environment.VFURST_SPLIT_TENANT_HOSTS, [
    "console.localhost",
    `console.${primaryRoot}`
  ]);
  const customTenantHosts = commaSeparated(environment.VFURST_SPLIT_CUSTOM_TENANT_HOSTS);

  assertNoOverlap("VFURST_SPLIT_MANAGER_HOSTS", managerHosts, "VFURST_SPLIT_TENANT_HOSTS", tenantHosts);
  assertNoOverlap(
    "VFURST_SPLIT_MANAGER_HOSTS",
    managerHosts,
    "VFURST_SPLIT_CUSTOM_TENANT_HOSTS",
    customTenantHosts
  );

  return {
    bindHost: environment.VFURST_SPLIT_BIND_HOST?.trim() || "127.0.0.1",
    proxyPort: positivePort("VFURST_SPLIT_PROXY_PORT", environment.VFURST_SPLIT_PROXY_PORT, 3100),
    managerPort: positivePort("VFURST_SPLIT_MANAGER_PORT", environment.VFURST_SPLIT_MANAGER_PORT, 3000),
    tenantPort: positivePort("VFURST_SPLIT_TENANT_PORT", environment.VFURST_SPLIT_TENANT_PORT, 3001),
    managerHosts,
    tenantHosts,
    managedRootDomains,
    customTenantHosts
  };
}

export function classifySplitHostname(hostHeader, config) {
  const hostname = normalizeHostname(hostHeader);

  if (!hostname) {
    return null;
  }

  if (config.managerHosts.includes(hostname) || config.managedRootDomains.includes(hostname)) {
    return "platform-manager";
  }

  if (config.tenantHosts.includes(hostname) || config.customTenantHosts.includes(hostname)) {
    return "tenant-web";
  }

  if (config.managedRootDomains.some((root) => hostname.endsWith(`.${root}`))) {
    return "tenant-web";
  }

  return null;
}

export function splitTargetForHost(hostHeader, config) {
  const runtime = classifySplitHostname(hostHeader, config);

  if (runtime === "platform-manager") {
    return { runtime, hostname: config.bindHost, port: config.managerPort };
  }

  if (runtime === "tenant-web") {
    return { runtime, hostname: config.bindHost, port: config.tenantPort };
  }

  return null;
}
