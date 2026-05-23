import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationManager, requireOrganizationMember } from "@/server/rbac";
import { handleRouteError, HttpError, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { slugify } from "@/server/slug";
import { updateOrganizationInputSchema } from "@/shared/schemas/organization";

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
    const membership = await requireOrganizationMember(userId, orgId);

    const organization = await db.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            events: true,
            members: true,
            invites: true
          }
        }
      }
    });

    return NextResponse.json({ organization, membership });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);

    const input = await parseJsonBody(request, updateOrganizationInputSchema);
    const nextSlug = input.slug ?? (input.name ? slugify(input.name) : undefined);

    if (nextSlug) {
      const existing = await db.organization.findUnique({ where: { slug: nextSlug } });
      if (existing && existing.id !== orgId) {
        throw new HttpError(409, "Organization slug is already in use");
      }
    }

    const organization = await db.organization.update({
      where: { id: orgId },
      data: {
        name: input.name,
        slug: nextSlug
      }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.updated",
      entityType: "Organization",
      entityId: orgId,
      metadata: input
    });

    return NextResponse.json({ organization });
  } catch (error) {
    return handleRouteError(error);
  }
}
