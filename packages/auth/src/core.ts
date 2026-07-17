import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_HASH_ROUNDS = 12;
export const OPAQUE_TOKEN_BYTES = 32;
export const PKCE_VERIFIER_BYTES = 32;
export const AUTHORIZATION_STATE_BYTES = 32;
export const MAX_LOCAL_RETURN_PATH_LENGTH = 2_048;
export const AUTH_TRANSACTION_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export const AUTH_COOKIE_NAMES = Object.freeze({
  managerSession: "__Host-vfurst-manager-session",
  tenantSession: "__Host-vfurst-tenant-session",
  tenantTransaction: "__Host-vfurst-auth-transaction"
});

export type SameSitePolicy = "lax" | "strict";

/**
 * A host-only cookie intentionally has no `domain` field. The `__Host-` names
 * above additionally require Secure and Path=/ in production browsers.
 */
export type HostOnlyCookiePolicy = Readonly<{
  httpOnly: true;
  path: "/";
  sameSite: SameSitePolicy;
  secure: true;
}>;

export type HostOnlyTransactionCookiePolicy = HostOnlyCookiePolicy &
  Readonly<{
    maxAge: number;
  }>;

export const HOST_ONLY_SESSION_COOKIE_POLICY: HostOnlyCookiePolicy = Object.freeze({
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true
});

export const HOST_ONLY_TRANSACTION_COOKIE_POLICY: HostOnlyTransactionCookiePolicy = Object.freeze({
  ...HOST_ONLY_SESSION_COOKIE_POLICY,
  maxAge: AUTH_TRANSACTION_COOKIE_MAX_AGE_SECONDS
});

export type PlatformRole = "USER" | "PLATFORM_ADMIN";
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";

const ORGANIZATION_ROLES = new Set<OrganizationRole>(["OWNER", "ADMIN", "MEMBER"]);
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

function requirePositiveByteLength(byteLength: number) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 128) {
    throw new RangeError("Token byte length must be an integer between 16 and 128.");
  }
}

export function normalizeIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string, rounds = PASSWORD_HASH_ROUNDS) {
  if (!Number.isSafeInteger(rounds) || rounds < 10 || rounds > 16) {
    throw new RangeError("Password hash rounds must be an integer between 10 and 16.");
  }

  return bcrypt.hash(password, rounds);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function createOpaqueToken(byteLength = OPAQUE_TOKEN_BYTES) {
  requirePositiveByteLength(byteLength);
  return randomBytes(byteLength).toString("base64url");
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashOpaqueToken(token: string) {
  return sha256Hex(token);
}

export function createHashedOpaqueToken(byteLength = OPAQUE_TOKEN_BYTES) {
  const token = createOpaqueToken(byteLength);

  return {
    token,
    tokenHash: hashOpaqueToken(token)
  };
}

export function isValidPkceVerifier(verifier: string) {
  return PKCE_VERIFIER_PATTERN.test(verifier);
}

export function createPkceVerifier(byteLength = PKCE_VERIFIER_BYTES) {
  const verifier = createOpaqueToken(byteLength);

  if (!isValidPkceVerifier(verifier)) {
    throw new Error("Generated PKCE verifier does not satisfy RFC 7636.");
  }

  return verifier;
}

export function createPkceS256Challenge(verifier: string) {
  if (!isValidPkceVerifier(verifier)) {
    throw new Error("PKCE verifier must contain 43 to 128 RFC 7636 unreserved characters.");
  }

  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createAuthorizationState(byteLength = AUTHORIZATION_STATE_BYTES) {
  return createOpaqueToken(byteLength);
}

export function isSafeLocalReturnPath(value: string | undefined) {
  if (!value || value.length > MAX_LOCAL_RETURN_PATH_LENGTH || !value.startsWith("/") || value.startsWith("//")) {
    return false;
  }

  if (value.includes("\\")) {
    return false;
  }

  return !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function safeLocalReturnPath(
  value: string | readonly string[] | undefined,
  fallback = "/dashboard"
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isSafeLocalReturnPath(candidate) ? candidate : fallback;
}

/** Compatibility name for incrementally replacing the current app helper. */
export const safeReturnTo = safeLocalReturnPath;

export function isPlatformAdmin(role: PlatformRole | string | null | undefined): role is "PLATFORM_ADMIN" {
  return role === "PLATFORM_ADMIN";
}

export function isOrganizationRole(role: string | null | undefined): role is OrganizationRole {
  return role != null && ORGANIZATION_ROLES.has(role as OrganizationRole);
}

export function hasOrganizationRole(
  role: OrganizationRole | string | null | undefined,
  allowedRoles: readonly OrganizationRole[]
) {
  return isOrganizationRole(role) && allowedRoles.includes(role);
}

export function canManageOrganization(role: OrganizationRole | string | null | undefined) {
  return hasOrganizationRole(role, ["OWNER", "ADMIN"]);
}

export function isOrganizationOwner(role: OrganizationRole | string | null | undefined): role is "OWNER" {
  return role === "OWNER";
}
