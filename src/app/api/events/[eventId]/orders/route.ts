import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, HttpError } from "@/server/http";
import { assertProductCanBeOrdered, assertStockAvailable, sumOrderItems } from "@/server/orders";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireEventManager(userId, eventId);

    const orders = await db.order.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: true,
        payments: true,
        refunds: true
      }
    });

    return NextResponse.json({ orders });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const order = await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const cart = await tx.cart.findUnique({
          where: {
            eventId_userId: {
              eventId,
              userId
            }
          },
          include: {
            items: {
              include: {
                product: true
              }
            }
          }
        });

        if (!cart || cart.items.length === 0) {
          throw new HttpError(400, "Cart is empty");
        }

        for (const item of cart.items) {
          assertProductCanBeOrdered(item.product);
          await assertStockAvailable(tx, item.product, item.quantity);
        }

        const subtotalCents = sumOrderItems(
          cart.items.map((item) => ({
            quantity: item.quantity,
            unitPriceCents: item.product.basePriceCents
          }))
        );

        const createdOrder = await tx.order.create({
          data: {
            eventId,
            userId,
            status: "UNPAID",
            subtotalCents,
            totalCents: subtotalCents,
            currency: "usd",
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                productName: item.product.displayName,
                productCategory: item.product.category,
                unitPriceCents: item.product.basePriceCents,
                quantity: item.quantity,
                totalCents: item.quantity * item.product.basePriceCents
              }))
            }
          },
          include: {
            items: true,
            payments: true,
            refunds: true
          }
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        return createdOrder;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
