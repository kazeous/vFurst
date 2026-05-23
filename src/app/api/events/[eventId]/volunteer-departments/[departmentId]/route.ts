import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { updateVolunteerDepartmentInputSchema } from "@/shared/schemas/volunteer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    departmentId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, departmentId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateVolunteerDepartmentInputSchema);

    const existing = await db.volunteerDepartment.findUnique({ where: { id: departmentId } });
    if (!existing || existing.eventId !== eventId) {
      notFound("Volunteer department not found");
    }

    if (input.leadUserId) {
      const leadAccess = await db.eventMember.findFirst({
        where: { eventId, userId: input.leadUserId },
        select: { id: true }
      });
      const orgLeadAccess = await db.organizationMember.findFirst({
        where: { organizationId: access.event.organizationId, userId: input.leadUserId },
        select: { id: true }
      });

      if (!leadAccess && !orgLeadAccess) {
        throw new HttpError(400, "Department lead must be an event or organization member.");
      }
    }

    const department = await db.volunteerDepartment.update({
      where: { id: departmentId },
      data: input,
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
        action: "volunteer_department.updated",
        entityType: "VolunteerDepartment",
        entityId: department.id,
        metadata: input
      }
    });

    return NextResponse.json({ department });
  } catch (error) {
    return handleRouteError(error);
  }
}
