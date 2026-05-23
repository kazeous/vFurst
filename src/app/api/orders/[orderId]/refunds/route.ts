import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { createRefundInputSchema } from "@/shared/schemas/order";

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
    const input = await parseJsonBody(request, createRefundInputSchema);

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      notFound("Order not found");
    }

    const access = await requireEventManager(userId, order.eventId);

    if (input.amountCents > order.totalCents) {
      throw new HttpError(400, "Refund amount cannot exceed order total");
    }

    const refund = await db.refund.create({
      data: {
        orderId: order.id,
        eventId: order.eventId,
        paymentId: input.paymentId,
        amountCents: input.amountCents,
        reason: input.reason,
        status: "PENDING",
        createdByUserId: userId
      }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId: order.eventId,
      actorUserId: userId,
      action: "order.refund_recorded",
      entityType: "Refund",
      entityId: refund.id,
      metadata: { orderId: order.id, amountCents: input.amountCents, reason: input.reason }
    });

    return NextResponse.json({ refund }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
