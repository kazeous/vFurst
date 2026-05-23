import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { createInviteExpiration, createInviteToken } from "@/server/invites";
import { writeAuditLog } from "@/server/audit";
import { createEventInviteInputSchema } from "@/shared/schemas/event";

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

    const invites = await db.eventInvite.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json({ invites });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, createEventInviteInputSchema);

    const invite = await db.eventInvite.create({
      data: {
        eventId,
        email: input.email,
        role: input.role,
        token: createInviteToken(),
        expiresAt: createInviteExpiration(),
        createdById: userId
      }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "event.invite.created",
      entityType: "EventInvite",
      entityId: invite.id,
      metadata: { email: input.email, role: input.role }
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
