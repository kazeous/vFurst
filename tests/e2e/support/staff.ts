import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const STAFF_ADMIN_GROUP = "vfurst-platform-admins";
const appOrigin = "http://localhost:3000";
const mockIdentityProviderOrigin = "http://localhost:8090";

let lookupClient: PrismaClient | undefined;

/**
 * Nested `prisma.user.create` data that links a new staff user to a studio
 * identity-provider subject, for specs that build users inline.
 */
export function staffIdentityData(input: { emailVerified?: boolean } = {}) {
  return {
    emailVerified: input.emailVerified === false ? null : new Date(),
    accounts: { create: { type: "oidc", provider: "authentik", providerAccountId: `staff-${randomUUID()}` } }
  };
}

export type StaffFixture = { id: string; email: string; sub: string; groups: string[]; emailVerified: boolean };

/**
 * Creates a staff user already linked to a studio identity-provider subject.
 * Without the linked Account row, the first sign-in would hit the
 * email-conflict rule (spec §6.2) because the email already exists.
 */
export async function createStaffFixture(
  prisma: PrismaClient,
  input: { email: string; name?: string; platformRole?: "USER" | "PLATFORM_ADMIN"; emailVerified?: boolean }
): Promise<StaffFixture> {
  const sub = `staff-${randomUUID()}`;
  const email = input.email.trim().toLowerCase();
  const emailVerified = input.emailVerified !== false;
  const platformRole = input.platformRole ?? "USER";
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name ?? null,
      emailVerified: emailVerified ? new Date() : null,
      platformRole,
      accounts: { create: { type: "oidc", provider: "authentik", providerAccountId: sub } }
    }
  });

  return {
    id: user.id,
    email,
    sub,
    groups: platformRole === "PLATFORM_ADMIN" ? [STAFF_ADMIN_GROUP] : [],
    emailVerified
  };
}

/**
 * Signs in through /login and the mock identity provider's interactive form,
 * and returns only after the browser has loaded the expected landing path.
 */
export async function loginAsStaff(
  page: Page,
  staff: { sub: string; email: string; groups?: string[]; emailVerified?: boolean; name?: string; sid?: string },
  options: { returnTo?: string; expectPath?: string } = {}
): Promise<void> {
  const returnTo = options.returnTo ?? "/dashboard";
  const expectPath = options.expectPath ?? new URL(returnTo, appOrigin).pathname;
  const claims = {
    email: staff.email,
    email_verified: staff.emailVerified ?? true,
    ...(staff.name ? { name: staff.name } : {}),
    groups: staff.groups ?? [],
    ...(staff.sid ? { sid: staff.sid } : {})
  };

  await page.goto(`${appOrigin}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name: "Sign in with your Reyuu Games account" }).click();
  await page.waitForURL((url) => url.origin === mockIdentityProviderOrigin);
  await page.locator('input[name="username"]').fill(staff.sub);
  await page.locator('textarea[name="claims"]').fill(JSON.stringify(claims));
  await page.locator('input[type="submit"]').click();
  await page.waitForURL((url) => url.origin === appOrigin && url.pathname === expectPath, {
    timeout: 30_000,
    waitUntil: "load"
  });
}

/**
 * Signs in an existing staff user by email: the linked subject, the admin group
 * (from platformRole), and the verified state come from the database, so the
 * sign-in keeps the user's current role.
 */
export async function loginAsStaffEmail(
  page: Page,
  email: string,
  options: { returnTo?: string; expectPath?: string } = {}
): Promise<void> {
  lookupClient ??= new PrismaClient();
  const user = await lookupClient.user.findUniqueOrThrow({
    where: { email: email.trim().toLowerCase() },
    select: {
      name: true,
      platformRole: true,
      emailVerified: true,
      accounts: { where: { provider: "authentik" }, select: { providerAccountId: true } }
    }
  });
  const sub = user.accounts[0]?.providerAccountId;
  if (!sub) throw new Error(`Staff fixture ${email} has no linked identity-provider subject.`);

  await loginAsStaff(
    page,
    {
      sub,
      email,
      groups: user.platformRole === "PLATFORM_ADMIN" ? [STAFF_ADMIN_GROUP] : [],
      emailVerified: user.emailVerified !== null,
      ...(user.name ? { name: user.name } : {})
    },
    options
  );
}
