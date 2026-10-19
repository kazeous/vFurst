"use server";

import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import type { ActionFormState } from "@/lib/action-form-state";
import { assertPortalResourceOrg } from "@/lib/portal-context";
import { getRequestPortalOrg } from "@/lib/portal-request";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { getPortalCheckoutUrls } from "@/lib/payments/checkout-urls";
import { getEligiblePaymentProviders } from "@/lib/payments/platform";
import { createSePayPaymentCode } from "@/lib/payments/sepay";
import { getConnectedStripeAccount, getStripe } from "@/lib/payments/stripe";
import { resolveStripeCheckoutSession } from "@/lib/payments/stripe-checkout-session";
import { markOrderPaidWithProvider } from "@/lib/fulfillment";
import {
  PAYMENT_ATTEMPT_TTL_MS,
  Prisma,
  prisma,
  reservePaymentAttempt,
  type PaymentAttempt
} from "@vfurst/db";
import { randomUUID } from "node:crypto";
import { notFound, unstable_rethrow } from "next/navigation";
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

async function expireStripeAttempt(attempt: PaymentAttempt) {
  await prisma.$transaction(
    async (tx) => {
      const expired = await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          orderId: attempt.orderId,
          activeOrderId: attempt.orderId,
          provider: "STRIPE",
          status: "PENDING"
        },
        data: {
          status: "EXPIRED",
          activeOrderId: null
        }
      });

      if (expired.count === 1 && attempt.providerReference) {
        await tx.order.updateMany({
          where: {
            id: attempt.orderId,
            status: "PENDING",
            paymentProvider: "STRIPE",
            paymentReference: attempt.providerReference
          },
          data: {
            paymentProvider: null,
            paymentReference: null
          }
        });
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}

export async function startStripePayment(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await startStripePaymentInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function startStripePaymentInner(formData: FormData): Promise<ActionFormState> {
  const org = await getRequestPortalOrg();
  if (!org) notFound();
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  assertPortalResourceOrg(order.orgId, org);
  assertOrganizationActive(order.org.status);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || !providers.includes("STRIPE")) {
    throw new PublicActionError("Stripe is not available for this order.");
  }

  const connectedAccountId = await getConnectedStripeAccount(order.orgId);
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
  const { checkoutUrl, successUrl, cancelUrl } = getPortalCheckoutUrls(order.org, order.id, parsed.token);
  const session = attempt.providerReference
    ? await stripe.checkout.sessions.retrieve(attempt.providerReference)
    : await stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: order.id,
          customer_email: order.portalAccount.email,
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
          success_url: successUrl,
          cancel_url: cancelUrl
        },
        {
          idempotencyKey: `vfurst-payment-attempt-${attempt.id}`
        }
      );

  if (attempt.providerReference) {
    const outcome = resolveStripeCheckoutSession(session);

    if (outcome.type === "paid") {
      await markOrderPaidWithProvider(order.id, "STRIPE", outcome.paymentIntentId, {
        paymentAttemptId: attempt.id,
        attemptProviderReference: session.id
      });
      return { redirectTo: successUrl };
    }

    if (outcome.type === "expired") {
      await expireStripeAttempt(attempt);
      return { redirectTo: `${checkoutUrl}&expired=stripe` };
    }

    if (outcome.type === "pending") {
      return { redirectTo: successUrl };
    }

    return { redirectTo: outcome.url };
  }

  if (!session.url) {
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (expiryError) {
      console.error("Failed to expire a Stripe Checkout Session without a URL.", expiryError);
    }
    await expireStripeAttempt(attempt);
    return { redirectTo: `${checkoutUrl}&expired=stripe` };
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

  return { redirectTo: session.url };
}

export async function startSePayPayment(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await startSePayPaymentInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function startSePayPaymentInner(formData: FormData): Promise<ActionFormState> {
  const org = await getRequestPortalOrg();
  if (!org) notFound();
  const parsed = selection(formData);
  const order = await requireCheckoutOrder(parsed.orderId, parsed.token);
  assertPortalResourceOrg(order.orgId, org);
  assertOrganizationActive(order.org.status);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);

  if (order.status !== "PENDING" || order.currency !== "VND" || !providers.includes("SEPAY")) {
    throw new PublicActionError("SePay is not available for this order.");
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

  return { redirectTo: `/checkout/${order.id}?token=${encodeURIComponent(parsed.token)}&sepay=1` };
}
