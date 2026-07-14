import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "BoundaryPass123!";
const platformEmail = `boundary-platform-${runId}@example.com`;
const ownerEmail = `boundary-owner-${runId}@example.com`;
const orgSlug = `boundary-org-${runId}`;
const requestedDomain = `boundary-${runId}.example.test`;

let orgId: string;
let platformAdminId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

async function loginAs(page: Page, email: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 30_000 });
}

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [platformAdmin, owner] = await Promise.all([
    prisma.user.create({
      data: { email: platformEmail, name: "Boundary Platform Admin", passwordHash, platformRole: "PLATFORM_ADMIN" }
    }),
    prisma.user.create({ data: { email: ownerEmail, name: "Boundary Owner", passwordHash } })
  ]);
  const org = await prisma.organization.create({
    data: {
      name: "Boundary Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      statusUpdatedById: platformAdmin.id,
      statusUpdatedAt: new Date(),
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Boundary Convention",
          slug: "boundary-convention",
          status: "PUBLISHED",
          startDate: new Date("2028-08-01T09:00:00Z"),
          endDate: new Date("2028-08-02T17:00:00Z")
        }
      }
    }
  });

  orgId = org.id;
  platformAdminId = platformAdmin.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { email: { in: [platformEmail, ownerEmail] } } });
  await prisma.$disconnect();
});

test("organizer can request a domain but cannot access platform domain or payment controls", async ({ page }) => {
  await loginAs(page, ownerEmail, "/dashboard");

  expect((await page.request.get("/platform/domains")).status()).toBe(404);
  expect((await page.request.get("/platform/payments")).status()).toBe(404);
  expect((await page.request.get("/platform/payments/payouts/export")).status()).toBe(404);

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Organizer settings" })).toBeVisible();
  await expect(page.getByText("Enable Stripe platform-wide")).toHaveCount(0);
  await expect(page.getByText("Manual SePay refunds")).toHaveCount(0);

  await page.goto(`/dashboard/organizations/${orgId}/settings`);
  await page.getByLabel("Requested domain").fill(requestedDomain);
  const requestSaved = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/dashboard/organizations/${orgId}/settings` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Save request" }).click();
  await requestSaved;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  expect(org.requestedCustomDomain).toBe(requestedDomain);
  expect(org.customDomain).toBeNull();
  expect(org.customDomainStatus).toBe("PENDING_VERIFICATION");
  expect(org.customDomainVerifiedById).toBeNull();
  expect(org.customDomainActivatedById).toBeNull();
  await expect(page.getByRole("button", { name: /verify|activate|check dns/i })).toHaveCount(0);
});

test("platform admin owns domain activation and global payment operations", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform");

  const navigation = page.getByRole("navigation", { name: "Platform navigation" });
  await expect(navigation.getByRole("link", { name: "Domains" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Payments" })).toBeVisible();

  await page.goto("/platform/domains");
  await expect(page.getByRole("heading", { name: "Custom domains" })).toBeVisible();
  await expect(page.getByText(requestedDomain, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify DNS ownership" })).toBeVisible();

  // Stage the successful DNS result so this browser test can exercise activation without relying on public DNS.
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      customDomainStatus: "VERIFIED",
      customDomainVerifiedById: platformAdminId,
      customDomainVerifiedAt: new Date()
    }
  });
  await page.reload();
  const activation = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/platform/domains" && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Activate public routing" }).click();
  await activation;
  await expect.poll(async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return {
      customDomain: org.customDomain,
      customDomainStatus: org.customDomainStatus,
      activatedBy: org.customDomainActivatedById
    };
  }, { timeout: 30_000 }).toEqual({
    customDomain: requestedDomain,
    customDomainStatus: "ACTIVE",
    activatedBy: platformAdminId
  });

  const customHostResponse = await page.request.get("/", {
    headers: { host: requestedDomain }
  });
  expect(customHostResponse.status()).toBe(200);
  const customHostHtml = await customHostResponse.text();
  expect(customHostHtml).toContain("Boundary Convention");
  expect(customHostHtml).toContain('href="/register"');
  expect(customHostHtml).not.toContain(`href="/${orgSlug}/register"`);

  const customRegistrationResponse = await page.request.get("/register", {
    headers: { host: requestedDomain }
  });
  expect(customRegistrationResponse.status()).toBe(200);
  expect(await customRegistrationResponse.text()).toContain("Choose a ticket");

  await page.goto("/platform/payments");
  await expect(page.getByRole("heading", { name: "Payments and settlement" })).toBeVisible();
  await expect(page.getByText("Enable Stripe platform-wide")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export open ledger CSV" })).toHaveAttribute("href", "/platform/payments/payouts/export");
  expect((await page.request.get("/platform/payments/payouts/export")).status()).toBe(200);
});
