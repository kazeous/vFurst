import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventOperator } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { updateCheckInInputSchema } from "@/shared/schemas/check-in";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    registrationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, registrationId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventOperator(userId, eventId);
    const input = await parseJsonBody(request, updateCheckInInputSchema);

    const existing = await db.registration.findUnique({
      where: { id: registrationId },
      include: { attendeeProfile: true, product: true }
    });

    if (!existing || existing.eventId !== eventId) {
      notFound("Registration not found");
    }

    const checkedInAt = input.checkedIn === undefined ? undefined : input.checkedIn ? new Date() : null;
    const checkedInByUserId = input.checkedIn === undefined ? undefined : input.checkedIn ? userId : null;

    const registration = await db.registration.update({
      where: { id: existing.id },
      data: {
        checkedInAt,
        checkedInByUserId,
        badgeStatus: input.badgeStatus,
        cashierNote: input.cashierNote
      },
      include: {
        attendeeProfile: true,
        product: true,
        checkedInBy: { select: { id: true, name: true, email: true } }
      }
    });

    await db.auditLog.create({
      data: {
        organizationId: access.event.organizationId,
        eventId,
        actorUserId: userId,
        action: input.checkedIn ? "registration.checked_in" : input.checkedIn === false ? "registration.check_in_reversed" : "registration.check_in_updated",
        entityType: "Registration",
        entityId: existing.id,
        metadata: {
          checkedIn: input.checkedIn,
          badgeStatus: input.badgeStatus,
          cashierNoteUpdated: input.cashierNote !== undefined
        }
      }
    });

    return NextResponse.json({ registration });
  } catch (error) {
    return handleRouteError(error);
  }
}
