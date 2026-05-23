import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { assertProductCanBeOrdered } from "@/server/orders";
import { upsertCartItemInputSchema } from "@/shared/schemas/cart";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

async function getOrCreateCart(eventId: string, userId: string) {
  return db.cart.upsert({
    where: {
      eventId_userId: {
        eventId,
        userId
      }
    },
    create: { eventId, userId },
    update: {},
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" } }
            }
          }
        }
      }
    }
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) {
      notFound("Event not found");
    }

    const cart = await getOrCreateCart(eventId, userId);
    return NextResponse.json({ cart });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const input = await parseJsonBody(request, upsertCartItemInputSchema);

    const product = await db.product.findFirst({
      where: {
        id: input.productId,
        eventId
      }
    });

    if (!product) {
      notFound("Product not found");
    }

    assertProductCanBeOrdered(product);

    const cart = await db.cart.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId
        }
      },
      create: {
        eventId,
        userId
      },
      update: {}
    });

    const item = await db.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id
        }
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity: input.quantity
      },
      update: {
        quantity: input.quantity
      }
    });

    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
