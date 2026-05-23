import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError } from "@/server/http";

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

    const applications = await db.vendorApplication.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        requestedTableProduct: { select: { id: true, displayName: true, basePriceCents: true } },
        approvedOrder: { select: { id: true, status: true, totalCents: true } },
        amenities: { orderBy: { createdAt: "asc" } },
        assistants: { orderBy: { createdAt: "asc" } },
        seatingPreferences: { orderBy: { sortOrder: "asc" } }
      }
    });

    return NextResponse.json({ applications });
  } catch (error) {
    return handleRouteError(error);
  }
}
