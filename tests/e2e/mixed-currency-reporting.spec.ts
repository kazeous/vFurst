import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "CurrencyReportPass123!";
const ownerEmail = `currency-report-owner-${runId}@example.com`;
const orgSlug = `currency-report-${runId}`;

let orgId: string;
let usdEventId: string;
let vndEventId: string;
let vndOrderId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

async function login(page: Page) {
  await page.goto("/login?returnTo=%2Fdashboard");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: "Currency Report Owner",
      passwordHash
    }
  });
  const org = await prisma.organization.create({
    data: {
      name: "Currency Report Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: {
        create: {
          userId: owner.id,
          role: "OWNER"
        }
      },
      events: {
        create: [
          {
            name: "USD Reporting Event",
            slug: "usd-reporting-event",
            currency: "USD",
            status: "PUBLISHED",
            startDate: new Date("2028-11-01T09:00:00Z"),
            endDate: new Date("2028-11-02T17:00:00Z")
          },
          {
            name: "VND Reporting Event",
            slug: "vnd-reporting-event",
            currency: "VND",
            status: "PUBLISHED",
            startDate: new Date("2028-12-01T09:00:00Z"),
            endDate: new Date("2028-12-02T17:00:00Z")
          }
        ]
      }
    },
    include: {
      events: true
    }
  });

  orgId = org.id;
  usdEventId = org.events.find((event) => event.currency === "USD")!.id;
  vndEventId = org.events.find((event) => event.currency === "VND")!.id;

  const [, vndOrder] = await Promise.all([
    prisma.order.create({
      data: {
        orgId,
        eventId: usdEventId,
        userId: owner.id,
        total: 10_000,
        platformFee: 100,
        currency: "USD",
        status: "PAID",
        items: {
          create: {
            orgId,
            itemType: "PRODUCT",
            refId: randomUUID(),
            unitPrice: 10_000,
            quantity: 1
          }
        }
      }
    }),
    prisma.order.create({
      data: {
        orgId,
        eventId: vndEventId,
        userId: owner.id,
        total: 1_000_000,
        platformFee: 10_000,
        currency: "VND",
        status: "PAID",
        items: {
          create: {
            orgId,
            itemType: "PRODUCT",
            refId: randomUUID(),
            unitPrice: 1_000_000,
            quantity: 1
          }
        }
      }
    })
  ]);
  vndOrderId = vndOrder.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
  await prisma.$disconnect();
});

test("organization billing keeps USD cents and VND dong in separate reports", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/organizations/${orgId}/billing`);

  const usdReport = page.getByRole("heading", { name: "USD fee report" }).locator("xpath=ancestor::section[1]");
  const vndReport = page.getByRole("heading", { name: "VND fee report" }).locator("xpath=ancestor::section[1]");

  await expect(usdReport).toContainText("$100.00");
  await expect(usdReport).toContainText("$1.00");
  await expect(vndReport).toContainText(/1[.,]000[.,]000\s*₫|₫\s*1[.,]000[.,]000/);
  await expect(vndReport).toContainText(/10[.,]000\s*₫|₫\s*10[.,]000/);
  await expect(page.getByText("$10,100.00", { exact: true })).toHaveCount(0);
});

test("event analytics and CSV retain the event currency contract", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${usdEventId}/analytics`);
  await expect(page.getByText("$100.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$1.00", { exact: true }).first()).toBeVisible();

  const response = await page.request.get(`/dashboard/events/${vndEventId}/analytics/export`);
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv).toContain('"Paid revenue (VND whole dong)","1000000"');
  expect(csv).toContain('"Collected fees (VND whole dong)","10000"');
  expect(csv).toContain('"Currency","Order total (minor units)"');
  expect(csv).toContain(vndOrderId);
  expect(csv).toContain('"VND"');
  expect(csv).not.toContain("cents");
});
