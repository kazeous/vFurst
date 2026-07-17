import {
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

export const TENANT_SESSION_ISSUER = "tenant-web" as const;
export const TENANT_SESSION_AUDIENCE = "tenant-web" as const;
export const TENANT_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MIN_TENANT_SESSION_TTL_SECONDS = 60;
export const MAX_TENANT_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const MIN_TENANT_SESSION_SECRET_BYTES = 32;
export const MAX_TENANT_SESSION_SECRET_BYTES = 128;
export const MAX_TENANT_SESSION_TOKEN_BYTES = 4_096;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TenantSessionHeader = Readonly<{
  alg: "HS256";
  typ: "vfurst-tenant-session+jwt";
}>;

type TenantSessionPayload = Readonly<{
  iss: typeof TENANT_SESSION_ISSUER;
  aud: string;
  sid: string;
  sub: string;
  authVersion: number;
  iat: number;
  exp: number;
  jti: string;
}>;

export type TenantSessionClaims = Readonly<{
  issuer: typeof TENANT_SESSION_ISSUER;
  audience: string;
  identitySessionId: string;
  userId: string;
  authVersion: number;
  issuedAt: number;
  expiresAt: number;
  jti: string;
}>;

export type MintTenantSessionInput = Readonly<{
  secret: Uint8Array;
  audience: string;
  identitySessionId: string;
  userId: string;
  authVersion: number;
  ttlSeconds?: number;
  now?: Date;
  jti?: string;
}>;

export type VerifyTenantSessionOptions = Readonly<{
  secret: Uint8Array;
  audience: string;
  now?: Date;
  clockSkewSeconds?: number;
}>;

export type TenantSessionErrorReason =
  | "invalid_token"
  | "invalid_signature"
  | "invalid_issuer"
  | "invalid_audience"
  | "expired_token"
  | "token_not_yet_valid";

export class TenantSessionError extends Error {
  readonly reason: TenantSessionErrorReason;

  constructor(reason: TenantSessionErrorReason, message: string) {
    super(message);
    this.name = "TenantSessionError";
    this.reason = reason;
  }
}

function epochSeconds(date: Date) {
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Tenant session time must be a valid date.");
  }
  return Math.floor(milliseconds / 1_000);
}

function requireSecret(secret: Uint8Array) {
  if (
    secret.byteLength < MIN_TENANT_SESSION_SECRET_BYTES ||
    secret.byteLength > MAX_TENANT_SESSION_SECRET_BYTES
  ) {
    throw new RangeError(
      `Tenant session secret must contain ${MIN_TENANT_SESSION_SECRET_BYTES} to ${MAX_TENANT_SESSION_SECRET_BYTES} bytes.`
    );
  }
  return Buffer.from(secret);
}

function requireTtl(ttlSeconds: number) {
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_TENANT_SESSION_TTL_SECONDS ||
    ttlSeconds > MAX_TENANT_SESSION_TTL_SECONDS
  ) {
    throw new RangeError(
      `Tenant session TTL must be an integer between ${MIN_TENANT_SESSION_TTL_SECONDS} and ${MAX_TENANT_SESSION_TTL_SECONDS} seconds.`
    );
  }
}

function requireAudience(audience: string) {
  if (audience !== TENANT_SESSION_AUDIENCE) {
    throw new TypeError(`Tenant session audience must be ${TENANT_SESSION_AUDIENCE}.`);
  }
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new TenantSessionError("invalid_token", "Tenant session contains invalid base64url data.");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new TenantSessionError("invalid_token", "Tenant session contains invalid JSON.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHeader(value: unknown): TenantSessionHeader {
  if (
    !isObject(value) ||
    value.alg !== "HS256" ||
    value.typ !== "vfurst-tenant-session+jwt"
  ) {
    throw new TenantSessionError("invalid_token", "Tenant session header is invalid.");
  }
  return { alg: "HS256", typ: "vfurst-tenant-session+jwt" };
}

function parsePayload(value: unknown): TenantSessionPayload {
  if (
    !isObject(value) ||
    value.iss !== TENANT_SESSION_ISSUER ||
    typeof value.aud !== "string" ||
    typeof value.sid !== "string" ||
    !UUID_PATTERN.test(value.sid) ||
    typeof value.sub !== "string" ||
    !UUID_PATTERN.test(value.sub) ||
    typeof value.authVersion !== "number" ||
    !Number.isSafeInteger(value.authVersion) ||
    value.authVersion < 0 ||
    typeof value.iat !== "number" ||
    !Number.isSafeInteger(value.iat) ||
    value.iat < 0 ||
    typeof value.exp !== "number" ||
    !Number.isSafeInteger(value.exp) ||
    value.exp <= 0 ||
    typeof value.jti !== "string" ||
    !UUID_PATTERN.test(value.jti)
  ) {
    throw new TenantSessionError("invalid_token", "Tenant session claims are invalid.");
  }
  if (
    value.exp <= value.iat ||
    value.exp - value.iat > MAX_TENANT_SESSION_TTL_SECONDS
  ) {
    throw new TenantSessionError("invalid_token", "Tenant session lifetime is invalid.");
  }
  return {
    iss: TENANT_SESSION_ISSUER,
    aud: value.aud,
    sid: value.sid,
    sub: value.sub,
    authVersion: value.authVersion,
    iat: value.iat,
    exp: value.exp,
    jti: value.jti
  };
}

function toClaims(payload: TenantSessionPayload): TenantSessionClaims {
  return {
    issuer: payload.iss,
    audience: payload.aud,
    identitySessionId: payload.sid,
    userId: payload.sub,
    authVersion: payload.authVersion,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    jti: payload.jti
  };
}

export function mintTenantSession(input: MintTenantSessionInput) {
  requireAudience(input.audience);
  requireTtl(input.ttlSeconds ?? TENANT_SESSION_TTL_SECONDS);
  const issuedAt = epochSeconds(input.now ?? new Date());
  const expiresAt = issuedAt + (input.ttlSeconds ?? TENANT_SESSION_TTL_SECONDS);
  const jti = input.jti ?? randomUUID();

  if (
    !UUID_PATTERN.test(input.identitySessionId) ||
    !UUID_PATTERN.test(input.userId) ||
    !Number.isSafeInteger(input.authVersion) ||
    input.authVersion < 0 ||
    !UUID_PATTERN.test(jti)
  ) {
    throw new TypeError("Tenant session identity claims are invalid.");
  }

  const header: TenantSessionHeader = {
    alg: "HS256",
    typ: "vfurst-tenant-session+jwt"
  };
  const payload: TenantSessionPayload = {
    iss: TENANT_SESSION_ISSUER,
    aud: input.audience,
    sid: input.identitySessionId,
    sub: input.userId,
    authVersion: input.authVersion,
    iat: issuedAt,
    exp: expiresAt,
    jti
  };
  const protectedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signingInput = `${protectedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", requireSecret(input.secret))
    .update(signingInput, "ascii")
    .digest("base64url");
  const token = `${signingInput}.${signature}`;

  if (Buffer.byteLength(token, "utf8") > MAX_TENANT_SESSION_TOKEN_BYTES) {
    throw new Error("Generated tenant session exceeds the size limit.");
  }

  return { token, claims: toClaims(payload) } as const;
}

export function verifyTenantSession(
  token: string,
  options: VerifyTenantSessionOptions
): TenantSessionClaims {
  if (
    token.length === 0 ||
    Buffer.byteLength(token, "utf8") > MAX_TENANT_SESSION_TOKEN_BYTES
  ) {
    throw new TenantSessionError("invalid_token", "Tenant session has an invalid size.");
  }
  const [protectedHeader, encodedPayload, signature, extra] = token.split(".");
  if (
    extra !== undefined ||
    !protectedHeader ||
    !encodedPayload ||
    !signature ||
    !BASE64URL_PATTERN.test(signature)
  ) {
    throw new TenantSessionError("invalid_token", "Tenant session is malformed.");
  }

  parseHeader(decodeJson(protectedHeader));
  const signingInput = `${protectedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", requireSecret(options.secret))
    .update(signingInput, "ascii")
    .digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.toString("base64url") !== signature ||
    supplied.byteLength !== expected.byteLength ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new TenantSessionError("invalid_signature", "Tenant session signature is invalid.");
  }

  const rawPayload = decodeJson(encodedPayload);
  if (isObject(rawPayload) && rawPayload.iss !== TENANT_SESSION_ISSUER) {
    throw new TenantSessionError("invalid_issuer", "Tenant session issuer does not match.");
  }
  const payload = parsePayload(rawPayload);
  if (payload.aud !== options.audience) {
    throw new TenantSessionError("invalid_audience", "Tenant session audience does not match.");
  }

  const clockSkewSeconds = options.clockSkewSeconds ?? 0;
  if (
    !Number.isSafeInteger(clockSkewSeconds) ||
    clockSkewSeconds < 0 ||
    clockSkewSeconds > 30
  ) {
    throw new RangeError("Tenant session clock skew must be an integer between 0 and 30 seconds.");
  }
  const now = epochSeconds(options.now ?? new Date());
  if (payload.iat > now + clockSkewSeconds) {
    throw new TenantSessionError("token_not_yet_valid", "Tenant session is not yet valid.");
  }
  if (payload.exp <= now - clockSkewSeconds) {
    throw new TenantSessionError("expired_token", "Tenant session has expired.");
  }

  return toClaims(payload);
}
