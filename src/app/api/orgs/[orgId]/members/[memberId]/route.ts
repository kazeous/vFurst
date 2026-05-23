import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import {
  assertCanRemoveOrganizationMember,
  getSessionUserId,
  requireOrganizationManager
} from "@/server/rbac";
import { forbidden, handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { updateOrganizationMemberInputSchema } from "@/shared/schemas/organization";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
    memberId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { orgId, memberId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);
    const input = await parseJsonBody(request, updateOrganizationMemberInputSchema);

    const member = await db.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== orgId) {
      notFound("Organization member not found");
    }

    if (member.role === "OWNER") {
      forbidden("Organization owners cannot be changed in Phase 2");
    }

    if (member.userId === userId) {
      forbidden("You cannot change your own organization role");
    }

    const updated = await db.organizationMember.update({
      where: { id: memberId },
      data: { role: input.role }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.member.updated",
      entityType: "OrganizationMember",
      entityId: memberId,
      metadata: { previousRole: member.role, nextRole: input.role }
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { orgId, memberId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const member = await assertCanRemoveOrganizationMember(userId, orgId, memberId);

    await db.organizationMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "organization.member.removed",
      entityType: "OrganizationMember",
      entityId: memberId,
      metadata: { removedUserId: member.userId, previousRole: member.role }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
