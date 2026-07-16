import { getEventEmailTemplate, sendEmail, type EmailProviderConfig, type EmailTemplateName } from "@vfurst/email";
import { prisma, type EmailProviderType, type Organization } from "@vfurst/db";

type EmailOrg = Pick<Organization, "id" | "contactEmail" | "emailProvider" | "emailSettings" | "name">;

function settingsObject(settings: unknown) {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

export function getOrgEmailConfig(org: EmailOrg): EmailProviderConfig {
  const settings = settingsObject(org.emailSettings);
  const fromEmail = typeof settings.fromEmail === "string" ? settings.fromEmail : org.contactEmail;
  const provider = org.emailProvider as EmailProviderType;

  if (provider === "SES") {
    return {
      type: "SES",
      region: typeof settings.region === "string" ? settings.region : process.env.AWS_REGION,
      fromEmail
    };
  }

  return {
    type: "SMTP",
    host: typeof settings.host === "string" ? settings.host : process.env.SMTP_HOST ?? "127.0.0.1",
    port: typeof settings.port === "number" ? settings.port : Number(process.env.SMTP_PORT ?? 1025),
    secure: typeof settings.secure === "boolean" ? settings.secure : false,
    auth:
      typeof settings.user === "string" && typeof settings.pass === "string"
        ? {
            user: settings.user,
            pass: settings.pass
          }
        : undefined,
    fromEmail
  };
}

export async function sendOrgEmail(
  org: EmailOrg,
  to: string,
  template: EmailTemplateName,
  data: Record<string, unknown>,
  eventId?: string
) {
  const event = eventId
    ? await prisma.event.findFirst({
        where: {
          id: eventId,
          orgId: org.id
        },
        select: {
          settings: true
        }
      })
    : null;

  if (eventId && !event) {
    throw new Error("Event email context does not belong to this organization.");
  }

  return sendEmail(getOrgEmailConfig(org), to, template, data, event ? getEventEmailTemplate(event.settings, template) ?? undefined : undefined);
}

export function getPlatformEmailConfig(): EmailProviderConfig {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS;

  return {
    type: "SMTP",
    host: process.env.SMTP_HOST ?? "127.0.0.1",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
    fromEmail: process.env.SMTP_FROM_EMAIL ?? "no-reply@localhost"
  };
}

export async function sendPlatformEmail(to: string, template: EmailTemplateName, data: Record<string, unknown>) {
  return sendEmail(getPlatformEmailConfig(), to, template, data);
}
