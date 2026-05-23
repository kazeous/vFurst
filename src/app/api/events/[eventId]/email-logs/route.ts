import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { handleRouteError } from "@/server/http";
import { parsePagination } from "@/server/pagination";
import { getSessionUserId, requireEventManager } from "@/server/rbac";

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
    const { page, pageSize, skip } = parsePagination(new URL(request.url).searchParams);

    const [items, total] = await Promise.all([
      db.emailLog.findMany({
        where: { eventId },
        include: {
          template: {
            select: {
              key: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      db.emailLog.count({ where: { eventId } })
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (error) {
    return handleRouteError(error);
  }
}

