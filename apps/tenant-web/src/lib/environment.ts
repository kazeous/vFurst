import { normalizeHostname } from "@vfurst/tenant-context";

export const TENANT_WEB_ENV_NAMES = {
  rootDomain: "VFURST_TENANT_ROOT_DOMAIN",
  managerUrl: "VFURST_MANAGER_URL",
  consoleUrl: "VFURST_CONSOLE_URL",
  apiUrl: "VFURST_API_URL",
  databaseUrl: "DATABASE_URL",
  redisUrl: "REDIS_URL"
} as const;

export type TenantWebEnvironment = Readonly<{
  rootDomain: string;
  managerUrl: string;
  managerHostname: string;
  consoleUrl: string;
  consoleHostname: string;
  apiUrl: string;
  apiHostname: string;
  databaseUrl: string;
  redisUrl: string;
}>;

export type TenantWebEnvironmentIssue = Readonly<{
  name: (typeof TENANT_WEB_ENV_NAMES)[keyof typeof TENANT_WEB_ENV_NAMES];
  message: string;
}>;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class TenantWebEnvironmentError extends Error {
  readonly issues: readonly TenantWebEnvironmentIssue[];

  constructor(issues: readonly TenantWebEnvironmentIssue[]) {
    super(`Tenant web environment is invalid: ${issues.map((issue) => issue.name).join(", ")}.`);
    this.name = "TenantWebEnvironmentError";
    this.issues = Object.freeze([...issues]);
  }
}

function requiredValue(
  source: EnvironmentSource,
  name: TenantWebEnvironmentIssue["name"],
  issues: TenantWebEnvironmentIssue[]
) {
  const value = source[name]?.trim();
  if (!value) {
    issues.push({ name, message: "Required value is missing." });
    return null;
  }
  return value;
}

function parseServiceUrl(
  value: string | null,
  name: TenantWebEnvironmentIssue["name"],
  issues: TenantWebEnvironmentIssue[]
) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("protocol");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("shape");
    return {
      origin: url.origin,
      hostname: normalizeHostname(url.hostname)
    };
  } catch {
    issues.push({ name, message: "Expected an HTTP(S) origin without credentials, path, query, or fragment." });
    return null;
  }
}

function validateConnectionUrl(
  value: string | null,
  name: TenantWebEnvironmentIssue["name"],
  protocols: readonly string[],
  issues: TenantWebEnvironmentIssue[]
) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) throw new Error("protocol");
    return value;
  } catch {
    issues.push({ name, message: `Expected a ${protocols.join(" or ")} connection URL.` });
    return null;
  }
}

function belongsToRoot(hostname: string, rootDomain: string) {
  return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
}

export function parseTenantWebEnvironment(source: EnvironmentSource): TenantWebEnvironment {
  const issues: TenantWebEnvironmentIssue[] = [];
  const rootInput = requiredValue(source, TENANT_WEB_ENV_NAMES.rootDomain, issues);
  let rootDomain: string | null = null;
  if (rootInput) {
    try {
      rootDomain = normalizeHostname(rootInput);
      if (rootDomain.includes(":")) throw new Error("ipv6-root");
    } catch {
      issues.push({ name: TENANT_WEB_ENV_NAMES.rootDomain, message: "Expected a tenant DNS root hostname." });
    }
  }

  const manager = parseServiceUrl(requiredValue(source, TENANT_WEB_ENV_NAMES.managerUrl, issues), TENANT_WEB_ENV_NAMES.managerUrl, issues);
  const console = parseServiceUrl(requiredValue(source, TENANT_WEB_ENV_NAMES.consoleUrl, issues), TENANT_WEB_ENV_NAMES.consoleUrl, issues);
  const api = parseServiceUrl(requiredValue(source, TENANT_WEB_ENV_NAMES.apiUrl, issues), TENANT_WEB_ENV_NAMES.apiUrl, issues);
  const databaseUrl = validateConnectionUrl(
    requiredValue(source, TENANT_WEB_ENV_NAMES.databaseUrl, issues),
    TENANT_WEB_ENV_NAMES.databaseUrl,
    ["postgres:", "postgresql:"],
    issues
  );
  const redisUrl = validateConnectionUrl(
    requiredValue(source, TENANT_WEB_ENV_NAMES.redisUrl, issues),
    TENANT_WEB_ENV_NAMES.redisUrl,
    ["redis:", "rediss:"],
    issues
  );

  if (rootDomain) {
    for (const entry of [
      [TENANT_WEB_ENV_NAMES.managerUrl, manager],
      [TENANT_WEB_ENV_NAMES.consoleUrl, console],
      [TENANT_WEB_ENV_NAMES.apiUrl, api]
    ] as const) {
      if (entry[1] && !belongsToRoot(entry[1].hostname, rootDomain)) {
        issues.push({ name: entry[0], message: "Hostname must be the tenant root or one of its subdomains." });
      }
    }
  }

  if (manager && console && manager.hostname === console.hostname) {
    issues.push({ name: TENANT_WEB_ENV_NAMES.consoleUrl, message: "Console hostname must differ from manager hostname." });
  }
  if (manager && api && manager.hostname === api.hostname) {
    issues.push({ name: TENANT_WEB_ENV_NAMES.apiUrl, message: "API hostname must differ from manager hostname." });
  }
  if (console && api && console.hostname === api.hostname) {
    issues.push({ name: TENANT_WEB_ENV_NAMES.apiUrl, message: "API hostname must differ from console hostname." });
  }

  if (issues.length > 0 || !rootDomain || !manager || !console || !api || !databaseUrl || !redisUrl) {
    throw new TenantWebEnvironmentError(issues);
  }

  return Object.freeze({
    rootDomain,
    managerUrl: manager.origin,
    managerHostname: manager.hostname,
    consoleUrl: console.origin,
    consoleHostname: console.hostname,
    apiUrl: api.origin,
    apiHostname: api.hostname,
    databaseUrl,
    redisUrl
  });
}

export function getTenantWebEnvironment() {
  return parseTenantWebEnvironment(process.env);
}
