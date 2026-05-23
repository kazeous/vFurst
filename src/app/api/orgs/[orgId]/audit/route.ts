import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationManager } from "@/server/rbac";
import { handleRouteError } from "@/server/http";
import { parsePagination } from "@/server/pagination";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);

    const { skip, take, page, pageSize } = parsePagination(new URL(request.url).searchParams);
    const [items, total] = await db.$transaction([
      db.auditLog.findMany({
        where: { organizationId: orgId },
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
      db.auditLog.count({ where: { organizationId: orgId } })
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (error) {
    return handleRouteError(error);
  }
}
