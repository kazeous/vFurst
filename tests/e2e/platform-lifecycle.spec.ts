import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "LifecyclePass123!";
const platformEmail = `lifecycle-platform-${runId}@example.com`;
const ownerEmail = `lifecycle-owner-${runId}@example.com`;
const orgSlug = `lifecycle-org-${runId}`;
const provisioningSlug = `lifecycle-provisioning-${runId}`;
const apiToken = `vf_live_${createHash("sha256").update(`${runId}:api`).digest("base64url")}`;

let orgId: string;
let provisioningOrgId: string;

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
      data: { email: platformEmail, name: "Lifecycle Platform Admin", passwordHash, platformRole: "PLATFORM_ADMIN" }
    }),
    prisma.user.create({ data: { email: ownerEmail, name: "Lifecycle Owner", passwordHash } })
  ]);

  const org = await prisma.organization.create({
    data: {
      name: "Lifecycle Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      statusUpdatedById: platformAdmin.id,
      statusUpdatedAt: new Date(),
      members: { create: { userId: owner.id, role: "OWNER" } },
      apiKeys: {
        create: {
          name: "Lifecycle API key",
          keyHash: createHash("sha256").update(apiToken).digest("hex"),
          scopes: ["events:read"]
        }
      },
      events: {
        create: {
          name: "Lifecycle Event",
          slug: "lifecycle-event",
          status: "PUBLISHED",
          startDate: new Date("2028-04-01T09:00:00Z"),
          endDate: new Date("2028-04-02T17:00:00Z")
        }
      }
    },
    include: { events: true }
  });
  await prisma.order.create({
    data: {
      orgId: org.id,
      eventId: org.events[0]!.id,
      userId: owner.id,
      total: 10_000,
      platformFee: 500,
      currency: "USD",
      status: "PAID"
    }
  });
  const provisioning = await prisma.organization.create({
    data: {
      name: "Lifecycle Awaiting Owner",
      slug: provisioningSlug,
      subdomain: provisioningSlug,
      contactEmail: platformEmail,
      status: "PROVISIONING",
      statusUpdatedById: platformAdmin.id,
      statusUpdatedAt: new Date()
    }
  });

  orgId = org.id;
  provisioningOrgId = provisioning.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgSlug, provisioningSlug] } } });
  await prisma.user.deleteMany({ where: { email: { in: [platformEmail, ownerEmail] } } });
  await prisma.$disconnect();
});

test("platform lifecycle requires an owner and suspension closes new tenant activity", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform");

  await page.goto(`/platform/organizations/${provisioningOrgId}`);
  await expect(page.getByRole("button", { name: "Activate service" })).toBeDisabled();
  await expect(page.getByText("Activation unlocks after the first owner accepts an invitation.")).toBeVisible();

  await page.goto(`/platform/organizations/${orgId}`);
  const suspension = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/platform/organizations/${orgId}` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Suspend new activity" }).click();
  await suspension;
  await expect.poll(async () => (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).status, { timeout: 30_000 }).toBe("SUSPENDED");

  expect((await page.request.get(`/${orgSlug}`)).status()).toBe(404);
  const apiResponse = await page.request.get("/api/v1/events", {
    headers: { authorization: `Bearer ${apiToken}` }
  });
  expect(apiResponse.status()).toBe(403);
  expect(await apiResponse.json()).toEqual({
    error: { code: "organization_inactive", message: "This organization is not active." }
  });
});

test("organizer data stays readable and reconciliation stays available while suspended", async ({ page }) => {
  await loginAs(page, ownerEmail, "/dashboard");
  await page.goto(`/dashboard/organizations/${orgId}`);
  await expect(page.getByRole("heading", { name: "Lifecycle Organization" })).toBeVisible();
  await expect(page.getByText("Lifecycle Organization is suspended.")).toBeVisible();

  expect((await page.request.get("/dashboard/events/new")).status()).toBe(404);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Create event" })).toHaveCount(0);

  await page.goto(`/dashboard/organizations/${orgId}/billing`);
  await page.getByRole("button", { name: "Run reconciliation" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/organizations/${orgId}/billing\\?reconciled=`), { timeout: 30_000 });
});

test("platform can reactivate and then retire without deleting tenant records", async ({ page }) => {
  const before = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { _count: { select: { members: true, events: true, orders: true, registrations: true } } }
  });
  await loginAs(page, platformEmail, "/platform");
  await page.goto(`/platform/organizations/${orgId}`);

  const activation = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/platform/organizations/${orgId}` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Activate service" }).click();
  await activation;
  await expect.poll(async () => (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).status, { timeout: 30_000 }).toBe("ACTIVE");
  await page.reload();
  const retirement = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/platform/organizations/${orgId}` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Retire organization" }).click();
  await retirement;
  await expect.poll(async () => (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).status, { timeout: 30_000 }).toBe("RETIRED");

  const after = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { status: true, _count: { select: { members: true, events: true, orders: true, registrations: true } } }
  });
  expect(after.status).toBe("RETIRED");
  expect(after._count).toEqual(before._count);
  await page.reload();
  await expect(page.getByRole("button", { name: "Activate service" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Suspend new activity" })).toHaveCount(0);
  expect((await page.request.get(`/${orgSlug}`)).status()).toBe(404);
});
