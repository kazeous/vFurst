import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaffFixture, loginAsStaff, STAFF_ADMIN_GROUP, type StaffFixture } from "./support/staff";

const prisma = new PrismaClient();
const run = `${Date.now()}-${process.pid}`;
const orgSlug = `staff-sso-org-${run}`;
const emails = {
  admin: `staff-sso-admin-${run}@example.com`,
  owner: `staff-sso-owner-${run}@example.com`,
  outsider: `staff-sso-outsider-${run}@example.com`,
  demoted: `staff-sso-demoted-${run}@example.com`,
  conflict: `staff-sso-conflict-${run}@example.com`,
  newcomer: `staff-sso-new-${run}@example.com`
};
let orgId: string;
let admin: StaffFixture;
let owner: StaffFixture;
let outsider: StaffFixture;
let demoted: StaffFixture;
let conflict: StaffFixture;

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  [admin, owner, outsider, demoted, conflict] = await Promise.all([
    createStaffFixture(prisma, { email: emails.admin, name: "SSO Admin", platformRole: "PLATFORM_ADMIN" }),
    createStaffFixture(prisma, { email: emails.owner, name: "SSO Owner" }),
    createStaffFixture(prisma, { email: emails.outsider, name: "SSO Outsider" }),
    createStaffFixture(prisma, { email: emails.demoted, name: "SSO Demoted", platformRole: "PLATFORM_ADMIN" }),
    createStaffFixture(prisma, { email: emails.conflict, name: "SSO Conflict Owner" })
  ]);
  const org = await prisma.organization.create({
    data: {
      name: `Staff SSO ${run}`,
      slug: orgSlug,
      subdomain: orgSlug,
      status: "ACTIVE",
      contactEmail: `contact-${orgSlug}@example.com`,
      members: { create: { userId: owner.id, role: "OWNER" } }
    }
  });
  orgId = org.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
});

test("a first sign-in creates the user and links the subject without storing tokens", async ({ page }) => {
  const sub = `staff-new-${run}`;
  await loginAsStaff(page, { sub, email: emails.newcomer, name: "SSO Newcomer" });

  await expect(page.getByTestId("dashboard-access-denied")).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.newcomer }, include: { accounts: true } });
  expect(user.emailVerified).not.toBeNull();
  expect(user.platformRole).toBe("USER");
  expect(user.accounts).toHaveLength(1);
  expect(user.accounts[0]).toMatchObject({
    provider: "authentik",
    providerAccountId: sub,
    access_token: null,
    refresh_token: null,
    id_token: null
  });
});

test("a platform-admin group member lands on /platform", async ({ page }) => {
  await loginAsStaff(page, admin, { expectPath: "/platform" });

  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).platformRole).toBe("PLATFORM_ADMIN");
});

test("an organization owner lands on /dashboard", async ({ page }) => {
  await loginAsStaff(page, owner);

  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
});

test("a staff account without membership sees the 403 screen", async ({ page }) => {
  await loginAsStaff(page, outsider);

  await expect(page.getByTestId("dashboard-access-denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer access required" })).toBeVisible();
});

test("removing the admin group demotes on the next sign-in", async ({ page, context }) => {
  await loginAsStaff(page, demoted, { expectPath: "/platform" });
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();

  await context.clearCookies();
  await loginAsStaff(page, { ...demoted, groups: [] });

  await expect(page.getByTestId("dashboard-access-denied")).toBeVisible();
  expect((await page.request.get("/platform")).status()).toBe(404);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: demoted.id } })).platformRole).toBe("USER");
});

test("an email owned by another subject is denied", async ({ page }) => {
  await loginAsStaff(page, { sub: `staff-impostor-${run}`, email: emails.conflict, groups: [STAFF_ADMIN_GROUP] }, { expectPath: "/login" });

  expect(new URL(page.url()).searchParams.get("error")).toBe("StudioAccountConflict");
  await expect(page.getByTestId("login-error")).toContainText(
    "This Reyuu Games account uses an email that already belongs to another vFurst staff account. Contact a platform administrator."
  );
  const accounts = await prisma.account.findMany({ where: { userId: conflict.id } });
  expect(accounts.map((account) => account.providerAccountId)).toEqual([conflict.sub]);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: conflict.id } })).platformRole).toBe("USER");
});
