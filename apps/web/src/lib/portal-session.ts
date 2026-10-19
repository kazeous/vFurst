import { createHashedOpaqueToken, hashOpaqueToken } from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";

export const PORTAL_SESSION_MAX_AGE_SECONDS = 2_592_000;

export type PortalAccountSummary = {
  id: string;
  orgId: string;
  email: string;
  name: string | null;
};

export function portalSessionCookieName(
  secure: boolean
): "__Host-vfurst-portal" | "vfurst-portal" {
  return secure ? "__Host-vfurst-portal" : "vfurst-portal";
}

export function portalSessionCookieOptions(
  secure: boolean,
  expiresAt: Date
): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; expires: Date } {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt };
}

export async function createPortalSession(input: {
  orgId: string;
  portalAccountId: string;
  authVersion: number;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const { token, tokenHash } = createHashedOpaqueToken();
  const expiresAt = new Date(now.getTime() + PORTAL_SESSION_MAX_AGE_SECONDS * 1_000);

  await prisma.portalSession.create({
    data: {
      orgId: input.orgId,
      portalAccountId: input.portalAccountId,
      tokenHash,
      authVersion: input.authVersion,
      expiresAt
    }
  });

  return { token, expiresAt };
}

export async function resolvePortalSession(input: {
  token: string;
  orgId: string;
  now?: Date;
}): Promise<PortalAccountSummary | null> {
  const now = input.now ?? new Date();
  const session = await prisma.portalSession.findUnique({
    where: { tokenHash: hashOpaqueToken(input.token) },
    include: {
      portalAccount: {
        select: { id: true, orgId: true, email: true, name: true, authVersion: true }
      }
    }
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    session.authVersion !== session.portalAccount.authVersion ||
    session.orgId !== input.orgId
  ) {
    return null;
  }

  const { id, orgId, email, name } = session.portalAccount;
  return { id, orgId, email, name };
}

export async function revokePortalSession(token: string, now = new Date()): Promise<void> {
  await prisma.portalSession.updateMany({
    where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
    data: { revokedAt: now }
  });
}
