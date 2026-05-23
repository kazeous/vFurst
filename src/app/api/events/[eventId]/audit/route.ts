import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError } from "@/server/http";
import { parsePagination } from "@/server/pagination";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireEventManager(userId, eventId);

    const { skip, take, page, pageSize } = parsePagination(new URL(request.url).searchParams);
    const [items, total] = await db.$transaction([
      db.auditLog.findMany({
        where: { eventId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }),
      db.auditLog.count({ where: { eventId } })
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (error) {
    return handleRouteError(error);
  }
}
