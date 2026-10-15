import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";
import { loginWithCredentials } from "./support/credentials-login";
import { createPortalAccountFixture, E2E_PORTAL_PASSWORD, loginAsAttendee, portalOrigin } from "./support/portal";

const prisma = new PrismaClient();
const run = `${Date.now()}-${process.pid}`;
const subA = `portal-attendee-a-${run}`;
const subB = `portal-attendee-b-${run}`;
const originA = portalOrigin(subA);
const originB = portalOrigin(subB);
const email = `portal-attendee-${run}@example.com`;
const ownerEmail = `portal-cashier-${run}@example.com`;
const walkInEmail = `walk.in-${run}@example.com`;
const checkoutSecret = process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum";
let ownerId: string;
let orgA: { id: string; name: string; subdomain: string };
let orgB: { id: string; name: string; subdomain: string };
let eventA: { id: string; name: string };
let eventB: { id: string; name: string };
let accountA: { id: string; email: string };
let accountB: { id: string; email: string };
let typeAId: string;
let typeBId: string;
let previousStripe: { enabled: boolean; settings: Prisma.JsonValue; updatedById: string | null } | null | undefined;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { email: ownerEmail, name: "Portal Cashier", passwordHash: await bcrypt.hash(E2E_PORTAL_PASSWORD, 12) }
  });
  ownerId = owner.id;
  [orgA, orgB] = await Promise.all([subA, subB].map((subdomain) => prisma.organization.create({
    data: {
      name: `Portal Attendee ${subdomain}`, slug: subdomain, subdomain, status: "ACTIVE", contactEmail: ownerEmail,
      members: { create: { userId: ownerId, role: "OWNER" } },
      stripeConnect: { create: { stripeAccountId: `acct_${subdomain}`, onboardingComplete: true } }
    }
  })));
  [eventA, eventB] = await Promise.all([orgA, orgB].map((org, index) => prisma.event.create({
    data: {
      orgId: org.id, name: `Independent Event ${index === 0 ? "A" : "B"} ${run}`, slug: `attendee-event-${index}`,
      status: "PUBLISHED", currency: "USD", startDate: new Date("2028-10-01T09:00:00Z"), endDate: new Date("2028-10-02T17:00:00Z"),
      settings: { maxRegistrationsPerUser: 5, requireApproval: false }
    }
  })));
  [accountA, accountB] = await Promise.all([orgA, orgB].map((org) => createPortalAccountFixture(prisma, { orgId: org.id, email, name: "Independent Attendee" })));
  const types = await Promise.all([{ org: orgA, event: eventA }, { org: orgB, event: eventB }].map(({ org, event }) => prisma.registrationType.create({
    data: { orgId: org.id, eventId: event.id, name: "Portal Paid Ticket", price: 2500 }
  })));
  typeAId = types[0]!.id;
  typeBId = types[1]!.id;
  previousStripe = await prisma.paymentProviderConfig.findUnique({ where: { provider: "STRIPE" }, select: { enabled: true, settings: true, updatedById: true } });
  await prisma.paymentProviderConfig.upsert({ where: { provider: "STRIPE" }, create: { provider: "STRIPE", enabled: true, settings: {} }, update: { enabled: true } });
});

test.afterAll(async () => {
  try {
    if (previousStripe) {
      await prisma.paymentProviderConfig.update({ where: { provider: "STRIPE" }, data: { ...previousStripe, settings: previousStripe.settings as Prisma.InputJsonValue } });
    } else if (previousStripe === null) {
      await prisma.paymentProviderConfig.deleteMany({ where: { provider: "STRIPE" } });
    }
    await prisma.organization.deleteMany({ where: { id: { in: [orgA?.id, orgB?.id].filter(Boolean) } } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  } finally {
    await prisma.$disconnect();
  }
});

async function reviewRegistration(page: Page) {
  await loginAsAttendee(page, orgA, email, { returnTo: "/register" });
  await expect(page.locator('[data-registration-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review registration" })).toBeVisible();
}

test("a registration posted with another organization's event is not found", async ({ page }) => {
  await reviewRegistration(page);
  await page.locator('input[name="eventId"]').evaluate((input, eventId) => { (input as HTMLInputElement).value = eventId; }, eventB.id);
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This page could not be found.", exact: true })).toBeVisible();
  expect(await prisma.registration.count({ where: { eventId: eventB.id } })).toBe(0);
});

test("a signed-out registration submit returns to this portal's sign-in", async ({ page, context }) => {
  await reviewRegistration(page);
  await context.clearCookies({ name: "vfurst-portal" });
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await expect(page).toHaveURL(`${originA}/login?returnTo=%2Fregister`);
  expect(await prisma.registration.count({ where: { eventId: eventA.id } })).toBe(0);
});

test("checkout runs on the portal host and rejects another organization's order", async ({ page }) => {
  await reviewRegistration(page);
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await page.waitForURL((url) => url.origin === originA && url.pathname.startsWith("/checkout/") && !!url.searchParams.get("token"), { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "Choose how to pay" })).toBeVisible();
  const registration = await prisma.registration.findFirstOrThrow({ where: { orgId: orgA.id, portalAccountId: accountA.id, typeId: typeAId } });
  expect(registration.status).toBe("PENDING");
  const token = `foreign-order-${run}`;
  const foreign = await prisma.order.create({ data: {
    orgId: orgB.id, eventId: eventB.id, portalAccountId: accountB.id, total: 2500, platformFee: 100, currency: "USD",
    checkoutTokenHash: createHmac("sha256", checkoutSecret).update(token).digest("hex"), checkoutSuccessPath: "/", checkoutCancelPath: "/",
    checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
  } });
  const response = await page.goto(`${originA}/checkout/${foreign.id}?token=${token}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page could not be found.", exact: true })).toBeVisible();
});

test("a cashier walk-in can be claimed through sign-up and shows the registration", async ({ page, browser }) => {
  await loginWithCredentials(page, ownerEmail, E2E_PORTAL_PASSWORD);
  await page.goto(`/dashboard/events/${eventA.id}/check-in/cashier`);
  await page.getByLabel("Attendee name", { exact: true }).fill("Claimed Walk-in");
  await page.getByLabel("Attendee email", { exact: true }).fill(`Walk.In-${run}@Example.COM`);
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await expect.poll(() => prisma.registration.count({ where: { orgId: orgA.id, portalAccount: { email: walkInEmail } } })).toBe(1);
  const unclaimed = await prisma.portalAccount.findUniqueOrThrow({ where: { orgId_email: { orgId: orgA.id, email: walkInEmail } } });
  expect(unclaimed.passwordHash).toBeNull();
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    const attendeePage = await context.newPage();
    await attendeePage.goto(`${originA}/signup?returnTo=%2Faccount%2Fregistrations`);
    await attendeePage.getByLabel("Email", { exact: true }).fill(walkInEmail);
    await attendeePage.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(attendeePage.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
    type Message = { ID: string; Subject: string; To: { Address: string }[] };
    let message: Message | undefined;
    await expect.poll(async () => {
      const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
      expect(response.ok).toBe(true);
      const body = await response.json() as { messages: Message[] };
      message = body.messages.find((entry) => entry.To.some((recipient) => recipient.Address === walkInEmail) && entry.Subject === `Finish creating your ${orgA.name} account`);
      return !!message;
    }, { timeout: 20_000 }).toBe(true);
    const detail = await fetch(`http://127.0.0.1:8025/api/v1/message/${message!.ID}`);
    expect(detail.ok).toBe(true);
    const mail = await detail.json() as { Text: string };
    const link = mail.Text.match(/https?:\/\/[^\s]+/)?.[0];
    expect(link).toBeTruthy();
    expect(new URL(link!).origin).toBe(originA);
    await attendeePage.goto(link!);
    await attendeePage.getByLabel("Name", { exact: true }).fill("Claimed Walk-in");
    await attendeePage.getByLabel("New password", { exact: true }).fill(E2E_PORTAL_PASSWORD);
    await attendeePage.getByLabel("Confirm password", { exact: true }).fill(E2E_PORTAL_PASSWORD);
    const loaded = attendeePage.waitForEvent("load");
    await attendeePage.getByRole("button", { name: "Save password", exact: true }).click();
    await loaded;
    await expect(attendeePage).toHaveURL(`${originA}/account/registrations`);
    await expect(attendeePage.getByRole("heading", { name: eventA.name, exact: true, level: 3 }).first()).toBeVisible();
    const claimed = await prisma.portalAccount.findUniqueOrThrow({ where: { id: unclaimed.id } });
    expect(claimed.passwordHash).not.toBeNull();
    expect(claimed.emailVerifiedAt).not.toBeNull();
  } finally {
    await context.close();
  }
});

test("the same email at two organizations is two independent accounts", async ({ page, context }) => {
  await Promise.all([{ org: orgA, event: eventA, account: accountA, typeId: typeAId }, { org: orgB, event: eventB, account: accountB, typeId: typeBId }].map(({ org, event, account, typeId }) => prisma.registration.create({
    data: { orgId: org.id, eventId: event.id, portalAccountId: account.id, typeId, status: "CONFIRMED" }
  })));
  expect(accountA.id).not.toBe(accountB.id);
  await loginAsAttendee(page, orgA, email, { returnTo: "/account/registrations" });
  await expect(page.getByRole("heading", { name: eventA.name, exact: true, level: 3 }).first()).toBeVisible();
  await expect(page.getByText(eventB.name)).toHaveCount(0);
  await loginAsAttendee(page, orgB, email, { returnTo: "/account/registrations" });
  await expect(page.getByRole("heading", { name: eventB.name, exact: true, level: 3 }).first()).toBeVisible();
  await expect(page.getByText(eventA.name)).toHaveCount(0);
  expect((await context.cookies(originA)).some((cookie) => cookie.name === "vfurst-portal")).toBe(true);
  expect((await context.cookies(originB)).some((cookie) => cookie.name === "vfurst-portal")).toBe(true);
});
