import { PrismaAdapter } from "@auth/prisma-adapter";
import { normalizeIdentityEmail, type PlatformRole } from "@vfurst/auth/core";
import { prisma, type Prisma, type PrismaClient } from "@vfurst/db";
import type { Adapter } from "next-auth/adapters";
import { z } from "zod";

export const STAFF_IDENTITY_PROVIDER = "authentik";
const DEFAULT_STAFF_SESSION_MAX_AGE_SECONDS = 43_200;
const DEFAULT_PLATFORM_ADMIN_GROUP = "vfurst-platform-admins";

export type StaffClaims = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  groups: string[];
  sid: string | null;
};

export function resolveStaffSessionMaxAgeSeconds(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, DEFAULT_STAFF_SESSION_MAX_AGE_SECONDS) : DEFAULT_STAFF_SESSION_MAX_AGE_SECONDS;
}

/** Staff identity-session cap (spec §6.3): 12 hours unless configured otherwise. */
export const STAFF_SESSION_MAX_AGE_SECONDS = resolveStaffSessionMaxAgeSeconds(
  process.env.VFURST_STAFF_SESSION_MAX_AGE_SECONDS
);

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 2_048 && !/\p{Cc}/u.test(value) ? value : null;
}

export function parseStaffClaims(profile: unknown): StaffClaims | null {
  if (!profile || typeof profile !== "object") return null;
  const claims = profile as Record<string, unknown>;
  const sub = optionalString(claims.sub);
  const email = optionalString(claims.email);
  if (!sub || sub.length > 255 || !email || email.length > 254 || typeof claims.email_verified !== "boolean") return null;
  const sid = optionalString(claims.sid);
  if (claims.sid !== undefined && (!sid || sid.length > 255)) return null;

  const normalizedEmail = normalizeIdentityEmail(email);
  if (!z.string().email().safeParse(normalizedEmail).success) return null;

  return {
    sub,
    email: normalizedEmail,
    emailVerified: claims.email_verified === true,
    name: optionalString(claims.name) ?? optionalString(claims.preferred_username),
    image: optionalString(claims.picture),
    groups: Array.isArray(claims.groups) ? claims.groups.filter((group): group is string => typeof group === "string") : [],
    sid
  };
}

export function staffPlatformRole(
  groups: readonly string[],
  adminGroup = process.env.VFURST_PLATFORM_ADMIN_GROUP || DEFAULT_PLATFORM_ADMIN_GROUP
): PlatformRole {
  return groups.includes(adminGroup) ? "PLATFORM_ADMIN" : "USER";
}

/**
 * A claimed email that already belongs to another user is a conflict: vFurst
 * never links staff identities by email (spec §6.2). This covers a new subject
 * meeting an existing email and a linked subject whose new email is taken.
 */
export async function findStaffEmailConflict(
  claims: Pick<StaffClaims, "sub" | "email">
): Promise<{ existingUserId: string; linkedUserId: string | null } | null> {
  const [existing, linked] = await Promise.all([
    prisma.user.findUnique({ where: { email: claims.email }, select: { id: true } }),
    prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } },
      select: { userId: true }
    })
  ]);
  const linkedUserId = linked?.userId ?? null;

  return existing && existing.id !== linkedUserId ? { existingUserId: existing.id, linkedUserId } : null;
}

/** Mirrors the identity provider's claims onto the staff user at every sign-in (spec §6.2). */
export async function syncStaffUser(userId: string, claims: StaffClaims, now = new Date(), client: Prisma.TransactionClient = prisma): Promise<void> {
  const current = await client.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });

  await client.user.update({
    where: { id: userId },
    data: {
      email: claims.email,
      name: claims.name,
      image: claims.image,
      emailVerified: claims.emailVerified ? (current?.email === claims.email ? current.emailVerified ?? now : now) : null,
      platformRole: staffPlatformRole(claims.groups)
    }
  });
}

/** Auth.js adapter that links the identity-provider subject without storing its tokens (spec §6.1). */
export function createStaffAdapter(client: PrismaClient): Adapter {
  const adapter = PrismaAdapter(client);

  return {
    ...adapter,
    linkAccount: (account) =>
      adapter.linkAccount!({
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        userId: account.userId
      })
  };
}
