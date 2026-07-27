import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RaffleContractPass123!";
const ownerEmail = `raffle-contract-owner-${runId}@example.com`;
const attendeeEmail = `raffle-contract-attendee-${runId}@example.com`;
const orgSlug = `raffle-contract-org-${runId}`;
const sepaySecret = process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret";

let ownerId: string;
let attendeeId: string;
let orgId: string;
let eventId: string;
let tierId: string;
let productId: string;
let purchaseRaffleId: string;
let confirmedRaffleId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [owner, attendee] = await Promise.all([
    prisma.user.create({ data: { email: ownerEmail, name: "Raffle Owner", passwordHash } }),
    prisma.user.create({ data: { email: attendeeEmail, name: "Raffle Attendee", passwordHash } })
  ]);
  ownerId = owner.id;
  attendeeId = attendee.id;

  const org = await prisma.organization.create({
    data: {
      name: "Raffle Contract Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Raffle Contract Event",
          slug: "raffle-contract-event",
          status: "PUBLISHED",
          startDate: new Date("2028-07-01T09:00:00Z"),
          endDate: new Date("2028-07-02T17:00:00Z"),
          currency: "VND"
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;

  const [tier, product] = await Promise.all([
    prisma.registrationType.create({ data: { orgId, eventId, name: "Raffle Registration", price: 0 } }),
    prisma.storeProduct.create({
      data: {
        orgId,
        eventId,
        name: "Raffle Ticket Product",
        price: 15000,
        stock: 20,
        description: "A paid raffle ticket"
      }
    })
  ]);
  tierId = tier.id;
  productId = product.id;

  await prisma.registration.create({
    data: { orgId, eventId, userId: attendeeId, typeId: tierId, status: "CONFIRMED", approvalStatus: "APPROVED" }
  });
  const [purchaseRaffle, confirmedRaffle] = await Promise.all([
    prisma.raffle.create({
      data: {
        orgId,
        eventId,
        name: "Purchased Tickets Raffle",
        eligibility: { kind: "PURCHASED", productId, entriesPerUnit: 2 },
        maxEntriesPerUser: 5,
        prizes: [{ name: "Purchased Prize", quantity: 1 }],
        drawDate: new Date("2028-07-02T12:00:00Z")
      }
    }),
    prisma.raffle.create({
      data: {
        orgId,
        eventId,
        name: "Confirmed Registration Raffle",
        eligibility: { kind: "CONFIRMED_REGISTRATION" },
        prizes: [{ name: "Confirmed Prize", quantity: 1 }],
        drawDate: new Date("2028-07-02T13:00:00Z")
      }
    })
  ]);
  purchaseRaffleId = purchaseRaffle.id;
  confirmedRaffleId = confirmedRaffle.id;

  await prisma.paymentProviderConfig.upsert({
    where: { provider: "SEPAY" },
    update: {
      enabled: true,
      updatedById: ownerId,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "raffle-contract-bank",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    },
    create: {
      provider: "SEPAY",
      enabled: true,
      updatedById: ownerId,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "raffle-contract-bank",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25000,
        hotelFeeVnd: 25000
      }
    }
  });
});

test.afterAll(async () => {
  await prisma.paymentProviderConfig.updateMany({ where: { provider: "SEPAY", updatedById: ownerId }, data: { updatedById: null } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, attendeeId] } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
}

test("paid product fulfillment creates one weighted PURCHASED entry and is idempotent on webhook replay", async ({ page }) => {
  const paymentCode = `VF${randomBytes(6).toString("hex").toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      userId: attendeeId,
      total: 30_000,
      platformFee: 0,
      currency: "VND",
      items: {
        create: {
          orgId,
          itemType: "PRODUCT",
          refId: productId,
          storeProductId: productId,
          unitPrice: 15_000,
          quantity: 2
        }
      }
    },
    include: { items: true }
  });
  await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      activeOrderId: order.id,
      provider: "SEPAY",
      amount: order.total,
      currency: "VND",
      paymentCode,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  const transactionId = `raffle-contract-payment-${runId}`;
  const body = JSON.stringify({
    id: transactionId,
    accountNumber: "123456789",
    code: paymentCode,
    content: `VFURST ${paymentCode}`,
    transferType: "in",
    transferAmount: order.total
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", sepaySecret).update(`${timestamp}.${body}`).digest("hex")}`;

  for (let replay = 0; replay < 2; replay += 1) {
    const response = await page.request.post("/api/webhooks/sepay", {
      data: body,
      headers: { "content-type": "application/json", "x-sepay-timestamp": timestamp, "x-sepay-signature": signature }
    });
    expect(response.status()).toBe(200);
  }

  const entries = await prisma.raffleEntry.findMany({ where: { raffleId: purchaseRaffleId, userId: attendeeId } });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toEqual(expect.objectContaining({ entryMethod: "PURCHASED", quantity: 4, orderItemId: order.items[0]!.id }));
  expect(await prisma.raffleEntry.count({ where: { purchaseKey: `${purchaseRaffleId}:${order.items[0]!.id}` } })).toBe(1);

  await login(page, attendeeEmail);
  await page.goto("/account/raffles");
  await expect(page.getByRole("heading", { name: "My raffle entries" })).toBeVisible();
  await expect(page.getByText("Purchased Tickets Raffle")).toBeVisible();
  await expect(page.getByText(/4 weighted entr/)).toBeVisible();
});

test("draw stores an immutable result and exposes only the signed-in attendee's win", async ({ page }) => {
  await login(page, ownerEmail);
  await page.goto(`/dashboard/events/${eventId}/raffle`);
  const raffle = page.locator("article", { hasText: "Confirmed Registration Raffle" });
  await raffle.getByRole("button", { name: "Auto-enter attendees" }).click({ noWaitAfter: true });
  await expect.poll(() => prisma.raffleEntry.count({ where: { raffleId: confirmedRaffleId, userId: attendeeId } })).toBe(1);
  await page.goto(`/dashboard/events/${eventId}/raffle`);
  const drawRaffle = page.locator("article", { hasText: "Confirmed Registration Raffle" });
  await drawRaffle.getByRole("button", { name: "Draw winner" }).click({ noWaitAfter: true });
  await expect.poll(() => prisma.raffleDrawResult.count({ where: { raffleId: confirmedRaffleId } })).toBe(1);

  await page.goto(`/dashboard/events/${eventId}/raffle`);
  const exhaustedRaffle = page.locator("article", { hasText: "Confirmed Registration Raffle" });
  await exhaustedRaffle.getByRole("button", { name: "Draw winner" }).click();
  await expect(page.getByTestId("raffle-draw-error")).toContainText(
    "All available quantities of this prize have already been awarded."
  );
  await expect(exhaustedRaffle.getByRole("button", { name: "Draw winner" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.raffleDrawResult.count({ where: { raffleId: confirmedRaffleId } })).toBe(1);

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  expect((event.settings as { raffleHistory?: unknown }).raffleHistory).toBeUndefined();

  await login(page, attendeeEmail);
  await page.goto("/account/raffles");
  await expect(page.getByText("Confirmed Prize")).toBeVisible();
  await expect(page.getByText(/Notified|Notification pending/)).toBeVisible();
});
