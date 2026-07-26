import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "ErrorVisibilityPass123!";
const userEmail = `error-visibility-user-${runId}@example.com`;
const orgSlug = `error-visibility-org-${runId}`;
let userId: string;

test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: userEmail, name: "Error Visibility User", passwordHash: await bcrypt.hash(password, 12) }
  });
  userId = user.id;

  const org = await prisma.organization.create({
    data: {
      name: "Error Visibility Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: userEmail,
      status: "ACTIVE",
      events: {
        create: {
          name: "Error Visibility Event",
          slug: "error-visibility-event",
          status: "PUBLISHED",
          startDate: new Date("2028-05-01T09:00:00Z"),
          endDate: new Date("2028-05-02T17:00:00Z"),
          settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 5 }
        }
      }
    },
    include: { events: true }
  });
  await prisma.registrationType.create({
    data: { orgId: org.id, eventId: org.events[0]!.id, name: "Error Visibility Ticket", price: 0 }
  });
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

async function submitLogin(page: Page) {
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
}

async function login(page: Page, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(password);
  await submitLogin(page);
  await page.waitForURL((url) => url.pathname.startsWith(returnTo));
}

test("a wrong password stays on /login with an accessible message and no 500", async ({ page }) => {
  const serverErrors: number[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(response.status());
  });

  await page.goto("/login?returnTo=%2Faccount");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill("WrongPassword123!");
  await submitLogin(page);

  await page.waitForURL(/\/login\?error=invalid_credentials&returnTo=%2Faccount$/);
  const alert = page.getByTestId("login-error");
  await expect(alert).toContainText("The email or password was not accepted.");
  await expect(page.getByRole("heading", { name: "Log in to vFurst" })).toBeVisible();
  expect(serverErrors).toEqual([]);

  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(password);
  await submitLogin(page);
  await page.waitForURL((url) => url.pathname.startsWith("/account"));
});

test("an invalid voucher renders the route error boundary with a working retry", async ({ page }) => {
  await login(page, "/account");

  await page.goto(`/${orgSlug}/register`);
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Voucher code/).fill(`INVALID-${runId}`);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review registration" })).toBeVisible();
  await page.getByRole("button", { name: "Complete registration" }).click();

  const boundary = page.getByTestId("route-error");
  await expect(boundary).toBeVisible();
  await expect(boundary.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);

  await boundary.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
});
