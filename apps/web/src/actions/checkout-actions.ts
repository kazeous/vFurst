"use server";

import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { getEligiblePaymentProviders } from "@/lib/payments/platform";
import { createSePayPaymentCode } from "@/lib/payments/sepay";
import { getBaseUrl, getConnectedStripeAccount, getStripe } from "@/lib/payments/stripe";
import {
  PAYMENT_ATTEMPT_TTL_MS,
  Prisma,
  prisma,
  reservePaymentAttempt,
  type PaymentAttempt
} from "@vfurst/db";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

const STRIPE_EXPIRY_SAFETY_MS = 10_000;

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

async function persistStripeSession(attempt: PaymentAttempt, session: { id: string; expires_at: number }) {
  await prisma.$transaction(
    async (tx) => {
      const updatedAttempt = await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          orderId: attempt.orderId,
          activeOrderId: attempt.orderId,
          provider: "STRIPE",
          status: "PENDING",
          providerReference: null
        },
        data: {
          providerReference: session.id,
          expiresAt: new Date(session.expires_at * 1000)
        }
      });

      if (updatedAttempt.count === 0) {
        const current = await tx.paymentAttempt.findUnique({ where: { id: attempt.id } });
        if (
          !current ||
          current.orderId !== attempt.orderId ||
          current.activeOrderId !== attempt.orderId ||
          current.status !== "PENDING" ||
          current.providerReference !== session.id
        ) {
          throw new Error("The authoritative payment attempt changed while Stripe checkout was being created.");
        }
      }

      const updatedOrder = await tx.order.updateMany({
        where: {
          id: attempt.orderId,
          status: "PENDING",
          paymentProvider: "STRIPE"
        },
        data: {
          paymentReference: session.id,
          checkoutExpiresAt: new Date(session.expires_at * 1000)
        }
      });

      if (updatedOrder.count !== 1) {
        throw new Error("The order changed while Stripe checkout was being created.");
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}

export async function startStripePayment(formData: FormData) {
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  assertOrganizationActive(order.org.status);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || !providers.includes("STRIPE")) {
    throw new Error("Stripe is not available for this order.");
  }

  const [connectedAccountId, customer] = await Promise.all([
    getConnectedStripeAccount(order.orgId),
    order.userId
      ? prisma.user.findUnique({
          where: { id: order.userId },
          select: { email: true }
        })
      : null
  ]);
  const reservation = await reservePaymentAttempt(prisma, {
    id: randomUUID(),
    orderId: order.id,
    provider: "STRIPE",
    amount: order.total,
    currency: order.currency,
    expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MS + STRIPE_EXPIRY_SAFETY_MS)
  });
  const attempt = reservation.attempt;
  const stripe = getStripe();
  const checkoutUrl = `${getBaseUrl()}/checkout/${order.id}?token=${encodeURIComponent(parsed.token)}`;
  const session = attempt.providerReference
    ? await stripe.checkout.sessions.retrieve(attempt.providerReference)
    : await stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: order.id,
          customer_email: customer?.email,
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
              paymentAttemptId: attempt.id,
              orderId: order.id,
              eventId: order.eventId,
              orgId: order.orgId
            }
          },
          metadata: {
            paymentAttemptId: attempt.id,
            orderId: order.id,
            eventId: order.eventId,
            orgId: order.orgId
          },
          expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
          success_url: `${checkoutUrl}&returned=stripe`,
          cancel_url: `${checkoutUrl}&cancelled=stripe`
        },
        {
          idempotencyKey: `vfurst-payment-attempt-${attempt.id}`
        }
      );

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  if (!attempt.providerReference) {
    try {
      await persistStripeSession(attempt, session);
    } catch (error) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expiryError) {
        console.error("Failed to expire an orphaned Stripe Checkout Session.", expiryError);
      }
      throw error;
    }
  }

  redirect(session.url);
}

export async function startSePayPayment(formData: FormData) {
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  assertOrganizationActive(order.org.status);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || order.currency !== "VND" || !providers.includes("SEPAY")) {
    throw new Error("SePay is not available for this order.");
  }

  await reservePaymentAttempt(prisma, {
    id: randomUUID(),
    orderId: order.id,
    provider: "SEPAY",
    amount: order.total,
    currency: order.currency,
    paymentCode: createSePayPaymentCode(),
    expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MS)
  });

  redirect(`/checkout/${order.id}?token=${encodeURIComponent(parsed.token)}&sepay=1`);
}
