import { prisma } from "@vfurst/db";
import { sendEmail, type EmailProviderConfig } from "@vfurst/email";
import type { Job } from "bullmq";
import { workerEnv } from "../env.js";
import type { SendEmailJob } from "../queues.js";

type OrgEmailSettings = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  fromEmail?: string;
  region?: string;
};

function emailSettings(value: unknown): OrgEmailSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as OrgEmailSettings) : {};
}

function resolveSmtpProviderConfig(settings: OrgEmailSettings, fallbackFrom: string): EmailProviderConfig {
  const host = settings.host ?? workerEnv.SMTP_HOST;
  const port = settings.port ?? workerEnv.SMTP_PORT;
  const user = settings.user ?? workerEnv.SMTP_USER;
  const password = settings.password ?? workerEnv.SMTP_PASSWORD;

  if (!host || !port) {
    throw new Error("SMTP email delivery requires SMTP host and port in organization email settings or worker environment.");
  }

  if ((user && !password) || (!user && password)) {
    throw new Error("SMTP email delivery requires both SMTP user and password when SMTP auth is configured.");
  }

  return {
    type: "SMTP",
    host,
    port,
    secure: settings.secure ?? workerEnv.SMTP_SECURE ?? false,
    fromEmail: settings.fromEmail ?? workerEnv.SMTP_FROM_EMAIL ?? fallbackFrom,
    auth:
      user && password
        ? {
            user,
            pass: password
          }
        : undefined
  };
}

export async function processSendEmail(job: Job<SendEmailJob>) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: {
      id: job.data.orgId
    }
  });

  const settings = emailSettings(org.emailSettings);
  const fallbackFrom = org.contactEmail;
  const providerConfig: EmailProviderConfig =
    org.emailProvider === "SES"
      ? {
          type: "SES",
          region: settings.region ?? workerEnv.AWS_REGION,
          fromEmail: settings.fromEmail ?? workerEnv.SMTP_FROM_EMAIL ?? fallbackFrom
        }
      : resolveSmtpProviderConfig(settings, fallbackFrom);

  const result = await sendEmail(providerConfig, job.data.to, job.data.template, job.data.data);

  return {
    delivered: true,
    ...result
  };
}
