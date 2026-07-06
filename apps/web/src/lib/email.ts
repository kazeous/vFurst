import { sendEmail, type EmailProviderConfig, type EmailTemplateName } from "@vfurst/email";
import type { EmailProviderType, Organization } from "@vfurst/db";

type EmailOrg = Pick<Organization, "contactEmail" | "emailProvider" | "emailSettings" | "name">;

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
  data: Record<string, unknown>
) {
  return sendEmail(getOrgEmailConfig(org), to, template, data);
}
