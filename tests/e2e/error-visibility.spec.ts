import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

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
  const [user, member] = await Promise.all([
    prisma.user.create({ data: { email: userEmail, name: "Error Visibility User", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: memberEmail, name: "Error Visibility Member", ...staffIdentityData() } })
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
  await createPortalAccountFixture(prisma, { orgId: org.id, email: userEmail, name: "Error Visibility User", password });
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

async function login(page: Page, returnTo: string) {
  await loginAsStaffEmail(page, userEmail, { returnTo });
}

test("an identity-provider error renders inline on /login with no 500", async ({ page }) => {
  const serverErrors: number[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(response.status());
  });

  await page.goto("/login?error=OAuthCallbackError&returnTo=%2Fdashboard");
  const alert = page.getByTestId("login-error");
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toHaveText("Sign-in did not complete. Try again.");
  await expect(page.getByRole("heading", { name: "Sign in to vFurst" })).toBeVisible();

  await page.goto("/login?error=StudioAccountConflict");
  await expect(page.getByTestId("login-error")).toHaveText(
    "This Reyuu Games account uses an email that already belongs to another vFurst staff account. Contact a platform administrator."
  );
  expect(serverErrors).toEqual([]);

  await loginAsStaffEmail(page, userEmail, { returnTo: "/dashboard" });
});

test("an invalid voucher renders inline, keeps entered values, and allows retry", async ({ page }) => {
  await loginAsAttendee(page, { subdomain: orgSlug }, userEmail, { password });

  await page.goto(`${portalOrigin(orgSlug)}/register`);
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
