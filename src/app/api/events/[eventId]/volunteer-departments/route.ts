import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, HttpError, parseJsonBody } from "@/server/http";
import { createVolunteerDepartmentInputSchema } from "@/shared/schemas/volunteer";

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

    const departments = await db.volunteerDepartment.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      include: {
        leadUser: { select: { id: true, name: true, email: true } },
        _count: { select: { assignments: true } }
      }
    });

    return NextResponse.json({ departments });
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
    const input = await parseJsonBody(request, createVolunteerDepartmentInputSchema);

    if (input.leadUserId) {
      const leadAccess = await db.eventMember.findFirst({
        where: {
          eventId,
          userId: input.leadUserId
        },
        select: { id: true }
      });

      const orgLeadAccess = await db.organizationMember.findFirst({
        where: {
          organizationId: access.event.organizationId,
          userId: input.leadUserId
        },
        select: { id: true }
      });

      if (!leadAccess && !orgLeadAccess) {
        throw new HttpError(400, "Department lead must be an event or organization member.");
      }
    }

    const department = await db.volunteerDepartment.create({
      data: {
        eventId,
        name: input.name,
        description: input.description,
        leadUserId: input.leadUserId
      },
      include: {
        leadUser: { select: { id: true, name: true, email: true } },
        _count: { select: { assignments: true } }
      }
    });

    await db.auditLog.create({
      data: {
        organizationId: access.event.organizationId,
        eventId,
        actorUserId: userId,
        action: "volunteer_department.created",
        entityType: "VolunteerDepartment",
        entityId: department.id,
        metadata: { name: department.name, leadUserId: department.leadUserId }
      }
    });

    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
