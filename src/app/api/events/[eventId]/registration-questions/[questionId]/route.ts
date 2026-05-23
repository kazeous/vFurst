import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { updateRegistrationQuestionInputSchema } from "@/shared/schemas/registration";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    questionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, questionId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateRegistrationQuestionInputSchema);

    const existing = await db.registrationQuestion.findUnique({ where: { id: questionId } });
    if (!existing || existing.eventId !== eventId) {
      notFound("Registration question not found");
    }

    const question = await db.registrationQuestion.update({
      where: { id: questionId },
      data: input
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "registration_question.updated",
      entityType: "RegistrationQuestion",
      entityId: questionId,
      metadata: { label: question.label, type: question.type }
    });

    return NextResponse.json({ question });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { eventId, questionId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);

    const existing = await db.registrationQuestion.findUnique({ where: { id: questionId } });
    if (!existing || existing.eventId !== eventId) {
      notFound("Registration question not found");
    }

    await db.registrationQuestion.delete({ where: { id: questionId } });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "registration_question.deleted",
      entityType: "RegistrationQuestion",
      entityId: questionId,
      metadata: { label: existing.label }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
