import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "ErrorVisibilityPass123!";
const userEmail = `error-visibility-user-${runId}@example.com`;
const memberEmail = `error-visibility-member-${runId}@example.com`;
const orgSlug = `error-visibility-org-${runId}`;
const boundaryOrgSlug = `error-visibility-boundary-${runId}`;
let userId: string;
let memberId: string;
let boundaryOrgId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user, member] = await Promise.all([
    prisma.user.create({ data: { email: userEmail, name: "Error Visibility User", passwordHash } }),
    prisma.user.create({ data: { email: memberEmail, name: "Error Visibility Member", passwordHash } })
  ]);
  userId = user.id;
  memberId = member.id;

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

  const boundaryOrg = await prisma.organization.create({
    data: {
      name: "Error Visibility Boundary Organization",
      slug: boundaryOrgSlug,
      subdomain: boundaryOrgSlug,
      contactEmail: userEmail,
      status: "ACTIVE",
      members: {
        create: [
          { userId: user.id, role: "OWNER" },
          { userId: member.id, role: "MEMBER" }
        ]
      }
    }
  });
  boundaryOrgId = boundaryOrg.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgSlug, boundaryOrgSlug] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, memberId] } } });
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

test("an invalid voucher renders inline, keeps entered values, and allows retry", async ({ page }) => {
  await login(page, "/account");

  await page.goto(`/${orgSlug}/register`);
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Voucher code/).fill(`INVALID-${runId}`);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review registration" })).toBeVisible();
  await page.getByRole("button", { name: "Complete registration" }).click();

  const inline = page.getByTestId("registration-error");
  await expect(inline).toContainText("Voucher code was not found.");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review registration" })).toBeVisible();
  await expect(page.locator("dl.vf-review-list")).toContainText(`INVALID-${runId}`);
  await expect(page.getByRole("button", { name: "Complete registration" })).toBeEnabled();
});

test("inviting an existing member renders inline, keeps the email, and does not create an invitation", async ({ page }) => {
  const serverErrors: number[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(response.status());
  });
  await login(page, "/dashboard");

  await page.goto(`/dashboard/organizations/${boundaryOrgId}/members`);
  const inviteForm = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
  await inviteForm.locator('input[name="email"]').fill(memberEmail);
  await inviteForm.getByRole("button").first().click();

  await expect(page.getByTestId("invite-member-error")).toContainText(
    "This email already belongs to an organization member."
  );
  await expect(inviteForm.locator('input[name="email"]')).toHaveValue(memberEmail);
  await expect(inviteForm.getByRole("button", { name: "Send invitation" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect.poll(() => prisma.orgInvitation.count({ where: { orgId: boundaryOrgId, email: memberEmail } })).toBe(0);
  expect(serverErrors).toEqual([]);
});
