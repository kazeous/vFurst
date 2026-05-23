import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager, requireEventMember } from "@/server/rbac";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { createRegistrationQuestionInputSchema } from "@/shared/schemas/registration";

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
    await requireEventMember(userId, eventId);

    const questions = await db.registrationQuestion.findMany({
      where: { eventId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({ questions });
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
    const input = await parseJsonBody(request, createRegistrationQuestionInputSchema);

    const question = await db.registrationQuestion.create({
      data: {
        eventId,
        label: input.label,
        helpText: input.helpText,
        type: input.type,
        required: input.required,
        sortOrder: input.sortOrder
      }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "registration_question.created",
      entityType: "RegistrationQuestion",
      entityId: question.id,
      metadata: { label: question.label, type: question.type }
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
