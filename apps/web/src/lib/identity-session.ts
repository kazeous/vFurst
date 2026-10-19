import { createHashedOpaqueToken, type PlatformRole } from "@vfurst/auth/core";
import { prisma, type Prisma } from "@vfurst/db";
import { STAFF_SESSION_MAX_AGE_SECONDS } from "@/lib/staff-identity";
import { STAFF_IDLE_MS, type StaffAssurance } from "@/lib/staff-session-policy";

export const IDENTITY_SESSION_MAX_AGE_SECONDS = STAFF_SESSION_MAX_AGE_SECONDS;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IdentityJwtClaims = {
  sub?: string;
  exp?: number;
  authVersion?: number;
  identitySessionId?: string;
  identitySessionValid?: boolean;
  platformRole?: PlatformRole;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  staffSecurity?: StaffSessionSecurity;
};

export type StaffSessionSecurity = {
  leaseRequired: boolean;
  emailVerified: boolean;
  primaryAuthenticatedAt: string;
  mfaVerifiedAt: string | null;
  mfaEnrolled: boolean;
  expiresAt: string;
};

export type BoundIdentity = {
  id: string;
  userId: string;
  authVersion: number;
  platformRole: PlatformRole;
  expires: Date;
  name: string | null;
  email: string;
  image: string | null;
  security: StaffSessionSecurity;
};

function invalidIdentityClaims<T extends IdentityJwtClaims>(token: T): T {
  token.identitySessionValid = false;
  delete token.identitySessionId;
  delete token.platformRole;
  delete token.staffSecurity;
  return token;
}

export function resolveIdentitySessionExpiry(tokenExpiresAt: number | undefined, now = new Date()) {
  const maximumExpiry = new Date(now.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000);
  if (tokenExpiresAt === undefined) return maximumExpiry;
  if (!Number.isSafeInteger(tokenExpiresAt)) return null;
  const tokenExpiry = new Date(tokenExpiresAt * 1_000);
  if (tokenExpiry <= now) return null;
  return tokenExpiry < maximumExpiry ? tokenExpiry : maximumExpiry;
}

export async function issueIdentitySession(input: {
  authVersion: number;
  expires: Date;
  userId: string;
  oidcSid: string | null;
  idToken: string;
  issuer: string;
  clientId: string;
  subject: string;
  idpValidUntil: Date;
  assurance: StaffAssurance;
  now: Date;
}, client: Prisma.TransactionClient = prisma) {
  return client.session.create({
    data: {
      sessionToken: createHashedOpaqueToken().tokenHash,
      userId: input.userId,
      authVersion: input.authVersion,
      expires: input.expires,
      oidcSid: input.oidcSid,
      idToken: input.idToken,
      oidcIssuer: input.issuer,
      oidcClientId: input.clientId,
      oidcSubject: input.subject,
      idpValidUntil: input.idpValidUntil,
      idleExpiresAt: new Date(Math.min(input.expires.getTime(), input.now.getTime() + STAFF_IDLE_MS)),
      lastUsedAt: input.now,
      ...input.assurance
    },
    select: { id: true }
  });
}

export async function validateIdentitySession(input: {
  authVersion: number;
  identitySessionId: string;
  userId: string;
  now?: Date;
}): Promise<BoundIdentity | null> {
  if (!UUID_PATTERN.test(input.identitySessionId)) return null;
  const now = input.now ?? new Date();
  const session = await prisma.session.findUnique({
    where: { id: input.identitySessionId },
    include: { user: { select: { authVersion: true, platformRole: true, name: true, email: true, image: true, emailVerified: true } } }
  });
  if (!session || session.userId !== input.userId) return null;
  const valid = session.authVersion === input.authVersion && session.user.authVersion === input.authVersion &&
    !session.revokedAt && session.expires > now && session.idleExpiresAt && session.idleExpiresAt > now &&
    session.oidcIssuer === process.env.AUTH_AUTHENTIK_ISSUER && session.oidcClientId === process.env.AUTH_AUTHENTIK_ID &&
    session.oidcSubject && session.primaryAuthenticatedAt && session.idpValidUntil && session.lastUsedAt &&
    typeof session.mfaEnrolled === "boolean" &&
    session.createdAt.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000 > now.getTime();
  if (!valid) {
    await revokeIdentitySession(session.id, now);
    return null;
  }
  const leaseRequired = session.idpValidUntil! <= now;
  // Throttle activity writes. A stale IdP lease cannot keep a local session alive.
  if (!leaseRequired && now.getTime() - session.lastUsedAt!.getTime() >= 60_000) {
    const touched = await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null, expires: { gt: now }, idleExpiresAt: { gt: now }, idpValidUntil: { gt: now } },
      data: { lastUsedAt: now, idleExpiresAt: new Date(Math.min(session.expires.getTime(), now.getTime() + STAFF_IDLE_MS)) }
    });
    if (touched.count !== 1) return null;
  }
  return {
    id: session.id, userId: session.userId, expires: session.expires, authVersion: session.authVersion,
    platformRole: session.user.platformRole, name: session.user.name, email: session.user.email, image: session.user.image,
    security: {
      leaseRequired, emailVerified: session.user.emailVerified !== null,
      primaryAuthenticatedAt: session.primaryAuthenticatedAt!.toISOString(),
      mfaVerifiedAt: session.mfaVerifiedAt?.toISOString() ?? null, mfaEnrolled: session.mfaEnrolled!,
      expiresAt: session.expires.toISOString()
    }
  };
}

export async function revokeIdentitySession(identitySessionId: string, now = new Date()) {
  if (!UUID_PATTERN.test(identitySessionId)) return;
  await prisma.session.updateMany({ where: { id: identitySessionId, revokedAt: null }, data: { revokedAt: now, idToken: null } });
}

export function identityClaims<T extends IdentityJwtClaims>(token: T, identity: BoundIdentity): T {
  return Object.assign(token, {
    sub: identity.userId, authVersion: identity.authVersion, identitySessionId: identity.id,
    platformRole: identity.platformRole, identitySessionValid: true,
    name: identity.name, email: identity.email, picture: identity.image, staffSecurity: identity.security
  });
}

export async function bindIdentitySessionToJwt<T extends IdentityJwtClaims>(token: T, now = new Date()): Promise<T & IdentityJwtClaims> {
  // Only a consumed OIDC transaction issues a session; never upgrade a rejected JWT.
  if (!token.sub || !Number.isSafeInteger(token.authVersion) || !token.identitySessionId) return invalidIdentityClaims(token);
  const identity = await validateIdentitySession({
    userId: token.sub, authVersion: token.authVersion!, identitySessionId: token.identitySessionId, now
  });
  return identity ? identityClaims(token, identity) : invalidIdentityClaims(token);
}
