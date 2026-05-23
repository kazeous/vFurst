import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager, requireEventMember } from "@/server/rbac";
import { handleRouteError, HttpError, parseJsonBody } from "@/server/http";
import { slugify } from "@/server/slug";
import { writeAuditLog } from "@/server/audit";
import { updateEventInputSchema } from "@/shared/schemas/event";

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
    const access = await requireEventMember(userId, eventId);

    return NextResponse.json({
      event: access.event,
      eventMembership: access.eventMembership,
      organizationMembership: access.organizationMembership
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateEventInputSchema);
    const nextSlug = input.slug ?? (input.name ? slugify(input.name) : undefined);

    if (nextSlug) {
      const existing = await db.event.findUnique({ where: { slug: nextSlug } });

      if (existing && existing.id !== eventId) {
        throw new HttpError(409, "Event slug is already in use");
      }
    }

    const event = await db.event.update({
      where: { id: eventId },
      data: {
        name: input.name,
        slug: nextSlug,
        status: input.status,
        timezone: input.timezone,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        venueName: input.venueName,
        contactEmail: input.contactEmail,
        description: input.description
      }
    });

    await writeAuditLog({
      organizationId: event.organizationId,
      eventId: event.id,
      actorUserId: userId,
      action: "event.updated",
      entityType: "Event",
      entityId: event.id,
      metadata: input
    });

    return NextResponse.json({ event });
  } catch (error) {
    return handleRouteError(error);
  }
}
