import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationMember } from "@/server/rbac";
import { handleRouteError } from "@/server/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationMember(userId, orgId);

    const members = await db.organizationMember.findMany({
      where: { organizationId: orgId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    return NextResponse.json({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}
