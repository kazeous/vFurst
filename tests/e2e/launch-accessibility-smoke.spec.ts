import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = Date.now();
const password = "LaunchA11yPass123!";
const adminEmail = `launch-a11y-admin-${runId}@example.com`;
const attendeeEmail = `launch-a11y-attendee-${runId}@example.com`;
const orgSlug = `launch-a11y-${runId}`;

let eventId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Launch Accessibility Admin",
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  const attendee = await prisma.user.create({
    data: {
      email: attendeeEmail,
      name: "Launch Accessibility Attendee"
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Launch Accessibility Convention",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: "accessibility@example.com",
      members: {
        create: {
          userId: admin.id,
          role: "OWNER"
        }
      }
    }
  });

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
      userId: attendee.id,
      typeId: registrationType.id,
      status: "CONFIRMED",
      badgeNumber: "A11Y-001"
    }
  });

  await prisma.order.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      userId: attendee.id,
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

  eventId = event.id;
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
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
}

test("marketing pages expose landmarks, alt text, keyboard order, and calculator labels", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("main")).toBeVisible();
  const marketingNav = page.getByRole("navigation", { name: "Marketing navigation" });

  await expect(marketingNav).toBeVisible();
  await expect(page.getByRole("heading", { name: "vFurst" })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Live convention operations dashboard showing registration, check-in, and volunteer staffing"
    })
  ).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(marketingNav.getByRole("link", { name: "vFurst" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(marketingNav.getByRole("link", { name: "Features", exact: true })).toBeFocused();

  await page.goto("/pricing");

  await expect(page.getByRole("region", { name: "Estimate platform fees" })).toBeVisible();
  await expect(page.getByLabel("Attendees")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Hotel rooms")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Store revenue")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Vendor revenue")).toHaveAttribute("type", "range");
});

test("public launch forms expose labels, names, and submit actions", async ({ page }) => {
  await page.goto(`/${orgSlug}/register`);

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Register" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Launch Accessibility General/ })).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();

  await page.goto(`/${orgSlug}/vendor-apply`);

  await expect(page.getByRole("heading", { name: "Vendor application" })).toBeVisible();
  await expect(page.getByLabel("Contact name")).toBeVisible();
  await expect(page.getByLabel("Contact email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Business name")).toBeVisible();
  await expect(page.getByLabel("Product description")).toBeVisible();
  await expect(page.getByLabel("Table type")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit vendor application" })).toBeVisible();
});

test("staff check-in exposes searchable attendee controls and named actions", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/check-in`);

  await expect(page.getByRole("heading", { name: "Staff check-in" })).toBeVisible();
  await expect(page.getByText("Service worker:")).toBeVisible();
  await expect(page.getByLabel("Search or scan")).toBeFocused();

  await page.getByLabel("Search or scan").fill(attendeeEmail);

  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start camera scan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch Accessibility Attendee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
});
