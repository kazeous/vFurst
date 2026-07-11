"use server";

import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { getEligiblePaymentProviders } from "@/lib/payments/platform";
import { createSePayPaymentCode } from "@/lib/payments/sepay";
import { getBaseUrl, getConnectedStripeAccount, getStripe } from "@/lib/payments/stripe";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import { z } from "zod";

const checkoutSelectionSchema = z.object({
  orderId: z.string().uuid(),
  token: z.string().min(20)
});

function selection(formData: FormData) {
  return checkoutSelectionSchema.parse({
    orderId: formData.get("orderId"),
    token: formData.get("token")
  });
}

async function assertNoActiveAttempt(orderId: string) {
  const active = await prisma.paymentAttempt.findFirst({
    where: {
      orderId,
      status: "PENDING",
      expiresAt: {
        gt: new Date()
      }
    }
  });

  if (active) {
    throw new Error("This order already has an active payment attempt.");
  }

  await prisma.paymentAttempt.updateMany({
    where: {
      orderId,
      status: "PENDING",
      expiresAt: {
        lte: new Date()
      }
    },
    data: {
      status: "EXPIRED"
    }
  });
}

export async function startStripePayment(formData: FormData) {
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || !providers.includes("STRIPE")) {
    throw new Error("Stripe is not available for this order.");
  }

  await assertNoActiveAttempt(order.id);
  const connectedAccountId = await getConnectedStripeAccount(order.orgId);
  const checkoutUrl = `${getBaseUrl()}/checkout/${order.id}?token=${encodeURIComponent(parsed.token)}`;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: order.userId ? (await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true } }))?.email : undefined,
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: {
            name: `${order.event.name} order`
          },
          unit_amount: order.total
        },
        quantity: 1
      }
    ],
    payment_intent_data: {
      application_fee_amount: order.platformFee,
      transfer_data: {
        destination: connectedAccountId
      },
      metadata: {
        orderId: order.id,
        eventId: order.eventId,
        orgId: order.orgId
      }
    },
    metadata: {
      orderId: order.id,
      eventId: order.eventId,
      orgId: order.orgId
    },
    success_url: `${checkoutUrl}&returned=stripe`,
    cancel_url: `${checkoutUrl}&cancelled=stripe`
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  await prisma.$transaction([
    prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "STRIPE",
        amount: order.total,
        currency: order.currency,
        providerReference: session.id,
        expiresAt: new Date(session.expires_at * 1000)
      }
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: "STRIPE", paymentReference: session.id }
    })
  ]);

  redirect(session.url);
}

export async function startSePayPayment(formData: FormData) {
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || order.currency !== "VND" || !providers.includes("SEPAY")) {
    throw new Error("SePay is not available for this order.");
  }

  await assertNoActiveAttempt(order.id);
  let paymentCode = createSePayPaymentCode();

  while (await prisma.paymentAttempt.findUnique({ where: { paymentCode } })) {
    paymentCode = createSePayPaymentCode();
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.$transaction([
    prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "SEPAY",
        amount: order.total,
        currency: order.currency,
        paymentCode,
        expiresAt
      }
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: "SEPAY", paymentReference: paymentCode, checkoutExpiresAt: expiresAt }
    })
  ]);

  redirect(`/checkout/${order.id}?token=${encodeURIComponent(parsed.token)}&sepay=1`);
}
