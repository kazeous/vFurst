import { prisma } from "@vfurst/db";
import { sendEmail, type EmailProviderConfig } from "@vfurst/email";
import type { Job } from "bullmq";
import type { SendEmailJob } from "../queues";

type OrgEmailSettings = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  fromEmail?: string;
  region?: string;
};

export async function processSendEmail(job: Job<SendEmailJob>) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: {
      id: job.data.orgId
    }
  });

  const settings = org.emailSettings as OrgEmailSettings;
  const fallbackFrom = org.contactEmail;
  const providerConfig: EmailProviderConfig =
    org.emailProvider === "SES"
      ? {
          type: "SES",
          region: settings.region,
          fromEmail: settings.fromEmail ?? fallbackFrom
        }
      : {
          type: "SMTP",
          host: settings.host ?? process.env.SMTP_HOST ?? "localhost",
          port: settings.port ?? Number(process.env.SMTP_PORT ?? 1025),
          secure: settings.secure ?? false,
          fromEmail: settings.fromEmail ?? fallbackFrom,
          auth:
            settings.user && settings.password
              ? {
                  user: settings.user,
                  pass: settings.password
                }
              : undefined
        };

  const result = await sendEmail(providerConfig, job.data.to, job.data.template, job.data.data);

  return {
    delivered: true,
    ...result
  };
}

