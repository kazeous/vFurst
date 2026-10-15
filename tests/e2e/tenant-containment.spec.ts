import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "ContainmentPass123!";
const platformAdminEmail = `containment-platform-${runId}@example.com`;
const ownerEmail = `containment-owner-${runId}@example.com`;
const memberEmail = `containment-member-${runId}@example.com`;
const foreignOwnerEmail = `containment-foreign-${runId}@example.com`;
const publicEmail = `containment-public-${runId}@example.com`;
const orgASlug = `containment-a-${runId}`;
const orgBSlug = `containment-b-${runId}`;

let orgAId: string;
let orgBId: string;
let eventAId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [platformAdmin, owner, member, foreignOwner, publicUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: platformAdminEmail,
        name: "Containment Platform Admin",
        passwordHash,
        platformRole: "PLATFORM_ADMIN"
      }
    }),
    prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Containment Owner",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: memberEmail,
        name: "Containment Member",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: foreignOwnerEmail,
        name: "Containment Foreign Owner",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: publicEmail,
        name: "Containment Public User",
        passwordHash
      }
    })
  ]);

  const orgA = await prisma.organization.create({
    data: {
      name: "Containment Organization A",
      slug: orgASlug,
      subdomain: orgASlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: member.id, role: "MEMBER" }
        ]
      },
      events: {
        create: {
          name: "Containment Event A",
          slug: "containment-event-a",
          startDate: new Date("2027-09-01T09:00:00Z"),
          endDate: new Date("2027-09-02T17:00:00Z")
        }
      }
    },
    include: {
      events: true
    }
  });

  const orgB = await prisma.organization.create({
    data: {
      name: "Containment Organization B",
      slug: orgBSlug,
      subdomain: orgBSlug,
      contactEmail: foreignOwnerEmail,
      status: "ACTIVE",
      members: {
        create: {
          userId: foreignOwner.id,
          role: "OWNER"
        }
      },
      events: {
        create: {
          name: "Containment Event B",
          slug: "containment-event-b",
          startDate: new Date("2027-10-01T09:00:00Z"),
          endDate: new Date("2027-10-02T17:00:00Z")
        }
      }
    }
  });

  orgAId = orgA.id;
  orgBId = orgB.id;
  eventAId = orgA.events[0]!.id;

  expect(platformAdmin.platformRole).toBe("PLATFORM_ADMIN");
  expect(publicUser.platformRole).toBe("USER");
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgASlug, orgBSlug]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [platformAdminEmail, ownerEmail, memberEmail, foreignOwnerEmail, publicEmail]
      }
    }
  });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

test("platform admin enters the control plane but not tenant organizer routes without membership", async ({ page }) => {
  await loginAs(page, platformAdminEmail);
  await expect(page).toHaveURL(/\/platform$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible({ timeout: 30_000 });

  const navigation = page.getByRole("navigation", { name: "Platform navigation" });
  await expect(navigation.getByRole("link", { name: "Organizations" })).toBeVisible();

  await page.goto("/platform/organizations");
  await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
  await page.goto("/platform/organizations/new");
  await expect(page.getByRole("heading", { name: "Provision organization" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/platform$/);

  await page.goto("/dashboard/organizations");
  await expect(page).toHaveURL(/\/platform(?:\/organizations)?$/);

  const tenantRoute = await page.request.get(`/dashboard/organizations/${orgAId}`, { maxRedirects: 0 });
  expect(tenantRoute.status()).toBe(307);
  expect(tenantRoute.headers().location).toBe("/platform");
  const eventRoute = await page.request.get("/dashboard/events/new", { maxRedirects: 0 });
  expect(eventRoute.status()).toBe(307);
  expect(eventRoute.headers().location).toBe("/platform");
});

test("organization owner sees only their tenant and cannot reach provisioning", async ({ page }) => {
  await loginAs(page, ownerEmail);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });

  const navigation = page.getByRole("navigation", { name: "Dashboard navigation" });
  await expect(navigation.getByRole("link", { name: "Organizations" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New organization" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create event" })).toBeVisible();

  expect((await page.request.get("/dashboard/organizations")).status()).toBe(404);
  expect((await page.request.get("/dashboard/organizations/new")).status()).toBe(404);
  expect((await page.request.get("/platform")).status()).toBe(404);
  expect((await page.request.get(`/dashboard/organizations/${orgBId}`)).status()).toBe(404);
  expect((await page.request.get(`/dashboard/organizations/${orgBId}/members`)).status()).toBe(404);
  expect((await page.request.get(`/dashboard/organizations/${orgBId}/stripe-connect`)).status()).toBe(404);

  await page.goto(`/dashboard/organizations/${orgAId}`);
  await expect(page.getByRole("heading", { name: "Containment Organization A" })).toBeVisible();

  await page.goto("/dashboard/events/new");
  const organizationSelect = page.locator('form.vf-wizard select[name="orgId"]');
  await expect(organizationSelect.locator("option")).toHaveCount(1);
  await expect(organizationSelect).toHaveValue(orgAId);
  await expect(organizationSelect.locator("option")).toHaveText("Containment Organization A");

  await page.goto("/dashboard/events");
  await expect(page.getByRole("link", { name: "Containment Event A" })).toBeVisible();
  await expect(page.getByText("Containment Event B")).toHaveCount(0);
});

test("member role cannot enter owner-admin organization or event-management routes", async ({ page }) => {
  await loginAs(page, memberEmail);
  const response = await page.goto("/dashboard");

  expect(response?.status()).toBe(403);
  await expect(page.getByTestId("dashboard-access-denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer access required" })).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to vFurst" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Open my account" })).toHaveCount(0);
  expect((await page.request.get(`/dashboard/organizations/${orgAId}`)).status()).toBe(403);
  expect((await page.request.get(`/dashboard/events/${eventAId}`)).status()).toBe(403);
  expect((await page.request.get("/dashboard/events/new")).status()).toBe(403);
});

test("public account receives no tenant inventory or organizer actions", async ({ page }) => {
  await loginAs(page, publicEmail);
  const response = await page.goto("/dashboard");

  expect(response?.status()).toBe(403);
  await expect(page.getByTestId("dashboard-access-denied")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer access required" })).toBeVisible();
  await expect(page.getByText(publicEmail)).toBeVisible();
  expect((await page.request.get("/platform")).status()).toBe(404);
  expect((await page.request.get("/dashboard/organizations")).status()).toBe(403);
  expect((await page.request.get(`/dashboard/organizations/${orgAId}`)).status()).toBe(403);
  expect((await page.request.get("/dashboard/events/new")).status()).toBe(403);
});
