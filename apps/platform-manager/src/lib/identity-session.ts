import { createHashedOpaqueToken, type PlatformRole } from "@vfurst/auth/core";
import { prisma, registerIdentitySession, revokeIdentitySession as revokeStoredIdentitySession } from "@vfurst/db";
import { randomUUID } from "node:crypto";

export const IDENTITY_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IdentityJwtClaims = {
  sub?: string;
  exp?: number;
  authVersion?: number;
  identitySessionId?: string;
  identitySessionValid?: boolean;
  platformRole?: PlatformRole;
};

type BoundIdentity = Readonly<{
  id: string;
  userId: string;
  authVersion: number;
  platformRole: PlatformRole;
  expires: Date;
}>;

function invalidate<T extends IdentityJwtClaims>(token: T): T {
  token.identitySessionValid = false;
  delete token.identitySessionId;
  delete token.platformRole;
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

async function issueIdentitySession(input: {
  userId: string;
  expires: Date;
  now: Date;
}): Promise<BoundIdentity | null> {
  await prisma.session.deleteMany({
    where: { userId: input.userId, expires: { lte: input.now } }
  });

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { authVersion: true, platformRole: true }
  });
  if (!user) return null;

  const session = await registerIdentitySession(prisma, {
    id: randomUUID(),
    userId: input.userId,
    sessionTokenHash: createHashedOpaqueToken().tokenHash,
    expiresAt: input.expires,
    now: input.now
  });

  return {
    id: session.id,
    userId: session.userId,
    authVersion: session.authVersion,
    platformRole: user.platformRole,
    expires: session.expires
  };
}

async function validateIdentitySession(input: {
  identitySessionId: string;
  userId: string;
  authVersion: number;
  now: Date;
}): Promise<BoundIdentity | null> {
  if (!UUID_PATTERN.test(input.identitySessionId)) return null;

  const session = await prisma.session.findUnique({
    where: { id: input.identitySessionId },
    select: {
      id: true,
      userId: true,
      authVersion: true,
      expires: true,
      revokedAt: true,
      user: { select: { authVersion: true, platformRole: true } }
    }
  });

  if (!session) return null;
  const valid =
    session.userId === input.userId &&
    session.authVersion === input.authVersion &&
    session.user.authVersion === input.authVersion &&
    session.revokedAt === null &&
    session.expires > input.now;

  if (!valid) {
    if (session.expires <= input.now) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    } else if (session.revokedAt === null) {
      await revokeStoredIdentitySession(prisma, session.id, input.now);
    }
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    authVersion: session.authVersion,
    platformRole: session.user.platformRole,
    expires: session.expires
  };
}

export async function bindIdentitySessionToJwt<T extends IdentityJwtClaims>(
  token: T,
  signedInUserId?: string,
  now = new Date()
): Promise<T & IdentityJwtClaims> {
  if (signedInUserId) {
    token.sub = signedInUserId;
    const expires = resolveIdentitySessionExpiry(token.exp, now);
    if (!expires) return invalidate(token);

    const identity = await issueIdentitySession({ userId: signedInUserId, expires, now });
    if (!identity) return invalidate(token);

    token.authVersion = identity.authVersion;
    token.identitySessionId = identity.id;
    token.platformRole = identity.platformRole;
    token.identitySessionValid = true;
    return token;
  }

  if (!token.sub || typeof token.authVersion !== "number" || !token.identitySessionId) {
    return invalidate(token);
  }

  const identity = await validateIdentitySession({
    identitySessionId: token.identitySessionId,
    userId: token.sub,
    authVersion: token.authVersion,
    now
  });
  if (!identity) return invalidate(token);

  token.platformRole = identity.platformRole;
  token.identitySessionValid = true;
  return token;
}

export async function revokeIdentitySession(identitySessionId: string, now = new Date()) {
  if (!UUID_PATTERN.test(identitySessionId)) return false;
  return revokeStoredIdentitySession(prisma, identitySessionId, now);
}
