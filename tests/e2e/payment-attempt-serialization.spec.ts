import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient, type PaymentProvider } from "@prisma/client";
import {
  PaymentAttemptReservationError,
  reservePaymentAttempt
} from "../../packages/db/src/payment-attempts";
import { createPortalAccountFixture } from "./support/portal";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const userEmail = `attempt-lock-${runId}@example.com`;
const orgSlug = `attempt-lock-${runId}`;

let orgId: string;
let eventId: string;
let portalAccountId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

async function createPendingOrder() {
  return prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId,
      total: 250_000,
      platformFee: 25_000,
      currency: "VND",
      status: "PENDING",
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
}

function reservation(orderId: string, provider: PaymentProvider) {
  return reservePaymentAttempt(prisma, {
    id: randomUUID(),
    orderId,
    provider,
    amount: 250_000,
    currency: "VND",
    paymentCode: provider === "SEPAY" ? `VF${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}` : undefined,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });
}

test.beforeAll(async () => {
  const org = await prisma.organization.create({
    data: {
      name: "Attempt Lock Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: userEmail,
      status: "ACTIVE",
      events: {
        create: {
          name: "Attempt Lock Event",
          slug: "attempt-lock-event",
          currency: "VND",
          status: "PUBLISHED",
          startDate: new Date("2029-01-01T09:00:00Z"),
          endDate: new Date("2029-01-02T17:00:00Z")
        }
      }
    },
    include: {
      events: true
    }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;
  portalAccountId = (await createPortalAccountFixture(prisma, { orgId: org.id, email: userEmail, name: "Payment Attendee" })).id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.$disconnect();
});

test("concurrent starts for one provider converge on one authoritative attempt", async () => {
  const order = await createPendingOrder();
  const results = await Promise.all(Array.from({ length: 6 }, () => reservation(order.id, "SEPAY")));
  const attemptIds = new Set(results.map((result) => result.attempt.id));
  const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: order.id } });
  const storedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

  expect(attemptIds.size).toBe(1);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toEqual(
    expect.objectContaining({
      provider: "SEPAY",
      status: "PENDING",
      activeOrderId: order.id
    })
  );
  expect(storedOrder.paymentProvider).toBe("SEPAY");
  expect(storedOrder.paymentReference).toBe(attempts[0]!.paymentCode);
});

test("concurrent Stripe and SePay starts allow exactly one provider to hold the order", async () => {
  const order = await createPendingOrder();
  const providers: PaymentProvider[] = ["STRIPE", "SEPAY", "STRIPE", "SEPAY", "STRIPE", "SEPAY"];
  const results = await Promise.allSettled(providers.map((provider) => reservation(order.id, provider)));
  const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: order.id } });
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  expect(attempts).toHaveLength(1);
  expect(attempts[0]!.activeOrderId).toBe(order.id);
  expect(fulfilled.length).toBeGreaterThan(0);
  expect(rejected.length).toBeGreaterThan(0);
  expect(new Set(fulfilled.map((result) => result.value.attempt.id))).toEqual(new Set([attempts[0]!.id]));
  expect(
    rejected.every(
      (result) =>
        result.reason instanceof PaymentAttemptReservationError && result.reason.code === "PROVIDER_LOCKED"
    )
  ).toBe(true);

  await expect(
    prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        activeOrderId: order.id,
        provider: attempts[0]!.provider === "STRIPE" ? "SEPAY" : "STRIPE",
        amount: order.total,
        currency: order.currency,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    })
  ).rejects.toMatchObject({ code: "P2002" });
});

test("review blocks retries and an expired attempt releases the provider lock", async () => {
  const reviewOrder = await createPendingOrder();
  const review = await reservation(reviewOrder.id, "SEPAY");
  await prisma.paymentAttempt.update({
    where: { id: review.attempt.id },
    data: { status: "REVIEW" }
  });

  await expect(reservation(reviewOrder.id, "SEPAY")).rejects.toMatchObject({
    code: "PAYMENT_REVIEW"
  });

  const expiryOrder = await createPendingOrder();
  const expired = await reservation(expiryOrder.id, "SEPAY");
  await prisma.paymentAttempt.update({
    where: { id: expired.attempt.id },
    data: { expiresAt: new Date(Date.now() - 1_000) }
  });
  const replacement = await reservation(expiryOrder.id, "STRIPE");
  const attempts = await prisma.paymentAttempt.findMany({
    where: { orderId: expiryOrder.id },
    orderBy: { createdAt: "asc" }
  });

  expect(replacement.created).toBe(true);
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(expect.objectContaining({ status: "EXPIRED", activeOrderId: null }));
  expect(attempts[1]).toEqual(
    expect.objectContaining({ status: "PENDING", activeOrderId: expiryOrder.id, provider: "STRIPE" })
  );
});
