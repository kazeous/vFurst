import "server-only";
import type { EmailTemplateKey, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { EMAIL_TEMPLATE_KEYS } from "@/shared/email";
import type { UpsertEmailTemplateInput } from "@/shared/schemas/email";

type EmailData = Record<string, unknown>;

type DefaultEmailTemplate = {
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  enabled: boolean;
  nonCritical: boolean;
};

export type ResolvedEmailTemplate = DefaultEmailTemplate & {
  id: string | null;
  key: EmailTemplateKey;
  source: "default" | "system" | "organization" | "event";
};

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, DefaultEmailTemplate> = {
  ORGANIZATION_INVITE: {
    name: "Organization invite",
    subject: "You have been invited to {{ organization.name }}",
    bodyText:
      "Hi,\n\n{{ inviter.name }} invited you to join {{ organization.name }} as {{ invite.role }}.\n\nAccept the invite: {{ invite.url }}\n\nThis invite expires on {{ invite.expiresAt }}.",
    enabled: true,
    nonCritical: false
  },
  EVENT_INVITE: {
    name: "Event team invite",
    subject: "You have been invited to help manage {{ event.name }}",
    bodyText:
      "Hi,\n\n{{ inviter.name }} invited you to join the {{ event.name }} event team as {{ invite.role }}.\n\nAccept the invite: {{ invite.url }}\n\nThis invite expires on {{ invite.expiresAt }}.",
    enabled: true,
    nonCritical: false
  },
  REGISTRATION_CONFIRMATION: {
    name: "Registration confirmation",
    subject: "Registration confirmed for {{ event.name }}",
    bodyText:
      "Hi {{ attendee.firstName }},\n\nYour registration for {{ event.name }} is confirmed.\n\nOrder: {{ order.id }}\nTotal: {{ order.total }}",
    enabled: true,
    nonCritical: false
  },
  VENDOR_APPLICATION_RECEIVED: {
    name: "Vendor application received",
    subject: "We received your vendor application for {{ event.name }}",
    bodyText:
      "Hi {{ vendor.contactName }},\n\nYour vendor application for {{ event.name }} has been received. We will email you when the organizer reviews it.",
    enabled: true,
    nonCritical: true
  },
  VOLUNTEER_APPLICATION_RECEIVED: {
    name: "Volunteer application received",
    subject: "We received your volunteer application for {{ event.name }}",
    bodyText:
      "Hi {{ volunteer.firstName }},\n\nYour volunteer application for {{ event.name }} has been received. A staff member will review it soon.",
    enabled: true,
    nonCritical: true
  },
  ORDER_RECEIPT: {
    name: "Order receipt",
    subject: "Receipt for {{ event.name }}",
    bodyText:
      "Hi,\n\nThanks for your order for {{ event.name }}.\n\nOrder: {{ order.id }}\nTotal: {{ order.total }}\nStatus: {{ order.status }}",
    enabled: true,
    nonCritical: false
  }
};

export const EMAIL_TEMPLATE_SAMPLE_DATA: EmailData = {
  organization: { name: "Sample Convention Guild" },
  event: { name: "Northstar Weekend", slug: "northstar-weekend" },
  inviter: { name: "Avery Admin", email: "avery@example.com" },
  invite: {
    role: "EVENT_ADMIN",
    url: `${env.AUTH_URL}/invites/sample-token`,
    expiresAt: "June 1, 2026"
  },
  attendee: { firstName: "Jordan", lastName: "Lee", email: "jordan@example.com" },
  vendor: { contactName: "Morgan Vendor", businessName: "Morgan Makes" },
  volunteer: { firstName: "Riley", lastName: "Patel" },
  order: { id: "ord_sample", total: "$75.00", status: "PAID" }
};

function getValue(data: EmailData, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return "";
    }

    return (current as Record<string, unknown>)[segment];
  }, data);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTemplateString(template: string, data: EmailData, options?: { escapeHtmlValues?: boolean }) {
  return template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, path: string) => {
    const value = getValue(data, path);
    const rendered = value instanceof Date ? value.toISOString() : String(value ?? "");
    return options?.escapeHtmlValues ? escapeHtml(rendered) : rendered;
  });
}

export function renderEmailTemplate(template: ResolvedEmailTemplate, data: EmailData) {
  return {
    subject: renderTemplateString(template.subject, data).replace(/[\r\n]+/g, " ").trim(),
    bodyText: renderTemplateString(template.bodyText, data),
    bodyHtml: template.bodyHtml ? renderTemplateString(template.bodyHtml, data, { escapeHtmlValues: true }) : null
  };
}

export async function resolveEmailTemplate(input: {
  key: EmailTemplateKey;
  organizationId?: string | null;
  eventId?: string | null;
}): Promise<ResolvedEmailTemplate> {
  const organizationId =
    input.organizationId ??
    (input.eventId
      ? (
          await db.event.findUnique({
            where: { id: input.eventId },
            select: { organizationId: true }
          })
        )?.organizationId
      : null);

  if (input.eventId) {
    const eventTemplate = await db.emailTemplate.findFirst({
      where: {
        eventId: input.eventId,
        key: input.key,
        scope: "EVENT"
      }
    });

    if (eventTemplate) {
      return { ...eventTemplate, id: eventTemplate.id, key: eventTemplate.key, source: "event" };
    }
  }

  if (organizationId) {
    const organizationTemplate = await db.emailTemplate.findFirst({
      where: {
        organizationId,
        key: input.key,
        scope: "ORGANIZATION"
      }
    });

    if (organizationTemplate) {
      return { ...organizationTemplate, id: organizationTemplate.id, key: organizationTemplate.key, source: "organization" };
    }
  }

  const systemTemplate = await db.emailTemplate.findFirst({
    where: {
      key: input.key,
      scope: "SYSTEM",
      organizationId: null,
      eventId: null
    }
  });

  if (systemTemplate) {
    return { ...systemTemplate, id: systemTemplate.id, key: systemTemplate.key, source: "system" };
  }

  return { ...DEFAULT_EMAIL_TEMPLATES[input.key], bodyHtml: DEFAULT_EMAIL_TEMPLATES[input.key].bodyHtml ?? null, id: null, key: input.key, source: "default" };
}

export async function listEffectiveEmailTemplates(input: { organizationId?: string | null; eventId?: string | null }) {
  return Promise.all(
    EMAIL_TEMPLATE_KEYS.map((key) =>
      resolveEmailTemplate({
        key,
        organizationId: input.organizationId,
        eventId: input.eventId
      })
    )
  );
}

export async function upsertScopedEmailTemplate(input: {
  scope: "ORGANIZATION" | "EVENT";
  organizationId?: string | null;
  eventId?: string | null;
  template: UpsertEmailTemplateInput;
}) {
  const existing = await db.emailTemplate.findFirst({
    where: {
      scope: input.scope,
      key: input.template.key,
      organizationId: input.organizationId ?? null,
      eventId: input.eventId ?? null
    }
  });

  const data = {
    scope: input.scope,
    key: input.template.key,
    organizationId: input.organizationId ?? null,
    eventId: input.eventId ?? null,
    name: input.template.name,
    subject: input.template.subject,
    bodyText: input.template.bodyText,
    bodyHtml: input.template.bodyHtml ?? null,
    enabled: input.template.enabled,
    nonCritical: input.template.nonCritical
  };

  if (existing) {
    return db.emailTemplate.update({
      where: { id: existing.id },
      data
    });
  }

  return db.emailTemplate.create({ data });
}

async function createEmailLog(input: {
  organizationId?: string | null;
  eventId?: string | null;
  templateId?: string | null;
  toEmail: string;
  subject: string;
  status: "SKIPPED" | "SENT" | "FAILED";
  providerMessageId?: string | null;
  error?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return db.emailLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      eventId: input.eventId ?? null,
      templateId: input.templateId ?? null,
      toEmail: input.toEmail,
      subject: input.subject,
      status: input.status,
      provider: "RESEND",
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      payload: input.payload ?? undefined
    }
  });
}

export async function sendTemplatedEmail(input: {
  key: EmailTemplateKey;
  organizationId?: string | null;
  eventId?: string | null;
  toEmail: string;
  data: EmailData;
}) {
  const template = await resolveEmailTemplate({
    key: input.key,
    organizationId: input.organizationId,
    eventId: input.eventId
  });
  const rendered = renderEmailTemplate(template, input.data);

  if (!template.enabled && template.nonCritical) {
    return createEmailLog({
      organizationId: input.organizationId,
      eventId: input.eventId,
      templateId: template.id,
      toEmail: input.toEmail,
      subject: rendered.subject,
      status: "SKIPPED",
      error: "Template is disabled",
      payload: { key: input.key }
    });
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return createEmailLog({
      organizationId: input.organizationId,
      eventId: input.eventId,
      templateId: template.id,
      toEmail: input.toEmail,
      subject: rendered.subject,
      status: "SKIPPED",
      error: "Email provider is not configured",
      payload: { key: input.key }
    });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: input.toEmail,
        subject: rendered.subject,
        text: rendered.bodyText,
        html: rendered.bodyHtml ?? undefined
      })
    });

    const responseBody = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

    if (!response.ok) {
      return createEmailLog({
        organizationId: input.organizationId,
        eventId: input.eventId,
        templateId: template.id,
        toEmail: input.toEmail,
        subject: rendered.subject,
        status: "FAILED",
        error: responseBody?.message ?? `Resend returned ${response.status}`,
        payload: { key: input.key }
      });
    }

    return createEmailLog({
      organizationId: input.organizationId,
      eventId: input.eventId,
      templateId: template.id,
      toEmail: input.toEmail,
      subject: rendered.subject,
      status: "SENT",
      providerMessageId: responseBody?.id ?? null,
      payload: { key: input.key }
    });
  } catch (error) {
    return createEmailLog({
      organizationId: input.organizationId,
      eventId: input.eventId,
      templateId: template.id,
      toEmail: input.toEmail,
      subject: rendered.subject,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Email provider request failed",
      payload: { key: input.key }
    });
  }
}
