import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = Date.now();
const password = "LaunchPass123!";
const adminEmail = `launch-admin-${runId}@example.com`;
const attendeeEmail = `launch-attendee-${runId}@example.com`;
const vendorEmail = `launch-vendor-${runId}@example.com`;
const orgSlug = `launch-${runId}`;
const crudOrgSlug = `launch-crud-${runId}`;

let orgId: string;
let eventId: string;
let registrationTypeId: string;
let registrationId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Launch Admin",
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Launch Test Convention",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: "ops@example.com",
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
      name: "Launch Test 2027",
      slug: "launch-test-2027",
      description: "Launch verification event",
      venue: "Verification Hall",
      startDate: new Date("2027-07-10T09:00:00Z"),
      endDate: new Date("2027-07-12T17:00:00Z"),
      status: "PUBLISHED",
      settings: {
        requireApproval: false,
        allowTransfers: true,
        maxRegistrationsPerUser: 1,
        vendorConfig: {
          tableTypes: [{ id: "table-standard", name: "Standard table", price: 0 }],
          amenities: [],
          booths: [{ id: "booth-a-01", label: "A-01", tableType: "Standard table", status: "AVAILABLE" }]
        }
      }
    }
  });

  const registrationType = await prisma.registrationType.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      name: "Launch General",
      price: 0,
      maxCapacity: 5000,
      sortOrder: 0
    }
  });

  orgId = org.id;
  eventId = event.id;
  registrationTypeId = registrationType.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgSlug, crudOrgSlug]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [adminEmail, attendeeEmail, vendorEmail]
      }
    }
  });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function ensureConfirmedRegistration() {
  if (registrationId) {
    return;
  }

  const attendee = await prisma.user.upsert({
    where: {
      email: attendeeEmail
    },
    update: {
      name: "Launch Attendee"
    },
    create: {
      email: attendeeEmail,
      name: "Launch Attendee"
    }
  });

  const registration = await prisma.registration.create({
    data: {
      orgId,
      eventId,
      userId: attendee.id,
      typeId: registrationTypeId,
      status: "CONFIRMED"
    }
  });

  await prisma.order.create({
    data: {
      orgId,
      eventId,
      userId: attendee.id,
      total: 0,
      platformFee: 0,
      status: "PAID",
      items: {
        create: {
          registrationId: registration.id,
          orgId,
          itemType: "REGISTRATION",
          refId: registration.id,
          unitPrice: 0,
          quantity: 1
        }
      }
    }
  });

  registrationId = registration.id;
}

test("marketing and legal launch pages render", async ({ page }) => {
  await page.goto("/features");
  await expect(page.getByRole("heading", { name: "One workspace for planning, selling, staffing, and launch day" })).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Simple usage fees for events that move money" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate platform fees" })).toBeVisible();

  for (const path of ["/privacy", "/terms", "/dmca"]) {
    await page.goto(path);
    await expect(page.getByText("Effective date: July 7, 2026")).toBeVisible();
  }
});

test("public registration completes and creates a paid zero-dollar order", async ({ page }) => {
  await page.goto(`/${orgSlug}/register`);
  await page.getByLabel("Full name").fill("Launch Attendee");
  await page.getByLabel("Email").fill(attendeeEmail);
  await page.getByRole("button", { name: "Continue to Stripe Checkout" }).click();

  await expect(page).toHaveURL(/success=/);
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toBeVisible();

  const registration = await prisma.registration.findFirstOrThrow({
    where: {
      eventId,
      user: {
        email: attendeeEmail
      }
    },
    include: {
      orderItems: {
        include: {
          order: true
        }
      }
    }
  });

  registrationId = registration.id;
  expect(registration.typeId).toBe(registrationTypeId);
  expect(registration.status).toBe("CONFIRMED");
  expect(registration.orderItems.some((item) => item.order.status === "PAID")).toBeTruthy();
});

test("public vendor application submits for organizer review", async ({ page }) => {
  await page.goto(`/${orgSlug}/vendor-apply`);
  await page.getByLabel("Contact name").fill("Launch Vendor");
  await page.getByLabel("Contact email").fill(vendorEmail);
  await page.getByLabel("Business name").fill("Launch Vendor Studio");
  await page.getByLabel("Product description").fill("Original convention merchandise and attendee accessories.");
  await page.getByRole("button", { name: "Submit vendor application" }).click();

  await expect(page).toHaveURL(/success=/);
  await expect(page.getByRole("heading", { name: "Launch Vendor Studio" })).toBeVisible();

  const application = await prisma.vendorApplication.findFirstOrThrow({
    where: {
      eventId,
      contactEmail: vendorEmail
    }
  });

  expect(application.status).toBe("PENDING");
});

test("admin CRUD and staff check-in paths work", async ({ page }) => {
  await ensureConfirmedRegistration();
  await login(page);

  await page.goto("/dashboard/organizations/new");
  await page.getByLabel("Name").fill("Launch CRUD Org");
  await page.getByLabel("Subdomain slug").fill(crudOrgSlug);
  await page.getByLabel("Contact email").fill("crud@example.com");
  await Promise.all([
    page.waitForURL(/\/dashboard\/organizations\/[^/]+$/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Create organization" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Launch CRUD Org" })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/dashboard/events/${eventId}/check-in`);
  await page.getByPlaceholder("Name, email, badge number, QR code, or registration ID").fill(attendeeEmail);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("button", { name: "Checked in" })).toBeVisible();

  const registration = await prisma.registration.findUniqueOrThrow({
    where: {
      id: registrationId
    }
  });

  expect(registration.status).toBe("CHECKED_IN");
  expect(registration.checkedInAt).toBeTruthy();
});
