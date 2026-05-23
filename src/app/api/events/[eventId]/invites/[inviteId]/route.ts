import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, notFound } from "@/server/http";
import { writeAuditLog } from "@/server/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    inviteId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { eventId, inviteId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);

    const invite = await db.eventInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.eventId !== eventId) {
      notFound("Event invite not found");
    }

    const revoked = await db.eventInvite.update({
      where: { id: inviteId },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "event.invite.revoked",
      entityType: "EventInvite",
      entityId: inviteId,
      metadata: { email: invite.email, role: invite.role }
    });

    return NextResponse.json({ invite: revoked });
  } catch (error) {
    return handleRouteError(error);
  }
}
