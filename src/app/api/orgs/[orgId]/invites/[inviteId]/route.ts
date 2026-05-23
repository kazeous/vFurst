import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationManager } from "@/server/rbac";
import { handleRouteError, notFound } from "@/server/http";
import { writeAuditLog } from "@/server/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
    inviteId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { orgId, inviteId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);

    const invite = await db.organizationInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.organizationId !== orgId) {
      notFound("Organization invite not found");
    }

    const revoked = await db.organizationInvite.update({
      where: { id: inviteId },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.invite.revoked",
      entityType: "OrganizationInvite",
      entityId: inviteId,
      metadata: { email: invite.email, role: invite.role }
    });

    return NextResponse.json({ invite: revoked });
  } catch (error) {
    return handleRouteError(error);
  }
}
