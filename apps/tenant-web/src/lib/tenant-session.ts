import {
  AUTH_COOKIE_NAMES,
  TENANT_SESSION_AUDIENCE,
  TenantSessionError,
  verifyTenantSession
} from "@vfurst/auth";
import { prisma } from "@vfurst/db";
import { cookies } from "next/headers";
import { getTenantAuthRuntime } from "./auth-runtime";
import { getTenantWebEnvironment, type TenantWebEnvironment } from "./environment";

export type CentralIdentitySessionRecord = Readonly<{
  id: string;
  userId: string;
  authVersion: number;
  revokedAt: Date | null;
  expires: Date;
  user: Readonly<{
    id: string;
    authVersion: number;
  }>;
}>;

export type CentralIdentitySessionLookup = (
  identitySessionId: string
) => Promise<CentralIdentitySessionRecord | null>;

export type TenantIdentity = Readonly<{
  identitySessionId: string;
  userId: string;
  authVersion: number;
  expiresAt: Date;
}>;

async function lookupCentralIdentitySession(identitySessionId: string) {
  return prisma.session.findUnique({
    where: { id: identitySessionId },
    select: {
      id: true,
      userId: true,
      authVersion: true,
      revokedAt: true,
      expires: true,
      user: {
        select: {
          id: true,
          authVersion: true
        }
      }
    }
  });
}

export async function resolveTenantIdentity(
  token: string | undefined,
  environment: TenantWebEnvironment,
  lookup: CentralIdentitySessionLookup = lookupCentralIdentitySession,
  now = new Date()
): Promise<TenantIdentity | null> {
  if (!token) return null;

  let claims;
  try {
    claims = verifyTenantSession(token, {
      secret: getTenantAuthRuntime(environment).tenantSessionSecret,
      audience: TENANT_SESSION_AUDIENCE,
      now
    });
  } catch (error) {
    if (error instanceof TenantSessionError) return null;
    throw error;
  }

  const session = await lookup(claims.identitySessionId);
  if (
    !session ||
    session.id !== claims.identitySessionId ||
    session.userId !== claims.userId ||
    session.user.id !== claims.userId ||
    session.authVersion !== claims.authVersion ||
    session.user.authVersion !== claims.authVersion ||
    session.revokedAt !== null ||
    session.expires.getTime() <= now.getTime()
  ) {
    return null;
  }

  return Object.freeze({
    identitySessionId: session.id,
    userId: session.userId,
    authVersion: session.authVersion,
    expiresAt: session.expires
  });
}

export async function getCurrentTenantIdentity() {
  const cookieStore = await cookies();
  return resolveTenantIdentity(
    cookieStore.get(AUTH_COOKIE_NAMES.tenantSession)?.value,
    getTenantWebEnvironment()
  );
}
