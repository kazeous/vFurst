import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "PublicFlowErrorsPass123!";
const attendeeEmail = `public-flow-attendee-${runId}@example.com`;
const fillerEmail = `public-flow-filler-${runId}@example.com`;
const orgSlug = `public-flow-org-${runId}`;
const transferToken = `public-flow-transfer-token-${runId}-0123456789abcdef`;

let attendeeId: string;
let fillerId: string;
let requesterId: string;
let orgId: string;
let eventId: string;
let raceTierId: string;
let transferTierId: string;
let transferRequestId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const filler = await prisma.user.create({ data: { email: fillerEmail, name: "Public Flow Filler", ...staffIdentityData() } });
  requesterId = filler.id;

  const org = await prisma.organization.create({
    data: {
      name: "Public Flow Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: attendeeEmail,
      status: "ACTIVE",
      events: {
        create: {
          name: "Public Flow Event",
          slug: "public-flow-event",
          status: "PUBLISHED",
          startDate: new Date("2028-06-01T09:00:00Z"),
          endDate: new Date("2028-06-02T17:00:00Z"),
          settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 5 }
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;
  attendeeId = (await createPortalAccountFixture(prisma, { orgId, email: attendeeEmail, name: "Public Flow Attendee", password })).id;
  fillerId = (await createPortalAccountFixture(prisma, { orgId, email: fillerEmail, name: "Public Flow Filler", password })).id;

  const [raceTier, transferTier] = await Promise.all([
    prisma.registrationType.create({
      data: { orgId, eventId, name: "Race Ticket", price: 0, maxCapacity: 1 }
    }),
    prisma.registrationType.create({ data: { orgId, eventId, name: "Transfer Ticket", price: 0 } })
  ]);
  raceTierId = raceTier.id;
  transferTierId = transferTier.id;

  await Promise.all([
    prisma.storeProduct.create({
      data: { orgId, eventId, name: "Limited Poster", price: 1_000, stock: 1 }
    }),
    prisma.hotelBlock.create({
      data: {
        orgId,
        eventId,
        hotelName: "Cutoff Hotel",
        // A day after the 12th reads differently day-first and month-first; midday UTC keeps the day in any server zone.
        cutoffDate: new Date("2024-03-14T12:00:00Z"),
        roomTypes: [{ name: "Double", rate: 10_000, totalRooms: 5, bookedRooms: 0 }]
      }
    }),
    prisma.department.create({
      data: {
        orgId,
        eventId,
        name: "Operations",
        formSchema: [{ id: "exp", type: "text", label: "Experience summary", required: true }]
      }
    })
  ]);

  const sourceRegistration = await prisma.registration.create({
    data: { orgId, eventId, portalAccountId: fillerId, typeId: transferTierId, status: "CONFIRMED" }
  });
  const transferRequest = await prisma.registrationTransferRequest.create({
    data: {
      orgId,
      eventId,
      sourceRegistrationId: sourceRegistration.id,
      requesterUserId: requesterId,
      recipientEmail: attendeeEmail,
      status: "PENDING",
      tokenHash: createHash("sha256").update(transferToken).digest("hex"),
      createdAt: new Date("2026-03-14T12:00:00Z"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  transferRequestId = transferRequest.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterId].filter(Boolean) } } });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await loginAsAttendee(page, { subdomain: orgSlug }, attendeeEmail, { password });
}

test("a tier that sells out mid-flow reports the capacity error inline", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/register`);
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await page.locator(".vf-public-tier-list label").filter({ hasText: "Race Ticket" }).click();

  await prisma.registration.create({
    data: { orgId, eventId, portalAccountId: fillerId, typeId: raceTierId, status: "CONFIRMED" }
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Complete registration" }).click();

  await expect(page.getByTestId("registration-error")).toContainText("That registration tier is sold out.");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("raising a cart quantity above stock reports the inventory error inline", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/store`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("heading", { name: "Cart", exact: true })).toBeVisible();

  const quantityInput = page.getByLabel("Quantity for Limited Poster");
  await expect(quantityInput).toBeVisible();
  await quantityInput.fill("2");
  await page.getByRole("button", { name: "Update" }).click();

  await expect(page.getByTestId("cart-quantity-error")).toContainText("Not enough inventory is available.");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("booking past the hotel cutoff reports the cutoff error inline", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/hotel`);
  await expect(page.getByRole("heading", { name: "Cutoff Hotel" })).toBeVisible();
  await expect(page.getByText("Cutoff 14 Mar 2024", { exact: true })).toBeVisible();
  await page.getByLabel("Check-in").fill("01/06/2028");
  await page.getByLabel("Check-out").fill("03/06/2028");
  await page.getByRole("button", { name: "Continue to checkout" }).click();

  await expect(page.getByTestId("hotel-booking-error")).toContainText("past its booking cutoff");
  await expect(page.getByLabel("Check-in")).toHaveValue("01/06/2028");
  await expect(page.getByLabel("Check-out")).toHaveValue("03/06/2028");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("a required volunteer field left blank reports the field error inline", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/volunteer`);
  await expect(page.getByRole("heading", { name: "Volunteer application" })).toBeVisible();
  await page.getByLabel("Experience summary").fill(" ");
  await page.getByLabel("Date", { exact: true }).first().fill("02/06/2028");
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByTestId("volunteer-error")).toContainText("Experience summary is required.");
  await expect(page.getByLabel("Date", { exact: true }).first()).toHaveValue("02/06/2028");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit application" })).toBeEnabled();
});

test("a too-short vendor product description reports the validation error inline", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/vendor-apply`);
  await expect(page.getByRole("heading", { name: "Apply for dealer space" })).toBeVisible();
  await page.getByLabel("Business name").fill("Public Flow Business");
  await page.getByLabel("Product description").fill("short");
  await page.getByRole("button", { name: "Submit vendor application" }).click();

  await expect(page.getByTestId("vendor-error")).toContainText(">=10 characters");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect(page.getByLabel("Business name")).toHaveValue("Public Flow Business");
});

test("the account transfer list reads its dates day-first", async ({ page }) => {
  await login(page);
  await page.goto(`${portalOrigin(orgSlug)}/account/transfers`);
  await expect(page.getByRole("heading", { name: "Transfer invitations" })).toBeVisible();

  // en-GB writes "Sept" for September, hence three or four letters.
  const dateTime = String.raw`\d{1,2} [A-Z][a-z]{2,3} \d{4}, \d{2}:\d{2}`;
  await expect(page.getByText(new RegExp(String.raw`^Sent 14 Mar 2026, \d{2}:\d{2} · expires ${dateTime}$`))).toBeVisible();
});

test("a double-submitted transfer decision shows the refreshed request state, not an error page", async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  try {
    await login(pageA);
    const decisionUrl = `${portalOrigin(orgSlug)}/account/transfers/${transferRequestId}?token=${encodeURIComponent(transferToken)}`;
    await pageA.goto(decisionUrl);
    await pageB.goto(decisionUrl);
    await expect(pageA.getByRole("button", { name: "Accept transfer" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Accept transfer" })).toBeVisible();

    await pageA.getByRole("button", { name: "Accept transfer" }).click();
    await pageA.waitForURL((url) => url.searchParams.get("notice") === "accepted");
    await expect(pageA.getByTestId("transfer-notice")).toContainText("Transfer accepted");

    await pageB.getByRole("button", { name: "Accept transfer" }).click();
    await pageB.waitForURL((url) => url.searchParams.get("notice") === "invalid");
    await expect(pageB.getByTestId("transfer-notice")).toContainText("already been used");
    await expect(pageB.locator("dl.vf-details")).toContainText("ACCEPTED");
    await expect(pageB.getByTestId("route-error")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
