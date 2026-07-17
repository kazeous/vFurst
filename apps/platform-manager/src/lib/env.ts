import { createPrivateKey } from "node:crypto";

export const PLATFORM_MANAGER_ENV_NAMES = Object.freeze({
  managerUrl: "NEXT_PUBLIC_PLATFORM_MANAGER_URL",
  rootDomain: "NEXT_PUBLIC_ROOT_DOMAIN",
  authUrl: "AUTH_URL",
  authSecret: "AUTH_SECRET",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  authClientId: "VFURST_AUTH_CLIENT_ID",
  authCallbackUrls: "VFURST_AUTH_CALLBACK_URLS",
  identityServiceSecret: "VFURST_IDENTITY_SERVICE_SECRET",
  identityPrivateKeyBase64: "VFURST_MANAGER_IDENTITY_PRIVATE_KEY_BASE64",
  identityKeyId: "VFURST_MANAGER_IDENTITY_KEY_ID",
  databaseUrl: "DATABASE_URL",
  redisUrl: "REDIS_URL"
} as const);

const LOCAL_MANAGER_URL = "http://localhost:3000";
const LOCAL_TENANT_CALLBACK = "http://localhost:3001/auth/callback";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export type PlatformManagerEnvironment = Readonly<{
  managerUrl: string;
  rootDomain: string;
  authUrl: string;
  authSecret: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  authClientId: string;
  authCallbackUrls: readonly string[];
  identityServiceSecret: string | undefined;
  identityPrivateKey: string | undefined;
  identityKeyId: string;
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
}>;

export type IdentityProtocolEnvironment = PlatformManagerEnvironment &
  Readonly<{
    authSecret: string;
    identityServiceSecret: string;
    identityPrivateKey: string;
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

  if (!["http:", "https:"].includes(url.protocol)) {
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

function parseCallbackUrl(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} entries must be absolute callback URLs.`);
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1");

  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} entries must use HTTPS except on localhost.`);
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(`${name} entries cannot contain credentials, query, or fragment.`);
  }

  return url.toString();
}

function parseCallbackUrls(value: string | undefined) {
  const source = optionalValue(value) ?? LOCAL_TENANT_CALLBACK;
  const callbacks = source
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => parseCallbackUrl(candidate, PLATFORM_MANAGER_ENV_NAMES.authCallbackUrls));

  if (callbacks.length === 0 || callbacks.length > 16 || new Set(callbacks).size !== callbacks.length) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authCallbackUrls} must contain 1 to 16 unique callback URLs.`);
  }

  return Object.freeze(callbacks);
}

function parsePrivateKey(value: string | undefined) {
  const encoded = optionalValue(value);
  if (!encoded) return undefined;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    if (!decoded.includes("BEGIN PRIVATE KEY") || !decoded.includes("END PRIVATE KEY")) {
      throw new Error("not a PKCS8 PEM key");
    }
    return decoded;
  } catch {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.identityPrivateKeyBase64} must be a base64-encoded PKCS8 PEM key.`);
  }
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
  const authClientId = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.authClientId]) ?? "tenant-web";
  const identityKeyId = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.identityKeyId]) ?? "manager-local";
  const googleClientId = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.googleClientId]);
  const googleClientSecret = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.googleClientSecret]);
  const authSecret = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.authSecret]);
  const identityServiceSecret = optionalValue(input[PLATFORM_MANAGER_ENV_NAMES.identityServiceSecret]);

  if (authUrl !== managerUrl) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authUrl} must match the platform-manager origin.`);
  }
  if (!CLIENT_ID_PATTERN.test(authClientId)) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authClientId} contains unsupported characters.`);
  }
  if (!KEY_ID_PATTERN.test(identityKeyId)) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.identityKeyId} contains unsupported characters.`);
  }
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must either both be set or both be omitted.");
  }
  if (identityServiceSecret && Buffer.byteLength(identityServiceSecret, "utf8") < 32) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.identityServiceSecret} must be at least 32 bytes.`);
  }
  if (input.NODE_ENV === "production" && authSecret && Buffer.byteLength(authSecret, "utf8") < 32) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authSecret} must be at least 32 bytes in production.`);
  }

  return Object.freeze({
    managerUrl,
    rootDomain,
    authUrl,
    authSecret,
    googleClientId,
    googleClientSecret,
    authClientId,
    authCallbackUrls: parseCallbackUrls(input[PLATFORM_MANAGER_ENV_NAMES.authCallbackUrls]),
    identityServiceSecret,
    identityPrivateKey: parsePrivateKey(input[PLATFORM_MANAGER_ENV_NAMES.identityPrivateKeyBase64]),
    identityKeyId,
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

export function requireIdentityProtocolEnv(input: EnvironmentInput = process.env): IdentityProtocolEnvironment {
  const env = parsePlatformManagerEnv(input);
  const missing = [
    !env.authSecret && PLATFORM_MANAGER_ENV_NAMES.authSecret,
    !env.identityServiceSecret && PLATFORM_MANAGER_ENV_NAMES.identityServiceSecret,
    !env.identityPrivateKey && PLATFORM_MANAGER_ENV_NAMES.identityPrivateKeyBase64
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Identity protocol configuration is incomplete: ${missing.join(", ")}.`);
  }
  if (Buffer.byteLength(env.authSecret ?? "", "utf8") < 32) {
    throw new Error(`${PLATFORM_MANAGER_ENV_NAMES.authSecret} must be at least 32 bytes.`);
  }
  if (env.authSecret === env.identityServiceSecret) {
    throw new Error("AUTH_SECRET and VFURST_IDENTITY_SERVICE_SECRET must be separate credentials.");
  }
  try {
    const key = createPrivateKey(env.identityPrivateKey ?? "");
    if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
      throw new Error("wrong key type");
    }
  } catch {
    throw new Error(
      `${PLATFORM_MANAGER_ENV_NAMES.identityPrivateKeyBase64} must contain an Ed25519 PKCS8 private key.`
    );
  }

  return env as IdentityProtocolEnvironment;
}

export function getPlatformManagerEnv() {
  return parsePlatformManagerEnv(process.env);
}
