import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationManager, requireOrganizationMember } from "@/server/rbac";
import { handleRouteError, HttpError, parseJsonBody } from "@/server/http";
import { slugify } from "@/server/slug";
import { createEventInputSchema } from "@/shared/schemas/event";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationMember(userId, orgId);

    const events = await db.event.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            members: true,
            invites: true
          }
        }
      }
    });

    return NextResponse.json({ events });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);
    const input = await parseJsonBody(request, createEventInputSchema);
    const slug = input.slug ?? slugify(input.name);

    if (!slug) {
      throw new HttpError(400, "Event slug is required");
    }

    const existing = await db.event.findUnique({
      where: {
        organizationId_slug: {
          organizationId: orgId,
          slug
        }
      }
    });

    if (existing) {
      throw new HttpError(409, "Event slug is already in use for this organization");
    }

    const event = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.event.create({
        data: {
          organizationId: orgId,
          name: input.name,
          slug,
          timezone: input.timezone,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          venueName: input.venueName,
          contactEmail: input.contactEmail,
          description: input.description,
          members: {
            create: {
              userId,
              role: "EVENT_ADMIN"
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          eventId: created.id,
          actorUserId: userId,
          action: "event.created",
          entityType: "Event",
          entityId: created.id,
          metadata: { name: created.name, slug: created.slug }
        }
      });

      return created;
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
