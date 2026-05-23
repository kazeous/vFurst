import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { updateCartItemInputSchema } from "@/shared/schemas/cart";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    cartItemId: string;
  }>;
};

async function requireOwnedCartItem(eventId: string, userId: string, cartItemId: string) {
  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true }
  });

  if (!item || item.cart.eventId !== eventId || item.cart.userId !== userId) {
    notFound("Cart item not found");
  }

  return item;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, cartItemId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOwnedCartItem(eventId, userId, cartItemId);
    const input = await parseJsonBody(request, updateCartItemInputSchema);

    const item = await db.cartItem.update({
      where: { id: cartItemId },
      data: { quantity: input.quantity }
    });

    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { eventId, cartItemId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOwnedCartItem(eventId, userId, cartItemId);

    await db.cartItem.delete({ where: { id: cartItemId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
