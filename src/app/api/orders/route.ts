import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const orders = await db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        event: { select: { id: true, name: true, slug: true } },
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
