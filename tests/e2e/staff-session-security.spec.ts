import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaffFixture, loginAsStaff, mockStaffClaims, type StaffFixture } from "./support/staff";

const prisma = new PrismaClient();
const run = `staff-security-${Date.now()}-${process.pid}`;
let owner: StaffFixture;
let admin: StaffFixture;
let other: StaffFixture;
let orgId: string;
test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });
test.beforeAll(async () => {
  [owner, admin, other] = await Promise.all([
    createStaffFixture(prisma, { email: `${run}-owner@example.com` }),
    createStaffFixture(prisma, { email: `${run}-admin@example.com`, platformRole: "PLATFORM_ADMIN" }),
    createStaffFixture(prisma, { email: `${run}-other@example.com` })
  ]);
  orgId = (await prisma.organization.create({ data: { name: run, slug: run, subdomain: run, status: "ACTIVE", contactEmail: `${run}@example.com`, members: { create: { userId: owner.id, role: "OWNER" } } } })).id;
});
test.afterAll(async () => {
  if (orgId) await prisma.organization.deleteMany({ where: { id: orgId, slug: run } });
  if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner.id, admin.id, other.id] } } });
  await prisma.$disconnect();
});
async function storedSession(userId: string) {
  return prisma.session.findFirstOrThrow({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
}
async function completeMock(page: Page, staff: StaffFixture, overrides: Parameters<typeof mockStaffClaims>[0] = { email: staff.email }) {
  await page.waitForURL((url) => url.port === "8090");
  await page.locator('input[name="username"]').fill(staff.sub);
  await page.locator('textarea[name="claims"]').fill(JSON.stringify(mockStaffClaims({ email: staff.email, groups: staff.groups, ...overrides })));
  await page.locator('input[type="submit"]').click();
  await page.waitForURL((url) => url.origin === "http://localhost:3000", { waitUntil: "load" });
}

for (const reason of ["revoked", "expired", "deleted", "idle"] as const) {
  test(`a ${reason} staff session stays rejected on repeated reads of the original cookie`, async ({ page, context }) => {
    await loginAsStaff(page, owner);
    const session = await storedSession(owner.id);
    const originalCookie = (await context.cookies("http://localhost:3000")).filter((cookie) => cookie.name.startsWith("vfurst-staff")).map(({ name, value }) => `${name}=${value}`).join("; ");
    expect(originalCookie).toBeTruthy();
    if (reason === "deleted") await prisma.session.delete({ where: { id: session.id } });
    else await prisma.session.update({ where: { id: session.id }, data: {
      ...(reason === "revoked" ? { revokedAt: new Date(), idToken: null } : {}),
      ...(reason === "expired" ? { expires: new Date(Date.now() - 1_000) } : {}),
      ...(reason === "idle" ? { idleExpiresAt: new Date(Date.now() - 1_000) } : {})
    } });
    const count = await prisma.session.count({ where: { userId: owner.id } });
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await page.request.get("/api/auth/session", { headers: { cookie: originalCookie } });
      expect(await response.json()).toBeNull();
    }
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(count);
    await page.goto("/dashboard");
    await expect(page).toHaveURL((url) => url.pathname === "/login");
  });
}

test("a five-minute IdP lease renews the same session and preserves its absolute deadline", async ({ page }) => {
  const sid = `${run}-lease`;
  await loginAsStaff(page, { ...owner, sid });
  const before = await storedSession(owner.id);
  await prisma.session.update({ where: { id: before.id }, data: { idpValidUntil: new Date(Date.now() - 1_000) } });
  await page.goto("/dashboard");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  await page.getByRole("button", { name: "Sign in with your Reyuu Games account" }).click();
  await page.waitForURL((url) => url.port === "8090");
  expect(new URL(page.url()).searchParams.get("prompt")).toBe("none");
  await completeMock(page, owner, { email: owner.email, sid, authenticatedAt: before.primaryAuthenticatedAt!.getTime() / 1_000 });
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");
  const after = await storedSession(owner.id);
  expect(after.id).toBe(before.id);
  expect(after.expires).toEqual(before.expires);
  expect(after.primaryAuthenticatedAt).toEqual(before.primaryAuthenticatedAt);
  expect(after.idpValidUntil!.getTime()).toBeGreaterThan(Date.now());
});

test("a silent IdP check cannot switch to another account", async ({ page }) => {
  await loginAsStaff(page, owner);
  const before = await storedSession(owner.id);
  await prisma.session.update({ where: { id: before.id }, data: { idpValidUntil: new Date(Date.now() - 1_000) } });
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with your Reyuu Games account" }).click();
  await completeMock(page, other);
  await expect(page.getByTestId("login-error")).toContainText("account changed");
  expect(await prisma.session.count({ where: { userId: other.id } })).toBe(0);
});

test("step-up requires new primary authentication and MFA and preserves the session deadline", async ({ page }) => {
  await loginAsStaff(page, owner);
  const before = await storedSession(owner.id);
  await page.goto("/staff/verify?returnTo=/dashboard");
  await page.getByRole("button", { name: "Verify your account", exact: true }).click();
  await page.waitForURL((url) => url.port === "8090");
  expect(new URL(page.url()).searchParams.get("prompt")).toBe("login");
  expect(new URL(page.url()).searchParams.get("max_age")).toBe("10");
  await completeMock(page, owner);
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");
  const after = await storedSession(owner.id);
  expect(after.id).toBe(before.id);
  expect(after.expires).toEqual(before.expires);
});

for (const proof of ["stale", "missing-mfa"] as const) {
  test(`step-up rejects ${proof} proof even in a freshly issued ID token`, async ({ page }) => {
    await loginAsStaff(page, owner);
    const before = await storedSession(owner.id);
    await page.goto("/staff/verify?returnTo=/dashboard");
    await page.getByRole("button", { name: "Verify your account", exact: true }).click();
    await completeMock(page, owner, { email: owner.email, ...(proof === "stale" ? { authenticatedAt: Math.floor(Date.now() / 1_000) - 3_600 } : { mfa: false }) });
    await expect(page.getByTestId("login-error")).toContainText("passkey or authenticator code");
    expect((await storedSession(owner.id)).id).toBe(before.id);
  });
}

test("an expired MFA proof keeps an organizer form's entries and blocks the mutation", async ({ page }) => {
  await loginAsStaff(page, admin, { expectPath: "/platform" });
  await page.goto("/platform/organizations/new");
  await page.getByLabel("Name", { exact: true }).fill("Preserve this name");
  await page.getByLabel("Subdomain slug").fill(`${run}-blocked`);
  await page.getByLabel("Contact email").fill("contact@example.com");
  await page.getByLabel("Initial owner email").fill("owner@example.com");
  const session = await storedSession(admin.id);
  const stale = new Date(Date.now() - 3_600_000);
  await prisma.session.update({ where: { id: session.id }, data: { primaryAuthenticatedAt: stale, mfaVerifiedAt: stale } });
  await page.getByRole("button", { name: "Provision organization" }).click();
  await expect(page.getByTestId("create-organization-error")).toContainText("Verify your Reyuu Games account");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Preserve this name");
  await expect(page.getByRole("link", { name: "Verify your account" })).toHaveAttribute("target", "_blank");
  expect(await prisma.organization.count({ where: { slug: `${run}-blocked` } })).toBe(0);
});

test("session management cannot revoke a different staff user's session", async ({ page, browser }) => {
  await loginAsStaff(page, owner);
  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await loginAsStaff(otherPage, other);
    const foreign = await storedSession(other.id);
    await page.goto("/staff/sessions");
    const form = page.locator('form:has(input[name="sessionId"])').first();
    await form.locator('input[name="sessionId"]').evaluate((element, id) => { (element as HTMLInputElement).value = id; }, foreign.id);
    await form.getByRole("button", { name: "End session" }).click();
    await expect(form.getByRole("alert")).toContainText("already ended");
    expect((await prisma.session.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt).toBeNull();
  } finally { await otherContext.close(); }
});

test("logout everywhere rejects another live session and an earlier in-flight sign-in", async ({ page, browser }) => {
  await loginAsStaff(page, owner);
  const pendingContext = await browser.newContext();
  try {
    const pending = await pendingContext.newPage();
    await pending.goto("/login");
    await pending.getByRole("button", { name: "Sign in with your Reyuu Games account" }).click();
    await pending.waitForURL((url) => url.port === "8090");
    await page.goto("/staff/sessions");
    await page.getByRole("button", { name: "Log out of all vFurst sessions" }).click();
    await page.waitForURL("http://localhost:3000/", { waitUntil: "load" });
    await completeMock(pending, owner);
    await expect(pending).toHaveURL((url) => url.pathname === "/login");
    expect(await prisma.session.count({ where: { userId: owner.id, revokedAt: null } })).toBe(0);
  } finally { await pendingContext.close(); }
});

test("tenant hosts never expose staff Auth.js routes or set staff cookies", async ({ request }) => {
  for (const path of ["/api/auth/session", "/api/auth/csrf", "/api/oidc/backchannel-logout"]) {
    const response = await request.get(`http://${run}.localhost:3000${path}`);
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});
