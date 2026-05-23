import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import {
  EMAIL_TEMPLATE_SAMPLE_DATA,
  renderEmailTemplate,
  resolveEmailTemplate
} from "@/server/email";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { getSessionUserId, requireOrganizationManager } from "@/server/rbac";
import { previewEmailTemplateSchema } from "@/shared/schemas/email";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireOrganizationManager(userId, orgId);
    const input = await parseJsonBody(request, previewEmailTemplateSchema);
    const effective = await resolveEmailTemplate({ key: input.key, organizationId: orgId });
    const template = {
      ...effective,
      name: input.name ?? effective.name,
      subject: input.subject ?? effective.subject,
      bodyText: input.bodyText ?? effective.bodyText,
      bodyHtml: input.bodyHtml ?? effective.bodyHtml,
      enabled: input.enabled ?? effective.enabled,
      nonCritical: input.nonCritical ?? effective.nonCritical
    };

    return NextResponse.json({ preview: renderEmailTemplate(template, EMAIL_TEMPLATE_SAMPLE_DATA) });
  } catch (error) {
    return handleRouteError(error);
  }
}

