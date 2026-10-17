import type { Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const E2E_PORTAL_PASSWORD = "PortalE2EPass123!";

export function portalOrigin(subdomain: string): string {
  return `http://${subdomain}.localhost:3000`;
}

export async function createPortalAccountFixture(
  prisma: PrismaClient,
  input: { orgId: string; email: string; name?: string; password?: string }
): Promise<{ id: string; email: string }> {
  return prisma.portalAccount.create({
    data: {
      orgId: input.orgId,
      email: input.email.trim().toLowerCase(),
      name: input.name,
      passwordHash: await bcrypt.hash(input.password ?? E2E_PORTAL_PASSWORD, 12),
      emailVerifiedAt: new Date()
    },
    select: { id: true, email: true }
  });
}

export async function loginAsAttendee(
  page: Page,
  org: { subdomain: string },
  email: string,
  options: { password?: string; returnTo?: string } = {}
): Promise<void> {
  const origin = portalOrigin(org.subdomain);
  const returnTo = options.returnTo ?? "/account";
  const target = new URL(returnTo, origin);
  await page.goto(`${origin}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(options.password ?? E2E_PORTAL_PASSWORD);
  // Register before the click: cookie refresh can expose the next UI before
  // useActionRedirect starts its full-document location.replace navigation.
  const loaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await loaded;
  await page.waitForURL(target.toString(), { waitUntil: "load", timeout: 30_000 });
}
