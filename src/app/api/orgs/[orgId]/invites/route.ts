import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireOrganizationManager } from "@/server/rbac";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { createInviteExpiration, createInviteToken } from "@/server/invites";
import { writeAuditLog } from "@/server/audit";
import { createOrganizationInviteInputSchema } from "@/shared/schemas/organization";

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
    await requireOrganizationManager(userId, orgId);

    const invites = await db.organizationInvite.findMany({
      where: { organizationId: orgId },
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
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);
    const input = await parseJsonBody(request, createOrganizationInviteInputSchema);

    const invite = await db.organizationInvite.create({
      data: {
        organizationId: orgId,
        email: input.email,
        role: input.role,
        token: createInviteToken(),
        expiresAt: createInviteExpiration(),
        createdById: userId
      }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.invite.created",
      entityType: "OrganizationInvite",
      entityId: invite.id,
      metadata: { email: input.email, role: input.role }
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
