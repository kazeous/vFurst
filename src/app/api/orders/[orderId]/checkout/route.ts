import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError, HttpError, notFound } from "@/server/http";
import { createStripeCheckoutSession } from "@/server/stripe";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order || order.userId !== userId) {
      notFound("Order not found");
    }

    if (order.status !== "UNPAID") {
      throw new HttpError(409, "Only unpaid orders can be checked out");
    }

    const checkoutSession = await createStripeCheckoutSession({
      orderId: order.id,
      eventId: order.eventId,
      lineItems: order.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitAmountCents: item.unitPriceCents
      }))
    });

    await db.$transaction([
      db.order.update({
        where: { id: order.id },
        data: { stripeCheckoutSessionId: checkoutSession.id }
      }),
      db.payment.upsert({
        where: {
          id: `${order.id}:stripe`
        },
        create: {
          id: `${order.id}:stripe`,
          orderId: order.id,
          eventId: order.eventId,
          provider: "STRIPE",
          status: "PENDING",
          amountCents: order.totalCents,
          currency: order.currency,
          stripeCheckoutSessionId: checkoutSession.id
        },
        update: {
          status: "PENDING",
          amountCents: order.totalCents,
          stripeCheckoutSessionId: checkoutSession.id
        }
      })
    ]);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    return handleRouteError(error);
  }
}
