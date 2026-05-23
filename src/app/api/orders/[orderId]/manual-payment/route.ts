import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventOperator } from "@/server/rbac";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { manualPaymentInputSchema } from "@/shared/schemas/order";
import { markVendorApplicationsPaidForOrder } from "@/server/vendors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const input = await parseJsonBody(request, manualPaymentInputSchema);

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      notFound("Order not found");
    }

    const access = await requireEventOperator(userId, order.eventId);

    if (order.status !== "UNPAID") {
      throw new HttpError(409, "Only unpaid orders can be marked paid");
    }

    const payment = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.payment.create({
        data: {
          orderId: order.id,
          eventId: order.eventId,
          provider: "OFFLINE",
          status: "SUCCEEDED",
          amountCents: order.totalCents,
          currency: order.currency,
          offlineNote: input.note,
          markedByUserId: userId
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAID" }
      });

      await markVendorApplicationsPaidForOrder(tx, order.id);

      await tx.auditLog.create({
        data: {
          organizationId: access.event.organizationId,
          eventId: order.eventId,
          actorUserId: userId,
          action: "order.manual_payment_marked",
          entityType: "Order",
          entityId: order.id,
          metadata: { amountCents: order.totalCents, note: input.note }
        }
      });

      return created;
    });

    return NextResponse.json({ payment });
  } catch (error) {
    return handleRouteError(error);
  }
}
