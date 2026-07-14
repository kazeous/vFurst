import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const runId = Date.now();
const password = "LaunchPass123!";
const adminEmail = `launch-admin-${runId}@example.com`;
const attendeeEmail = `launch-attendee-${runId}@example.com`;
const vendorEmail = `launch-vendor-${runId}@example.com`;
const orgSlug = `launch-${runId}`;
const crudOrgSlug = `launch-crud-${runId}`;
const memberOnlyOrgSlug = `launch-member-${runId}`;
const checkoutSecret = process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum";
const sepayWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret";

let orgId: string;
let eventId: string;
let memberOnlyOrgId: string;
let memberOnlyEventId: string;
let registrationTypeId: string;
let registrationId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Launch Admin",
      passwordHash: await bcrypt.hash(password, 12),
      platformRole: "PLATFORM_ADMIN"
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Launch Test Convention",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: "ops@example.com",
      status: "ACTIVE",
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
      currency: "VND",
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

  const memberOnlyOrg = await prisma.organization.create({
    data: {
      name: "Member Only Convention",
      slug: memberOnlyOrgSlug,
      subdomain: memberOnlyOrgSlug,
      contactEmail: "member@example.com",
      status: "ACTIVE",
      members: {
        create: {
          userId: admin.id,
          role: "MEMBER"
        }
      },
      events: {
        create: {
          name: "Member Only Event",
          slug: "member-only-event",
          startDate: new Date("2027-08-01T09:00:00Z"),
          endDate: new Date("2027-08-02T17:00:00Z")
        }
      }
    },
    include: {
      events: true
    }
  });

  orgId = org.id;
  eventId = event.id;
  memberOnlyOrgId = memberOnlyOrg.id;
  memberOnlyEventId = memberOnlyOrg.events[0]!.id;
  registrationTypeId = registrationType.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgSlug, crudOrgSlug, memberOnlyOrgSlug]
      }
    }
  });
  await prisma.paymentProviderConfig.updateMany({
    where: { updatedBy: { email: adminEmail } },
    data: { updatedById: null }
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
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard$/);
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

  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByText("Effective date: July 11, 2026")).toBeVisible();
  }
  await page.goto("/dmca");
  await expect(page.getByText("Effective date: July 7, 2026")).toBeVisible();
});

test("public registration completes and creates a paid zero-dollar order", async ({ page }) => {
  await page.goto(`/${orgSlug}/register`);
  await expect(page.locator('[data-registration-ready="true"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Launch Attendee");
  await page.getByLabel("Email").fill(attendeeEmail);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Complete registration" }).click();

  await expect.poll(
    async () => {
      const result = await prisma.registration.findFirst({
        where: { eventId, user: { email: attendeeEmail } },
        include: { orderItems: { include: { order: true } } }
      });
      return result?.status === "CONFIRMED" && result.orderItems.some((item) => item.order.status === "PAID");
    },
    { timeout: 30_000 }
  ).toBe(true);

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

  await page.goto(`/${orgSlug}/register?success=${registration.id}`);
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toBeVisible();

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

  await expect.poll(
    () => prisma.vendorApplication.count({ where: { eventId, contactEmail: vendorEmail } }),
    { timeout: 30_000 }
  ).toBe(1);

  const application = await prisma.vendorApplication.findFirstOrThrow({
    where: {
      eventId,
      contactEmail: vendorEmail
    }
  });

  await page.goto(`/${orgSlug}/vendor-apply?success=${application.id}`);
  await expect(page.getByRole("heading", { name: "Launch Vendor Studio" })).toBeVisible();

  expect(application.status).toBe("PENDING");
});

test("admin CRUD and staff check-in paths work", async ({ page }) => {
  await ensureConfirmedRegistration();
  await login(page);

  await page.goto("/dashboard/events/new");
  await expect(page.getByRole("heading", { name: "Create event" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Dashboard navigation" }).getByRole("link", { name: "Staff" })).toHaveCount(0);
  const invalidCreateEventChild = await page.request.get("/dashboard/events/new/staff");
  expect(invalidCreateEventChild.status()).toBe(404);

  await page.goto("/platform/organizations/new");
  await page.getByLabel("Name").fill("Launch CRUD Org");
  await page.getByLabel("Subdomain slug").fill(crudOrgSlug);
  await page.getByLabel("Contact email").fill("crud@example.com");
  await page.getByLabel("Initial owner email").fill("crud-owner@example.com");
  await page.getByRole("button", { name: "Provision organization" }).click();
  await expect.poll(() => prisma.organization.count({ where: { slug: crudOrgSlug } }), { timeout: 30_000 }).toBe(1);
  const createdOrg = await prisma.organization.findUniqueOrThrow({
    where: { slug: crudOrgSlug },
    include: { invitations: true, members: true }
  });
  expect(createdOrg.status).toBe("PROVISIONING");
  expect(createdOrg.members).toHaveLength(0);
  expect(createdOrg.invitations).toEqual([
    expect.objectContaining({ email: "crud-owner@example.com", role: "OWNER", acceptedAt: null, revokedAt: null })
  ]);
  expect((await page.request.get(`/dashboard/organizations/${createdOrg.id}`)).status()).toBe(404);

  await page.goto(`/dashboard/events/${eventId}/check-in`);
  await page.getByPlaceholder("Name, email, badge number, QR code, or registration ID").fill(attendeeEmail);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect.poll(
    async () => (await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } })).status,
    { timeout: 30_000 }
  ).toBe("CHECKED_IN");
  await page.goto(`/dashboard/events/${eventId}/check-in?q=${encodeURIComponent(attendeeEmail)}`);
  await expect(page.getByRole("button", { name: "Checked in" })).toBeVisible({ timeout: 15_000 });

  const registration = await prisma.registration.findUniqueOrThrow({
    where: {
      id: registrationId
    }
  });

  expect(registration.status).toBe("CHECKED_IN");
  expect(registration.checkedInAt).toBeTruthy();
});

test("dashboard settings hub filters access and updates event settings", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  const dashboardNavigation = page.getByRole("navigation", { name: "Dashboard navigation" });
  await expect(dashboardNavigation.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/dashboard/settings");
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await expect(dashboardNavigation.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Launch Test Convention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment methods" })).toHaveCount(0);
  await expect(page.getByText("Enable Stripe platform-wide")).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Member Only Convention")).toHaveCount(0);

  await page.goto("/platform/payments");
  await expect(page.getByRole("heading", { name: "Payments and settlement" })).toBeVisible();
  await expect(page.getByText("Enable Stripe platform-wide")).toBeVisible();

  const unauthorizedOrgResponse = await page.request.get(`/dashboard/organizations/${memberOnlyOrgId}/settings`);
  expect(unauthorizedOrgResponse.ok()).toBe(false);
  const unauthorizedEventResponse = await page.request.get(`/dashboard/events/${memberOnlyEventId}/settings`);
  expect(unauthorizedEventResponse.ok()).toBe(false);

  await page.goto(`/dashboard/events/${eventId}/settings`);
  await page.getByLabel("Name").fill("Launch Test 2027 Updated");
  await page.getByLabel("Description").fill("Updated launch verification event");
  await page.getByLabel("Venue").fill("Updated Verification Hall");
  await page.getByLabel("Require manual registration approval").check();
  await page.getByLabel("Allow attendee transfers").uncheck();
  await page.getByLabel("Maximum registrations per user").fill("3");
  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().includes(`/dashboard/events/${eventId}/settings`) && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Save event settings" }).click({ noWaitAfter: true });
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.status()).toBeLessThan(400);
  await page.goto(`/dashboard/events/${eventId}/settings?saved=1`);
  await expect(page.getByText("Event settings saved.")).toBeVisible();

  const updatedEvent = await prisma.event.findUniqueOrThrow({
    where: {
      id: eventId
    }
  });
  const settings = updatedEvent.settings as Record<string, unknown>;

  expect(updatedEvent.name).toBe("Launch Test 2027 Updated");
  expect(updatedEvent.venue).toBe("Updated Verification Hall");
  expect(settings.requireApproval).toBe(true);
  expect(settings.allowTransfers).toBe(false);
  expect(settings.maxRegistrationsPerUser).toBe(3);
  expect(settings.vendorConfig).toBeTruthy();
});

test("a SePay exception atomically replaces a newer provider lock with review", async ({ page }) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  await prisma.paymentProviderConfig.upsert({
    where: { provider: "SEPAY" },
    update: {
      enabled: true,
      updatedById: admin.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "e2e-bank-account",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    },
    create: {
      provider: "SEPAY",
      enabled: true,
      updatedById: admin.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "e2e-bank-account",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    }
  });

  const paymentCode = `VF${randomBytes(6).toString("hex").toUpperCase()}`;
  const stripeSessionId = `cs_review_${runId}`;
  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      userId: admin.id,
      total: 150000,
      platformFee: 25000,
      currency: "VND",
      paymentProvider: "STRIPE",
      paymentReference: stripeSessionId,
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  const sepayAttempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: "SEPAY",
      status: "EXPIRED",
      amount: order.total,
      currency: order.currency,
      paymentCode,
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  const stripeAttempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      activeOrderId: order.id,
      provider: "STRIPE",
      amount: order.total,
      currency: order.currency,
      providerReference: stripeSessionId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const transactionId = `e2e-sepay-review-${runId}`;
  const body = JSON.stringify({
    id: transactionId,
    accountNumber: "123456789",
    code: null,
    content: `VFURST ${paymentCode}`,
    transferType: "in",
    transferAmount: order.total - 1
  });
  const signature = `sha256=${createHmac("sha256", sepayWebhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;

  for (let replay = 0; replay < 2; replay += 1) {
    const response = await page.request.post("/api/webhooks/sepay", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-sepay-timestamp": timestamp,
        "x-sepay-signature": signature
      }
    });
    expect(response.status()).toBe(200);
  }

  const [storedOrder, reviewedAttempt, cancelledAttempt, exceptions] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.paymentAttempt.findUniqueOrThrow({ where: { id: sepayAttempt.id } }),
    prisma.paymentAttempt.findUniqueOrThrow({ where: { id: stripeAttempt.id } }),
    prisma.paymentException.findMany({ where: { sepayTransactionId: transactionId } })
  ]);

  expect(storedOrder).toEqual(
    expect.objectContaining({
      status: "PENDING",
      paymentProvider: "SEPAY",
      paymentReference: paymentCode
    })
  );
  expect(reviewedAttempt).toEqual(expect.objectContaining({ status: "REVIEW", activeOrderId: order.id }));
  expect(cancelledAttempt).toEqual(expect.objectContaining({ status: "CANCELLED", activeOrderId: null }));
  expect(exceptions).toHaveLength(1);
  expect(exceptions[0]).toEqual(
    expect.objectContaining({
      type: "UNDERPAID",
      status: "OPEN",
      paymentAttemptId: sepayAttempt.id,
      orderId: order.id
    })
  );
});

test("embedded SePay QR fulfills through a signed webhook after the provider and organization are disabled", async ({ page }) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  await prisma.paymentProviderConfig.upsert({
    where: { provider: "SEPAY" },
    update: {
      enabled: true,
      updatedById: admin.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "e2e-bank-account",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    },
    create: {
      provider: "SEPAY",
      enabled: true,
      updatedById: admin.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "e2e-bank-account",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    }
  });

  const token = randomBytes(32).toString("base64url");
  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      userId: admin.id,
      total: 150000,
      platformFee: 25000,
      currency: "VND",
      checkoutTokenHash: createHmac("sha256", checkoutSecret).update(token).digest("hex"),
      checkoutSuccessPath: "/pricing",
      checkoutCancelPath: "/pricing",
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  await page.goto(`/checkout/${order.id}?token=${encodeURIComponent(token)}`);
  await page.getByRole("button", { name: "Show QR" }).click();
  await expect.poll(
    () => prisma.paymentAttempt.count({ where: { orderId: order.id, provider: "SEPAY" } }),
    { timeout: 30_000 }
  ).toBe(1);
  await page.goto(`/checkout/${order.id}?token=${encodeURIComponent(token)}&sepay=1`);
  await expect(page.getByRole("heading", { name: "Complete bank transfer" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: /SePay QR code/ })).toBeVisible();
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id, provider: "SEPAY" } });

  await prisma.paymentProviderConfig.update({ where: { provider: "SEPAY" }, data: { enabled: false } });
  await prisma.organization.update({ where: { id: orgId }, data: { status: "SUSPENDED", statusUpdatedAt: new Date() } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: `e2e-sepay-${runId}`,
    accountNumber: "123456789",
    code: null,
    content: `VFURST ${attempt.paymentCode}`,
    transferType: "in",
    transferAmount: order.total
  });
  const signature = `sha256=${createHmac("sha256", sepayWebhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;
  const response = await page.request.post("/api/webhooks/sepay", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-sepay-timestamp": timestamp,
      "x-sepay-signature": signature
    }
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('{"success":true}');
  await expect(page).toHaveURL(/\/pricing$/, { timeout: 30_000 });

  const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { ledgerEntries: true } });
  expect(paidOrder.status).toBe("PAID");
  expect(paidOrder.paymentProvider).toBe("SEPAY");
  expect(paidOrder.ledgerEntries[0]?.amount).toBe(125000);
});
