import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { forbidden, handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { updateEventMemberInputSchema } from "@/shared/schemas/event";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    memberId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, memberId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateEventMemberInputSchema);

    const member = await db.eventMember.findUnique({ where: { id: memberId } });
    if (!member || member.eventId !== eventId) {
      notFound("Event member not found");
    }

    if (member.userId === userId) {
      forbidden("You cannot change your own event role");
    }

    const updated = await db.eventMember.update({
      where: { id: memberId },
      data: { role: input.role }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "event.member.updated",
      entityType: "EventMember",
      entityId: memberId,
      metadata: { previousRole: member.role, nextRole: input.role }
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { eventId, memberId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);

    const member = await db.eventMember.findUnique({ where: { id: memberId } });
    if (!member || member.eventId !== eventId) {
      notFound("Event member not found");
    }

    if (member.userId === userId) {
      forbidden("You cannot remove your own event membership");
    }

    await db.eventMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "event.member.removed",
      entityType: "EventMember",
      entityId: memberId,
      metadata: { removedUserId: member.userId, previousRole: member.role }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
