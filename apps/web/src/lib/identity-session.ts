import { createHashedOpaqueToken, type PlatformRole } from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";
import { STAFF_SESSION_MAX_AGE_SECONDS } from "@/lib/staff-identity";

export const IDENTITY_SESSION_MAX_AGE_SECONDS = STAFF_SESSION_MAX_AGE_SECONDS;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IdentityJwtClaims = {
  sub?: string;
  exp?: number;
  authVersion?: number;
  identitySessionId?: string;
  identitySessionValid?: boolean;
  platformRole?: PlatformRole;
};

type BoundIdentity = {
  id: string;
  userId: string;
  authVersion: number;
  platformRole: PlatformRole;
  expires: Date;
};

function invalidIdentityClaims<T extends IdentityJwtClaims>(token: T): T {
  token.identitySessionValid = false;
  delete token.identitySessionId;
  delete token.platformRole;
  return token;
}

export function resolveIdentitySessionExpiry(tokenExpiresAt: number | undefined, now = new Date()) {
  const maximumExpiry = new Date(now.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000);

  if (tokenExpiresAt === undefined) {
    return maximumExpiry;
  }

  if (!Number.isSafeInteger(tokenExpiresAt)) {
    return null;
  }

  const tokenExpiry = new Date(tokenExpiresAt * 1_000);
  if (tokenExpiry <= now) {
    return null;
  }

  return tokenExpiry < maximumExpiry ? tokenExpiry : maximumExpiry;
}

export async function issueIdentitySession(input: {
  authVersion: number;
  expires: Date;
  platformRole: PlatformRole;
  userId: string;
  oidcSid?: string | null;
  idToken?: string | null;
  now?: Date;
}): Promise<BoundIdentity> {
  const now = input.now ?? new Date();

  await prisma.session.deleteMany({
    where: {
      userId: input.userId,
      expires: { lte: now }
    }
  });

  const session = await prisma.session.create({
    data: {
      sessionToken: createHashedOpaqueToken().tokenHash,
      userId: input.userId,
      authVersion: input.authVersion,
      expires: input.expires,
      oidcSid: input.oidcSid ?? null,
      idToken: input.idToken ?? null
    },
    select: {
      id: true,
      userId: true,
      authVersion: true,
      expires: true
    }
  });

  return {
    ...session,
    platformRole: input.platformRole
  };
}

export async function validateIdentitySession(input: {
  authVersion: number;
  identitySessionId: string;
  userId: string;
  now?: Date;
}): Promise<BoundIdentity | null> {
  if (!UUID_PATTERN.test(input.identitySessionId)) {
    return null;
  }

  const now = input.now ?? new Date();
  const session = await prisma.session.findUnique({
    where: { id: input.identitySessionId },
    select: {
      id: true,
      userId: true,
      authVersion: true,
      expires: true,
      revokedAt: true,
      user: {
        select: {
          authVersion: true,
          platformRole: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  const valid =
    session.userId === input.userId &&
    session.authVersion === input.authVersion &&
    session.user.authVersion === input.authVersion &&
    session.revokedAt === null &&
    session.expires > now;

  if (!valid) {
    if (session.expires <= now) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    } else if (
      session.userId === input.userId &&
      session.revokedAt === null &&
      (session.authVersion !== input.authVersion || session.user.authVersion !== input.authVersion)
    ) {
      await prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, idToken: null }
      });
    }
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    expires: session.expires,
    authVersion: session.authVersion,
    platformRole: session.user.platformRole
  };
}

export async function revokeIdentitySession(identitySessionId: string, now = new Date()) {
  if (!UUID_PATTERN.test(identitySessionId)) {
    return;
  }

  await prisma.session.updateMany({
    where: { id: identitySessionId, revokedAt: null },
    data: { revokedAt: now, idToken: null }
  });
}

export async function bindIdentitySessionToJwt<T extends IdentityJwtClaims>(
  token: T,
  signedInUserId?: string,
  now = new Date(),
  oidc?: { sid: string | null; idToken: string | null }
): Promise<T & IdentityJwtClaims> {
  if (signedInUserId) {
    token.sub = signedInUserId;
    const account = await prisma.user.findUnique({
      where: { id: signedInUserId },
      select: { authVersion: true, platformRole: true }
    });

    if (!account) {
      return invalidIdentityClaims(token);
    }

    token.authVersion = account.authVersion;
    const expires = resolveIdentitySessionExpiry(token.exp, now);
    if (!expires) {
      return invalidIdentityClaims(token);
    }

    const identity = await issueIdentitySession({
      userId: signedInUserId,
      authVersion: account.authVersion,
      platformRole: account.platformRole,
      expires,
      oidcSid: oidc?.sid,
      idToken: oidc?.idToken,
      now
    });

    token.identitySessionId = identity.id;
    token.platformRole = identity.platformRole;
    token.identitySessionValid = true;
    return token;
  }

  if (!token.sub || typeof token.authVersion !== "number") {
    return invalidIdentityClaims(token);
  }

  if (token.identitySessionId) {
    const identity = await validateIdentitySession({
      identitySessionId: token.identitySessionId,
      userId: token.sub,
      authVersion: token.authVersion,
      now
    });

    if (!identity) {
      return invalidIdentityClaims(token);
    }

    token.platformRole = identity.platformRole;
    token.identitySessionValid = true;
    return token;
  }

  // Compatibility path for JWTs issued before the identity-session registry
  // existed. A current authVersion is required before registering the token.
  const account = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { authVersion: true, platformRole: true }
  });

  if (!account || account.authVersion !== token.authVersion) {
    return invalidIdentityClaims(token);
  }

  const expires = resolveIdentitySessionExpiry(token.exp, now);
  if (!expires) {
    return invalidIdentityClaims(token);
  }

  const identity = await issueIdentitySession({
    userId: token.sub,
    authVersion: account.authVersion,
    platformRole: account.platformRole,
    expires,
    now
  });

  token.identitySessionId = identity.id;
  token.platformRole = identity.platformRole;
  token.identitySessionValid = true;
  return token;
}
