import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { handleRouteError } from "@/server/http";
import { verifyStripeSignature } from "@/server/stripe";
import { markVendorApplicationsPaidForOrder } from "@/server/vendors";

export const runtime = "nodejs";

type StripeCheckoutSessionCompleted = {
  id: string;
  payment_intent?: string;
  metadata?: {
    orderId?: string;
    eventId?: string;
  };
};

type StripeWebhookPayload = {
  id: string;
  type: string;
  data: {
    object: StripeCheckoutSessionCompleted;
  };
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    verifyStripeSignature(rawBody, request.headers.get("stripe-signature"));
    const payload = JSON.parse(rawBody) as StripeWebhookPayload;

    const existing = await db.stripeWebhookEvent.findUnique({
      where: { stripeEventId: payload.id }
    });

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const session = payload.data.object;
    const orderId = session.metadata?.orderId;
    const eventId = session.metadata?.eventId;

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.stripeWebhookEvent.create({
        data: {
          stripeEventId: payload.id,
          eventId: eventId ?? null,
          type: payload.type,
          payload: payload as unknown as Prisma.InputJsonValue
        }
      });

      if (payload.type === "checkout.session.completed" && orderId) {
        const order = await tx.order.findUnique({ where: { id: orderId } });

        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              stripeCheckoutSessionId: session.id
            }
          });

          await tx.payment.upsert({
            where: { id: `${order.id}:stripe` },
            create: {
              id: `${order.id}:stripe`,
              orderId: order.id,
              eventId: order.eventId,
              provider: "STRIPE",
              status: "SUCCEEDED",
              amountCents: order.totalCents,
              currency: order.currency,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent
            },
            update: {
              status: "SUCCEEDED",
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent
            }
          });

          await markVendorApplicationsPaidForOrder(tx, order.id);
        }
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
