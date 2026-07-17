export const PLATFORM_MANAGER_ENV_NAMES = Object.freeze({
  managerUrl: "NEXT_PUBLIC_PLATFORM_MANAGER_URL",
  rootDomain: "NEXT_PUBLIC_ROOT_DOMAIN",
  authUrl: "AUTH_URL",
  authSecret: "AUTH_SECRET",
  databaseUrl: "DATABASE_URL",
  redisUrl: "REDIS_URL"
} as const);

const LOCAL_MANAGER_URL = "http://localhost:3000";

export type PlatformManagerEnvironment = Readonly<{
  managerUrl: string;
  rootDomain: string;
  authUrl: string;
  authSecret: string | undefined;
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
}>;

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

function optionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function parsePublicOrigin(value: string, name: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${name} must be an origin without credentials, path, query, or fragment.`);
  }

  return url.origin;
}

function parseRootDomain(value: string, name: string) {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");

  if (
    !normalized ||
    normalized.length > 253 ||
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes(":") ||
    (normalized !== "localhost" &&
      !normalized.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
  ) {
    throw new Error(`${name} must be a hostname without a scheme, port, or path.`);
  }

  return normalized;
}

function parseConnectionUrl(value: string | undefined, name: string, allowedProtocols: readonly string[]) {
  const candidate = optionalValue(value);

  if (!candidate) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${name} must be a valid connection URL.`);
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(`${name} uses an unsupported protocol.`);
  }

  return candidate;
}

export function parsePlatformManagerEnv(input: EnvironmentInput = process.env): PlatformManagerEnvironment {
  const managerUrl = parsePublicOrigin(
    optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.managerUrl]) ?? LOCAL_MANAGER_URL,
    PLATFORM_MANAGER_ENV_NAMES.managerUrl
  );
  const rootDomain = parseRootDomain(
    optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.rootDomain]) ?? new URL(managerUrl).hostname,
    PLATFORM_MANAGER_ENV_NAMES.rootDomain
  );
  const authUrl = parsePublicOrigin(
    optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.authUrl]) ?? managerUrl,
    PLATFORM_MANAGER_ENV_NAMES.authUrl
  );

  if (authUrl !== managerUrl) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authUrl} must match the platform-manager origin.`);
  }

  return Object.freeze({
    managerUrl,
    rootDomain,
    authUrl,
    authSecret: optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.authSecret]),
    databaseUrl: parseConnectionUrl(input[PLATFORM_MANAGER_ENV_NAMES.databaseUrl], PLATFORM_MANAGER_ENV_NAMES.databaseUrl, [
      "postgres:",
      "postgresql:"
    ]),
    redisUrl: parseConnectionUrl(input[PLATFORM_MANAGER_ENV_NAMES.redisUrl], PLATFORM_MANAGER_ENV_NAMES.redisUrl, [
      "redis:",
      "rediss:"
    ])
  });
}

export function getPlatformManagerEnv() {
  return parsePlatformManagerEnv(process.env);
}
