import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPortalAccountFixture } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "ExportAccessPass123!";
const ownerAEmail = `export-owner-a-${runId}@example.com`;
const ownerBEmail = `export-owner-b-${runId}@example.com`;
const adminAEmail = `export-admin-a-${runId}@example.com`;
const memberAEmail = `export-member-a-${runId}@example.com`;
const platformAdminEmail = `export-platform-${runId}@example.com`;
const attendeeAEmail = `export-attendee-a-${runId}@example.com`;
const orgASlug = `export-a-${runId}`;
const orgBSlug = `export-b-${runId}`;

let orgAId: string;
let orgBId: string;
let eventAId: string;
let eventBId: string;
let registrationAId: string;
let poisonedRegistrationId: string;
let orderAId: string;
let poisonedOrderId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const [ownerA, ownerB, adminA, memberA, platformAdmin] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Export Owner A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Export Owner B", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: adminAEmail, name: "Export Admin A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: memberAEmail, name: "Export Member A", ...staffIdentityData() } }),
    prisma.user.create({
      data: { email: platformAdminEmail, name: "Export Platform Admin", ...staffIdentityData(), platformRole: "PLATFORM_ADMIN" }
    })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Export Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: {
          create: [
            { userId: ownerA.id, role: "OWNER" },
            { userId: adminA.id, role: "ADMIN" },
            { userId: memberA.id, role: "MEMBER" }
          ]
        },
        events: {
          create: {
            name: "Export Event A",
            slug: "export-event-a",
            status: "PUBLISHED",
            startDate: new Date("2028-09-01T09:00:00Z"),
            endDate: new Date("2028-09-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    }),
    prisma.organization.create({
      data: {
        name: "-Foreign Formula Organization",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerB.id, role: "OWNER" } },
        events: {
          create: {
            name: "Export Event B",
            slug: "export-event-b",
            status: "PUBLISHED",
            startDate: new Date("2028-10-01T09:00:00Z"),
            endDate: new Date("2028-10-02T17:00:00Z"),
            settings: {
              emailTemplates: {
                "registration-confirmation": {
                  subject: `Foreign subject ${runId}`,
                  html: `<p>Foreign ${runId}</p>`,
                  text: `Foreign ${runId}`
                }
              }
            }
          }
        }
      },
      include: { events: true }
    })
  ]);
  const ownerBAttendee = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: ownerBEmail, name: "Export Owner B", password });
  orgAId = orgA.id;
  orgBId = orgB.id;
  eventAId = orgA.events[0]!.id;

  const attendeeA = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: attendeeAEmail, name: "=2+3", password });

  eventBId = orgB.events[0]!.id;

  const [typeA, typeB] = await Promise.all([
    prisma.registrationType.create({
      data: { orgId: orgAId, eventId: eventAId, name: "@SUM(A1:A2)", price: 12_000 }
    }),
    prisma.registrationType.create({
      data: { orgId: orgBId, eventId: eventBId, name: "Foreign tier", price: 99_900 }
    })
  ]);

  const [registrationA, poisonedRegistration] = await Promise.all([
    prisma.registration.create({
      data: {
        orgId: orgAId,
        eventId: eventAId,
        portalAccountId: attendeeA.id,
        typeId: typeA.id,
        status: "CHECKED_IN",
        checkedInAt: new Date("2028-09-01T10:00:00Z")
      }
    }),
    prisma.registration.create({
      data: {
        orgId: orgBId,
        eventId: eventAId,
        portalAccountId: ownerBAttendee.id,
        typeId: typeB.id,
        status: "CONFIRMED"
      }
    })
  ]);
  registrationAId = registrationA.id;
  poisonedRegistrationId = poisonedRegistration.id;

  const [orderA, poisonedOrder] = await Promise.all([
    prisma.order.create({
      data: {
        orgId: orgAId,
        eventId: eventAId,
        portalAccountId: attendeeA.id,
        total: 12_345,
        platformFee: 345,
        status: "PAID",
        items: {
          create: { orgId: orgAId, itemType: "PRODUCT", refId: randomUUID(), unitPrice: 12_345, quantity: 1 }
        }
      }
    }),
    prisma.order.create({
      data: {
        orgId: orgBId,
        eventId: eventAId,
        portalAccountId: ownerBAttendee.id,
        total: 999_999,
        platformFee: 99_999,
        status: "PAID",
        items: {
          create: { orgId: orgBId, itemType: "PRODUCT", refId: randomUUID(), unitPrice: 999_999, quantity: 1 }
        }
      }
    })
  ]);
  orderAId = orderA.id;
  poisonedOrderId = poisonedOrder.id;

  await prisma.organizerLedgerEntry.createMany({
    data: [
      { orgId: orgAId, type: "PAYMENT", currency: "USD", amount: 12_000 },
      { orgId: orgBId, type: "PAYMENT", currency: "USD", amount: 99_900 }
    ]
  });

  expect(platformAdmin.platformRole).toBe("PLATFORM_ADMIN");
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
  await prisma.user.deleteMany({
    where: {
      email: { in: [ownerAEmail, ownerBEmail, adminAEmail, memberAEmail, platformAdminEmail, attendeeAEmail] }
    }
  });
  await prisma.$disconnect();
});

async function login(page: Page, email: string, destination = "/dashboard") {
  await loginAsStaffEmail(page, email, { returnTo: destination });
}

function registrationExport(eventId: string) {
  return `/dashboard/events/${eventId}/registrations/export`;
}

function analyticsExport(eventId: string) {
  return `/dashboard/events/${eventId}/analytics/export`;
}

test("public users are redirected before any export data is returned", async ({ request }) => {
  for (const pathname of [registrationExport(eventAId), analyticsExport(eventAId), "/dashboard/settings/payouts/export"]) {
    const response = await request.get(pathname, { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
  }
});

test("an organizer can export only consistent records from its own event", async ({ page }) => {
  await login(page, ownerAEmail);

  const registrations = await page.request.get(registrationExport(eventAId));
  expect(registrations.status()).toBe(200);
  expect(registrations.headers()["content-type"]).toContain("text/csv");
  expect(registrations.headers()["cache-control"]).toBe("private, no-store");
  const registrationCsv = await registrations.text();
  expect(registrationCsv).toContain('"\'=2+3"');
  expect(registrationCsv).toContain('"\'@SUM(A1:A2)"');
  expect(registrationCsv).not.toContain(ownerBEmail);
  expect(registrationCsv.split("\r\n")).toHaveLength(2);

  const analytics = await page.request.get(analyticsExport(eventAId));
  expect(analytics.status()).toBe(200);
  const analyticsCsv = await analytics.text();
  expect(analyticsCsv).toContain(registrationAId);
  expect(analyticsCsv).not.toContain(poisonedRegistrationId);
  expect(analyticsCsv).toContain(orderAId);
  expect(analyticsCsv).toContain('"Paid revenue (USD cents)","12345"');
  expect(analyticsCsv).toContain('"Currency","Order total (minor units)"');
  expect(analyticsCsv).not.toContain(poisonedOrderId);
  expect(analyticsCsv).not.toContain("999999");

  expect((await page.request.get(registrationExport(eventBId))).status()).toBe(404);
  expect((await page.request.get(analyticsExport(eventBId))).status()).toBe(404);
  expect((await page.request.get("/dashboard/settings/payouts/export")).status()).toBe(404);
});

test("organization admins can export while ordinary members cannot", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, adminAEmail);
  expect((await adminPage.request.get(registrationExport(eventAId))).status()).toBe(200);
  await adminContext.close();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await login(memberPage, memberAEmail);
  expect((await memberPage.request.get(registrationExport(eventAId))).status()).toBe(404);
  expect((await memberPage.request.get(analyticsExport(eventAId))).status()).toBe(404);
  await memberContext.close();
});

test("platform admins can export the global payout ledger from the control plane without implicit event membership", async ({ page }) => {
  await login(page, platformAdminEmail, "/platform");
  expect((await page.request.get(registrationExport(eventAId))).status()).toBe(404);

  const response = await page.request.get("/platform/payments/payouts/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const csv = await response.text();
  expect(csv).toContain("Export Organization A");
  expect(csv).toContain('"\'-Foreign Formula Organization"');
});

test("email template mutation derives authorization from the stored event", async ({ page }) => {
  await login(page, ownerAEmail);
  const pathname = `/dashboard/events/${eventAId}/settings/emails`;
  await page.goto(pathname);
  const form = page
    .locator('input[name="templateKey"][value="registration-confirmation"]')
    .locator("xpath=ancestor::form");
  await expect(form.locator('input[name="orgId"]')).toHaveCount(0);
  const before = await prisma.event.findUniqueOrThrow({ where: { id: eventBId }, select: { settings: true } });

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, foreignEventId) => {
      const htmlForm = formElement as HTMLFormElement;
      const eventIdInput = htmlForm.querySelector<HTMLInputElement>('input[name="eventId"]');
      const subjectInput = htmlForm.querySelector<HTMLInputElement>('input[name="subject"]');
      if (!eventIdInput || !subjectInput) throw new Error("Expected email template controls were not found.");
      eventIdInput.value = foreignEventId;
      subjectInput.value = "Cross-tenant overwrite attempt";
      htmlForm.requestSubmit();
    },
    eventBId
  );
  await responsePromise;

  const after = await prisma.event.findUniqueOrThrow({ where: { id: eventBId }, select: { settings: true } });
  expect(after.settings).toEqual(before.settings);
});
