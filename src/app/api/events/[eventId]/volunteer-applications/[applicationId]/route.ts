import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { updateVolunteerApplicationInputSchema } from "@/shared/schemas/volunteer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    applicationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, applicationId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateVolunteerApplicationInputSchema);

    const application = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.volunteerApplication.findUnique({
        where: { id: applicationId },
        include: { assignments: true }
      });

      if (!existing || existing.eventId !== eventId) {
        notFound("Volunteer application not found");
      }

      if (input.departmentId) {
        const department = await tx.volunteerDepartment.findUnique({ where: { id: input.departmentId } });
        if (!department || department.eventId !== eventId) {
          throw new HttpError(400, "Volunteer department not found for this event.");
        }

        await tx.volunteerAssignment.upsert({
          where: {
            applicationId_departmentId: {
              applicationId: existing.id,
              departmentId: department.id
            }
          },
          create: {
            applicationId: existing.id,
            departmentId: department.id,
            state: input.assignmentState ?? "INTERESTED",
            note: input.assignmentNote,
            createdByUserId: userId
          },
          update: {
            state: input.assignmentState ?? "INTERESTED",
            note: input.assignmentNote,
            createdByUserId: userId
          }
        });
      }

      const updated = await tx.volunteerApplication.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          adminNote: input.adminNote,
          reviewedByUserId: userId,
          reviewedAt: new Date()
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
          assignments: {
            orderBy: { updatedAt: "desc" },
            include: {
              department: {
                select: {
                  id: true,
                  name: true,
                  leadUser: { select: { id: true, name: true, email: true } }
                }
              }
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: access.event.organizationId,
          eventId,
          actorUserId: userId,
          action: "volunteer_application.reviewed",
          entityType: "VolunteerApplication",
          entityId: existing.id,
          metadata: {
            status: input.status,
            departmentId: input.departmentId,
            assignmentState: input.assignmentState,
            adminNote: input.adminNote
          }
        }
      });

      return updated;
    });

    return NextResponse.json({ application });
  } catch (error) {
    return handleRouteError(error);
  }
}
