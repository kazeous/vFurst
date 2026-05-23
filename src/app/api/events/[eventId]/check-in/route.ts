import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventOperator } from "@/server/rbac";
import { handleRouteError } from "@/server/http";
import { isOrderStatusPaid } from "@/server/check-in";
import { checkInSearchQuerySchema } from "@/shared/schemas/check-in";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

function registrationWhere(eventId: string, query: string): Prisma.RegistrationWhereInput {
  const trimmed = query.trim();
  const base: Prisma.RegistrationWhereInput = {
    eventId,
    status: "SUBMITTED"
  };

  if (!trimmed) {
    return base;
  }

  return {
    ...base,
    OR: [
      { id: { contains: trimmed, mode: "insensitive" } },
      { attendeeProfile: { email: { contains: trimmed, mode: "insensitive" } } },
      { attendeeProfile: { firstName: { contains: trimmed, mode: "insensitive" } } },
      { attendeeProfile: { lastName: { contains: trimmed, mode: "insensitive" } } },
      { product: { displayName: { contains: trimmed, mode: "insensitive" } } }
    ]
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireEventOperator(userId, eventId);

    const url = new URL(request.url);
    const input = checkInSearchQuerySchema.parse({
      query: url.searchParams.get("query") ?? "",
      mode: url.searchParams.get("mode") ?? "standard"
    });

    const registrations = await db.registration.findMany({
      where: registrationWhere(eventId, input.query),
      orderBy: [{ checkedInAt: "asc" }, { createdAt: "desc" }],
      take: input.mode === "express" ? 12 : 25,
      include: {
        attendeeProfile: true,
        product: { select: { id: true, displayName: true, category: true, basePriceCents: true } },
        checkedInBy: { select: { id: true, name: true, email: true } }
      }
    });

    const attendeeUserIds = Array.from(new Set(registrations.map((registration) => registration.userId).filter(Boolean))) as string[];
    const orders = attendeeUserIds.length
      ? await db.order.findMany({
          where: {
            eventId,
            userId: { in: attendeeUserIds },
            items: {
              some: {
                productCategory: "REGISTRATION"
              }
            }
          },
          orderBy: { createdAt: "desc" },
          include: { payments: true }
        })
      : [];
    const ordersByUserId = new Map<string, typeof orders>();
    for (const order of orders) {
      ordersByUserId.set(order.userId, [...(ordersByUserId.get(order.userId) ?? []), order]);
    }

    const items = registrations.map((registration) => {
      const registrationOrders = registration.userId ? ordersByUserId.get(registration.userId) ?? [] : [];
      const paidOrder = registrationOrders.find((order) => isOrderStatusPaid(order.status));
      const unpaidOrder = registrationOrders.find((order) => order.status === "UNPAID");

      return {
        ...registration,
        paid: Boolean(paidOrder) || registration.product.basePriceCents === 0,
        orderStatus: paidOrder?.status ?? unpaidOrder?.status ?? (registration.product.basePriceCents === 0 ? "PAID" : "UNKNOWN"),
        payableOrderId: unpaidOrder?.id ?? null
      };
    });

    const checkedInCount = await db.registration.count({
      where: {
        eventId,
        status: "SUBMITTED",
        checkedInAt: { not: null }
      }
    });
    const totalCount = await db.registration.count({ where: { eventId, status: "SUBMITTED" } });

    return NextResponse.json({ items, summary: { checkedInCount, totalCount } });
  } catch (error) {
    return handleRouteError(error);
  }
}
