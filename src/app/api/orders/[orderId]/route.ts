import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventMember } from "@/server/rbac";
import { handleRouteError, notFound } from "@/server/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        event: { select: { id: true, name: true, slug: true, organizationId: true } },
        user: { select: { id: true, name: true, email: true } },
        items: true,
        payments: true,
        refunds: true
      }
    });

    if (!order) {
      notFound("Order not found");
    }

    if (order.userId !== userId) {
      await requireEventMember(userId, order.eventId);
    }

    return NextResponse.json({ order });
  } catch (error) {
    return handleRouteError(error);
  }
}
