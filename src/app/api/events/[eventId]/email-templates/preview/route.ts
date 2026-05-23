import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import {
  EMAIL_TEMPLATE_SAMPLE_DATA,
  renderEmailTemplate,
  resolveEmailTemplate
} from "@/server/email";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { previewEmailTemplateSchema } from "@/shared/schemas/email";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, previewEmailTemplateSchema);
    const effective = await resolveEmailTemplate({ key: input.key, organizationId: access.event.organizationId, eventId });
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

