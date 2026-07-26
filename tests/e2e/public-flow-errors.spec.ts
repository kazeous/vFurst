import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "PublicFlowErrorsPass123!";
const attendeeEmail = `public-flow-attendee-${runId}@example.com`;
const fillerEmail = `public-flow-filler-${runId}@example.com`;
const orgSlug = `public-flow-org-${runId}`;
const transferToken = `public-flow-transfer-token-${runId}-0123456789abcdef`;

let attendeeId: string;
let fillerId: string;
let orgId: string;
let eventId: string;
let raceTierId: string;
let transferTierId: string;
let transferRequestId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [attendee, filler] = await Promise.all([
    prisma.user.create({ data: { email: attendeeEmail, name: "Public Flow Attendee", passwordHash } }),
    prisma.user.create({ data: { email: fillerEmail, name: "Public Flow Filler", passwordHash } })
  ]);
  attendeeId = attendee.id;
  fillerId = filler.id;

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
        cutoffDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
    data: { orgId, eventId, userId: filler.id, typeId: transferTierId, status: "CONFIRMED" }
  });
  const transferRequest = await prisma.registrationTransferRequest.create({
    data: {
      orgId,
      eventId,
      sourceRegistrationId: sourceRegistration.id,
      requesterUserId: filler.id,
      recipientEmail: attendeeEmail,
      status: "PENDING",
      tokenHash: createHash("sha256").update(transferToken).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  transferRequestId = transferRequest.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [attendeeId, fillerId] } } });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login?returnTo=%2Faccount");
  await page.getByLabel("Email").fill(attendeeEmail);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
  await page.waitForURL((url) => url.pathname.startsWith("/account"));
}

test("a tier that sells out mid-flow reports the capacity error inline", async ({ page }) => {
  await login(page);
  await page.goto(`/${orgSlug}/register`);
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await page.locator(".vf-public-tier-list label").filter({ hasText: "Race Ticket" }).click();

  await prisma.registration.create({
    data: { orgId, eventId, userId: fillerId, typeId: raceTierId, status: "CONFIRMED" }
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Complete registration" }).click();

  await expect(page.getByTestId("registration-error")).toContainText("That registration tier is sold out.");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("raising a cart quantity above stock reports the inventory error inline", async ({ page }) => {
  await login(page);
  await page.goto(`/${orgSlug}/store`);
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
  await page.goto(`/${orgSlug}/hotel`);
  await expect(page.getByRole("heading", { name: "Cutoff Hotel" })).toBeVisible();
  await page.locator('input[name="checkIn"]').fill("2028-06-01");
  await page.locator('input[name="checkOut"]').fill("2028-06-03");
  await page.getByRole("button", { name: "Continue to checkout" }).click();

  await expect(page.getByTestId("hotel-booking-error")).toContainText("past its booking cutoff");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("a required volunteer field left blank reports the field error inline", async ({ page }) => {
  await login(page);
  await page.goto(`/${orgSlug}/volunteer`);
  await expect(page.getByRole("heading", { name: "Volunteer application" })).toBeVisible();
  await page.getByLabel("Experience summary").fill(" ");
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByTestId("volunteer-error")).toContainText("Experience summary is required.");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit application" })).toBeEnabled();
});

test("a too-short vendor product description reports the validation error inline", async ({ page }) => {
  await login(page);
  await page.goto(`/${orgSlug}/vendor-apply`);
  await expect(page.getByRole("heading", { name: "Apply for dealer space" })).toBeVisible();
  await page.getByLabel("Business name").fill("Public Flow Business");
  await page.getByLabel("Product description").fill("short");
  await page.getByRole("button", { name: "Submit vendor application" }).click();

  await expect(page.getByTestId("vendor-error")).toContainText(">=10 characters");
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  await expect(page.getByLabel("Business name")).toHaveValue("Public Flow Business");
});

test("a double-submitted transfer decision shows the refreshed request state, not an error page", async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  try {
    await login(pageA);
    const decisionUrl = `/account/transfers/${transferRequestId}?token=${encodeURIComponent(transferToken)}`;
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
