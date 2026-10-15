import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { createPortalAccountFixture } from "./support/portal";

const prisma = new PrismaClient();
const signer = new Stripe("sk_test_e2e_webhook_signer");
const runId = `${Date.now()}-${process.pid}`;
const userEmail = `stripe-webhook-${runId}@example.com`;
const orgSlug = `stripe-webhook-${runId}`;
const webhookPath = "/api/webhooks/stripe";

let eventId: string;
let orgId: string;
let portalAccountId: string;
let unsignedOrderId: string;
let invalidOrderId: string;
let checkoutOrderId: string;
let intentOrderId: string;
let staleOrderId: string;
let staleAttemptId: string;
let refundOrderId: string;
let stripeConfigExisted = false;
let previousStripeEnabled = false;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

function stripeEvent(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_${runId}_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2025-12-15.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type
  });
}

function signingSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("The E2E Stripe webhook signing secret is not configured.");
  return secret;
}

function signature(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return signer.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret(), timestamp });
}

async function postWebhook(request: APIRequestContext, body: string, stripeSignature?: string) {
  return request.post(webhookPath, {
    data: body,
    headers: {
      "content-type": "application/json",
      ...(stripeSignature ? { "stripe-signature": stripeSignature } : {})
    }
  });
}

async function createPendingOrder(paymentReference: string) {
  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId,
      total: 12_500,
      platformFee: 500,
      currency: "USD",
      status: "PENDING",
      paymentProvider: "STRIPE",
      paymentReference
    }
  });
  await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      activeOrderId: order.id,
      provider: "STRIPE",
      amount: 12_500,
      currency: "USD",
      providerReference: paymentReference,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  return order;
}

test.beforeAll(async () => {
  const existingStripeConfig = await prisma.paymentProviderConfig.findUnique({ where: { provider: "STRIPE" } });
  stripeConfigExisted = existingStripeConfig !== null;
  previousStripeEnabled = existingStripeConfig?.enabled ?? false;
  await prisma.paymentProviderConfig.upsert({
    where: { provider: "STRIPE" },
    update: { enabled: false },
    create: { provider: "STRIPE", enabled: false }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Stripe Webhook Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: userEmail,
      status: "ACTIVE",
      events: {
        create: {
          name: "Stripe Webhook Event",
          slug: "stripe-webhook-event",
          status: "PUBLISHED",
          startDate: new Date("2028-11-01T09:00:00Z"),
          endDate: new Date("2028-11-02T17:00:00Z")
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;
  portalAccountId = (await createPortalAccountFixture(prisma, { orgId: org.id, email: userEmail, name: "Payment Attendee" })).id;

  const [unsignedOrder, invalidOrder, checkoutOrder, intentOrder] = await Promise.all([
    createPendingOrder(`cs_unsigned_${runId}`),
    createPendingOrder(`cs_invalid_${runId}`),
    createPendingOrder(`cs_checkout_${runId}`),
    createPendingOrder(`pi_intent_${runId}`)
  ]);
  unsignedOrderId = unsignedOrder.id;
  invalidOrderId = invalidOrder.id;
  checkoutOrderId = checkoutOrder.id;
  intentOrderId = intentOrder.id;

  const staleOrder = await prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId,
      total: 15_000,
      platformFee: 500,
      currency: "USD",
      status: "PENDING",
      paymentProvider: "SEPAY",
      paymentReference: `VFSTALE${runId.slice(-6)}`,
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  staleOrderId = staleOrder.id;
  const staleAttempt = await prisma.paymentAttempt.create({
    data: {
      orderId: staleOrder.id,
      provider: "STRIPE",
      status: "EXPIRED",
      amount: staleOrder.total,
      currency: staleOrder.currency,
      providerReference: `cs_stale_${runId}`,
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  staleAttemptId = staleAttempt.id;
  await prisma.paymentAttempt.create({
    data: {
      orderId: staleOrder.id,
      activeOrderId: staleOrder.id,
      provider: "SEPAY",
      amount: staleOrder.total,
      currency: staleOrder.currency,
      paymentCode: `VFSTALE${runId.slice(-6)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  const refundOrder = await prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId,
      total: 9_000,
      platformFee: 400,
      currency: "USD",
      status: "PAID",
      paymentProvider: "STRIPE",
      paymentReference: `pi_refund_${runId}`,
      stripePaymentIntentId: `pi_refund_${runId}`
    }
  });
  refundOrderId = refundOrder.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  if (stripeConfigExisted) {
    await prisma.paymentProviderConfig.update({
      where: { provider: "STRIPE" },
      data: { enabled: previousStripeEnabled }
    });
  } else {
    await prisma.paymentProviderConfig.deleteMany({ where: { provider: "STRIPE" } });
  }
  await prisma.$disconnect();
});

test("unsigned, invalidly signed, and stale Stripe events fail closed", async ({ request }) => {
  const unsignedBody = stripeEvent("checkout.session.completed", {
    id: `cs_unsigned_${runId}`,
    object: "checkout.session",
    client_reference_id: unsignedOrderId,
    metadata: { orderId: unsignedOrderId },
    payment_intent: `pi_unsigned_${runId}`,
    payment_status: "paid"
  });
  const unsigned = await postWebhook(request, unsignedBody);
  expect(unsigned.status()).toBe(400);
  expect(await unsigned.json()).toEqual({ error: "Stripe signature is required." });

  const invalidBody = stripeEvent("payment_intent.succeeded", {
    id: `pi_invalid_${runId}`,
    object: "payment_intent",
    metadata: { orderId: invalidOrderId }
  });
  const invalid = await postWebhook(request, invalidBody, "t=1,v1=forged");
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Invalid Stripe webhook signature." });

  const stale = await postWebhook(request, invalidBody, signature(invalidBody, Math.floor(Date.now() / 1000) - 600));
  expect(stale.status()).toBe(400);

  const missingPaymentReferenceBody = stripeEvent("checkout.session.completed", {
    id: `cs_unsigned_${runId}`,
    object: "checkout.session",
    client_reference_id: unsignedOrderId,
    metadata: { orderId: unsignedOrderId },
    payment_status: "paid"
  });
  expect(
    (await postWebhook(request, missingPaymentReferenceBody, signature(missingPaymentReferenceBody))).status()
  ).toBe(200);

  const orders = await prisma.order.findMany({
    where: { id: { in: [unsignedOrderId, invalidOrderId] } },
    select: { status: true, stripePaymentIntentId: true }
  });
  expect(orders).toHaveLength(2);
  expect(orders.every((order) => order.status === "PENDING" && order.stripePaymentIntentId === null)).toBe(true);
});

test("signed completion events settle existing orders while the provider and organization are disabled for new checkout", async ({ request }) => {
  expect((await prisma.paymentProviderConfig.findUniqueOrThrow({ where: { provider: "STRIPE" } })).enabled).toBe(false);
  await prisma.organization.update({ where: { id: orgId }, data: { status: "SUSPENDED", statusUpdatedAt: new Date() } });

  const checkoutBody = stripeEvent("checkout.session.completed", {
    id: `cs_checkout_${runId}`,
    object: "checkout.session",
    client_reference_id: checkoutOrderId,
    metadata: { orderId: checkoutOrderId },
    payment_intent: `pi_checkout_${runId}`,
    payment_status: "paid"
  });
  const checkoutSignature = signature(checkoutBody);
  expect((await postWebhook(request, checkoutBody, checkoutSignature)).status()).toBe(200);
  expect((await postWebhook(request, checkoutBody, checkoutSignature)).status()).toBe(200);

  const checkoutOrder = await prisma.order.findUniqueOrThrow({ where: { id: checkoutOrderId } });
  expect(checkoutOrder).toEqual(
    expect.objectContaining({
      status: "PAID",
      paymentProvider: "STRIPE",
      paymentReference: `pi_checkout_${runId}`,
      stripePaymentIntentId: `pi_checkout_${runId}`
    })
  );
  const checkoutAttempts = await prisma.paymentAttempt.findMany({ where: { orderId: checkoutOrderId } });
  expect(checkoutAttempts).toHaveLength(1);
  expect(checkoutAttempts[0]).toEqual(
    expect.objectContaining({ status: "PAID", activeOrderId: null, paidAt: expect.any(Date) })
  );

  const intentBody = stripeEvent("payment_intent.succeeded", {
    id: `pi_intent_${runId}`,
    object: "payment_intent",
    metadata: { orderId: intentOrderId }
  });
  expect((await postWebhook(request, intentBody, signature(intentBody))).status()).toBe(200);
  expect(await prisma.order.findUniqueOrThrow({ where: { id: intentOrderId } })).toEqual(
    expect.objectContaining({
      status: "PAID",
      paymentProvider: "STRIPE",
      stripePaymentIntentId: `pi_intent_${runId}`
    })
  );
});

test("a stale Stripe callback cannot settle an order locked by a newer SePay attempt", async ({ request }) => {
  const staleBody = stripeEvent("checkout.session.completed", {
    id: `cs_stale_${runId}`,
    object: "checkout.session",
    client_reference_id: staleOrderId,
    metadata: { orderId: staleOrderId, paymentAttemptId: staleAttemptId },
    payment_intent: `pi_stale_${runId}`,
    payment_status: "paid"
  });
  const staleSignature = signature(staleBody);

  expect((await postWebhook(request, staleBody, staleSignature)).status()).toBe(200);
  expect((await postWebhook(request, staleBody, staleSignature)).status()).toBe(200);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: staleOrderId } });
  const activeAttempt = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { activeOrderId: staleOrderId }
  });
  const exceptions = await prisma.paymentException.findMany({
    where: { providerReference: `pi_stale_${runId}` }
  });

  expect(order).toEqual(expect.objectContaining({ status: "PENDING", paymentProvider: "SEPAY" }));
  expect(activeAttempt).toEqual(expect.objectContaining({ provider: "SEPAY", status: "PENDING" }));
  expect(exceptions).toHaveLength(1);
  expect(exceptions[0]).toEqual(
    expect.objectContaining({
      type: "STALE_ATTEMPT",
      status: "OPEN",
      orderId: staleOrderId,
      paymentAttemptId: staleAttemptId
    })
  );
});

test("a Stripe capture after another provider paid is recorded as a payment exception", async ({ request }) => {
  const paymentCode = `VF${runId.replaceAll("-", "").slice(-12).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId,
      total: 18_000,
      platformFee: 500,
      currency: "USD",
      status: "PAID",
      paymentProvider: "SEPAY",
      paymentReference: `sepay_paid_${runId}`
    }
  });
  await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: "SEPAY",
      status: "PAID",
      amount: order.total,
      currency: order.currency,
      paymentCode,
      providerReference: `sepay_paid_${runId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      paidAt: new Date()
    }
  });
  const staleAttempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: "STRIPE",
      status: "EXPIRED",
      amount: order.total,
      currency: order.currency,
      providerReference: `cs_after_paid_${runId}`,
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  const paymentIntentId = `pi_after_paid_${runId}`;
  const body = stripeEvent("checkout.session.completed", {
    id: `cs_after_paid_${runId}`,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { orderId: order.id, paymentAttemptId: staleAttempt.id },
    payment_intent: paymentIntentId,
    payment_status: "paid"
  });
  const stripeSignature = signature(body);

  expect((await postWebhook(request, body, stripeSignature)).status()).toBe(200);
  expect((await postWebhook(request, body, stripeSignature)).status()).toBe(200);

  expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(
    expect.objectContaining({
      status: "PAID",
      paymentProvider: "SEPAY",
      paymentReference: `sepay_paid_${runId}`
    })
  );
  const exceptions = await prisma.paymentException.findMany({ where: { providerReference: paymentIntentId } });
  expect(exceptions).toHaveLength(1);
  expect(exceptions[0]).toEqual(
    expect.objectContaining({
      type: "STALE_ATTEMPT",
      status: "OPEN",
      orderId: order.id,
      paymentAttemptId: staleAttempt.id
    })
  );
});

test("signed refund events reverse fulfillment idempotently while Stripe is disabled", async ({ request }) => {
  const refundBody = stripeEvent("charge.refunded", {
    id: `ch_refund_${runId}`,
    object: "charge",
    payment_intent: `pi_refund_${runId}`
  });
  const refundSignature = signature(refundBody);
  expect((await postWebhook(request, refundBody, refundSignature)).status()).toBe(200);
  expect((await postWebhook(request, refundBody, refundSignature)).status()).toBe(200);
  expect((await prisma.order.findUniqueOrThrow({ where: { id: refundOrderId } })).status).toBe("REFUNDED");
});
