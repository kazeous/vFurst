import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { listEffectiveEmailTemplates, upsertScopedEmailTemplate } from "@/server/email";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { getSessionUserId, requireOrganizationManager } from "@/server/rbac";
import { writeAuditLog } from "@/server/audit";
import { upsertEmailTemplateSchema } from "@/shared/schemas/email";

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

    const [templates, overrides] = await Promise.all([
      listEffectiveEmailTemplates({ organizationId: orgId }),
      db.emailTemplate.findMany({
        where: {
          organizationId: orgId,
          scope: "ORGANIZATION"
        },
        orderBy: { updatedAt: "desc" }
      })
    ]);

    return NextResponse.json({ templates, overrides });
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
    const input = await parseJsonBody(request, upsertEmailTemplateSchema);

    const template = await upsertScopedEmailTemplate({
      scope: "ORGANIZATION",
      organizationId: orgId,
      template: input
    });

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: userId,
      action: "email.template.upserted",
      entityType: "EmailTemplate",
      entityId: template.id,
      metadata: { key: template.key, scope: template.scope, enabled: template.enabled }
    });

    return NextResponse.json({ template });
  } catch (error) {
    return handleRouteError(error);
  }
}

