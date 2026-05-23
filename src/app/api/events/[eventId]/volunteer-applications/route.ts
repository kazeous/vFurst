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

    const applications = await db.volunteerApplication.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        assignments: {
          orderBy: { updatedAt: "desc" },
          include: {
            department: {
              select: {
                id: true,
                name: true,
                leadUser: { select: { id: true, name: true, email: true } }
              }
            }
          }
        }
      }
    });

    return NextResponse.json({ applications });
  } catch (error) {
    return handleRouteError(error);
  }
}
