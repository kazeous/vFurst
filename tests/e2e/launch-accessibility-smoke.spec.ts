import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { createPortalAccountFixture, loginAsAttendee as loginPortalAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = Date.now();
const password = "LaunchA11yPass123!";
const adminEmail = `launch-a11y-admin-${runId}@example.com`;
const attendeeEmail = `launch-a11y-attendee-${runId}@example.com`;
const orgSlug = `launch-a11y-${runId}`;
const visualCheckoutToken = `visual-checkout-${runId}`;
const checkoutSecret = process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum";

let eventId: string;
let visualOrderId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Launch Accessibility Admin",
      ...staffIdentityData()
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Launch Accessibility Convention",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: "accessibility@example.com",
      status: "ACTIVE",
      members: {
        create: {
          userId: admin.id,
          role: "OWNER"
        }
      }
    }
  });

  const attendee = await createPortalAccountFixture(prisma, { orgId: org.id, email: attendeeEmail, name: "Launch Accessibility Attendee", password });
  const adminAttendee = await createPortalAccountFixture(prisma, { orgId: org.id, email: adminEmail, name: "Launch Accessibility Admin", password });

  const event = await prisma.event.create({
    data: {
      orgId: org.id,
      name: "Launch Accessibility 2027",
      slug: "launch-accessibility-2027",
      description: "Accessibility verification event",
      venue: "Verification Hall",
      startDate: new Date("2027-08-01T09:00:00Z"),
      endDate: new Date("2027-08-03T17:00:00Z"),
      status: "PUBLISHED",
      settings: {
        requireApproval: false,
        allowTransfers: true,
        maxRegistrationsPerUser: 1,
        vendorConfig: {
          tableTypes: [{ id: "standard-table", name: "Standard table", price: 0 }],
          amenities: [],
          booths: [{ id: "a-01", label: "A-01", tableType: "Standard table", status: "AVAILABLE" }]
        }
      }
    }
  });

  const registrationType = await prisma.registrationType.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      name: "Launch Accessibility General",
      price: 0,
      maxCapacity: 5000,
      sortOrder: 0
    }
  });

  const registration = await prisma.registration.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      portalAccountId: attendee.id,
      typeId: registrationType.id,
      status: "CONFIRMED",
      badgeNumber: "A11Y-001",
      createdAt: new Date("2026-07-13T09:00:00Z")
    }
  });

  await prisma.order.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      portalAccountId: attendee.id,
      total: 0,
      platformFee: 0,
      status: "PAID",
      items: {
        create: {
          registrationId: registration.id,
          orgId: org.id,
          itemType: "REGISTRATION",
          refId: registration.id,
          unitPrice: 0,
          quantity: 1
        }
      }
    }
  });

  const visualOrder = await prisma.order.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      portalAccountId: adminAttendee.id,
      total: 175000,
      platformFee: 25000,
      currency: "USD",
      checkoutTokenHash: createHmac("sha256", checkoutSecret).update(visualCheckoutToken).digest("hex"),
      checkoutSuccessPath: "/",
      checkoutCancelPath: "/",
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      items: {
        create: {
          orgId: org.id,
          itemType: "PRODUCT",
          refId: randomUUID(),
          unitPrice: 150000,
          quantity: 1
        }
      }
    }
  });

  eventId = event.id;
  visualOrderId = visualOrder.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: orgSlug
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [adminEmail, attendeeEmail]
      }
    }
  });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await loginAsStaffEmail(page, adminEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function loginAsAttendee(page: Page) {
  await loginPortalAttendee(page, { subdomain: orgSlug }, attendeeEmail, { password });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(violations, violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

test("marketing pages expose landmarks, alt text, keyboard order, and calculator labels", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("main")).toBeVisible();
  const marketingNav = page.getByRole("navigation", { name: "Marketing navigation" });

  await expect(marketingNav).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run the whole convention from one calm workspace." })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Convention operations dashboard showing registration, check-in, and volunteer staffing"
    })
  ).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(marketingNav.getByRole("link", { name: "vFurst" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(marketingNav.getByRole("link", { name: "Features", exact: true })).toBeFocused();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/pricing");

  await expect(page.getByRole("region", { name: "Estimate platform fees" })).toBeVisible();
  await expect(page.getByLabel("Attendees")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Hotel rooms")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Store revenue")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Vendor revenue")).toHaveAttribute("type", "range");
  await expectNoSeriousAccessibilityViolations(page);
});

test("public launch forms expose labels, names, and submit actions", async ({ page }) => {
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.stack ?? error.message));
  await loginAsAttendee(page);
  await page.goto(`${portalOrigin(orgSlug)}/register`);
  await expect.poll(async () => ({ ready: await page.locator('[data-registration-ready="true"]').isVisible(), clientErrors }), { timeout: 30_000 }).toEqual({ ready: true, clientErrors: [] });

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Launch Accessibility General/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await page.getByLabel("Full name").fill("Accessibility Attendee");
  await expect(page.getByLabel("Email")).toHaveValue(attendeeEmail);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("button", { name: "Complete registration" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto(`${portalOrigin(orgSlug)}/vendor-apply`);

  await expect(page.getByRole("heading", { name: "Vendor application" })).toBeVisible();
  await expect(page.getByLabel("Contact name")).toBeVisible();
  await expect(page.getByLabel("Contact email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Contact email")).toHaveValue(attendeeEmail);
  await expect(page.getByLabel("Business name")).toBeVisible();
  await expect(page.getByLabel("Product description")).toBeVisible();
  await expect(page.getByLabel("Table type")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit vendor application" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("staff check-in exposes searchable attendee controls and named actions", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/check-in`);
  await expect(page.locator('[data-app-shell-ready="true"]')).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "Staff check-in" })).toBeVisible();
  await expect(page.getByText("Service worker:")).toBeVisible();
  await expect(page.getByLabel("Search or scan")).toBeFocused();

  await page.getByLabel("Search or scan").fill(attendeeEmail);

  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start camera scan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch Accessibility Attendee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();

  const commandTrigger = page.getByRole("button", { name: "Search navigation" });
  await commandTrigger.click();
  await expect(page.getByRole("dialog", { name: "Search navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(commandTrigger).toBeFocused();
  await expectNoSeriousAccessibilityViolations(page);
});

test("mobile organizer shell and public portal avoid horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/check-in`);
  await expect(page.locator('[data-app-shell-ready="true"]')).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByLabel("Organizer workspace")).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).first().click();

  for (const path of [`/dashboard/events/${eventId}/check-in`, `${portalOrigin(orgSlug)}`, `${portalOrigin(orgSlug)}/register`]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  }
});

test("visual regression baselines cover the rebuilt reference surfaces", async ({ page }) => {
  test.setTimeout(180_000);
  const surfaces = [
    { name: "marketing-home", path: "/" },
    { name: "event-overview", path: `/dashboard/events/${eventId}` },
    { name: "registrations", path: `/dashboard/events/${eventId}/registrations` },
    { name: "public-portal", path: `${portalOrigin(orgSlug)}` },
    { name: "checkout", path: `${portalOrigin(orgSlug)}/checkout/${visualOrderId}?token=${encodeURIComponent(visualCheckoutToken)}` }
  ];

  await login(page);
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const surface of surfaces) {
      await page.goto(surface.path);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      if (surface.name === "event-overview" || surface.name === "registrations") {
        await expect(page.locator('[data-app-shell-ready="true"]')).toBeVisible({ timeout: 30_000 });
      }
      const masks: Locator[] = [];
      if (surface.name === "checkout") masks.push(page.getByText(/^Order [A-Z0-9]+$/));
      if (surface.name === "registrations") masks.push(page.getByText(attendeeEmail, { exact: true }));
      await expect(page).toHaveScreenshot(`${surface.name}-${viewport.name}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        mask: masks
      });
    }
  }
});
