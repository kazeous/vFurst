import { prisma } from "@vfurst/db";
import {
  classifyEmailDeliveryError,
  decryptEmailDeliveryPayload,
  getEventEmailTemplate,
  PermanentEmailDeliveryError,
  sanitizeEmailDeliveryError,
  sendEmail,
  type EmailProviderConfig
} from "@vfurst/email";
import { UnrecoverableError, type Job } from "bullmq";
import { workerEnv } from "../env.js";
import {
  emailDeadLetterQueue,
  type EmailDeadLetterJob,
  type SendEmailJob
} from "../queues.js";

type OrgEmailSettings = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  pass?: string;
  secure?: boolean;
  fromEmail?: string;
  region?: string;
};

function emailSettings(value: unknown): OrgEmailSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as OrgEmailSettings) : {};
}

function permanent(code: string, message: string) {
  return new PermanentEmailDeliveryError(code, message);
}

function resolveSmtpProviderConfig(settings: OrgEmailSettings, fallbackFrom: string): EmailProviderConfig {
  const host = settings.host ?? workerEnv.SMTP_HOST;
  const port = settings.port ?? workerEnv.SMTP_PORT;
  const user = settings.user ?? workerEnv.SMTP_USER;
  const password = settings.password ?? settings.pass ?? workerEnv.SMTP_PASSWORD;

  if (!host || !port) {
    throw permanent(
      "INVALID_SMTP_CONFIGURATION",
      "SMTP email delivery requires SMTP host and port in organization email settings or worker environment."
    );
  }

  if ((user && !password) || (!user && password)) {
    throw permanent(
      "INVALID_SMTP_CONFIGURATION",
      "SMTP email delivery requires both SMTP user and password when SMTP auth is configured."
    );
  }

  return {
    type: "SMTP",
    host,
    port,
    secure: settings.secure ?? workerEnv.SMTP_SECURE ?? false,
    fromEmail: settings.fromEmail ?? workerEnv.SMTP_FROM_EMAIL ?? fallbackFrom,
    auth: user && password ? { user, pass: password } : undefined
  };
}

function resolvePlatformProviderConfig(): EmailProviderConfig {
  return resolveSmtpProviderConfig({}, workerEnv.SMTP_FROM_EMAIL ?? "no-reply@localhost");
}

function errorCode(error: unknown) {
  if (error instanceof PermanentEmailDeliveryError) {
    return error.code.slice(0, 100);
  }

  if (error && typeof error === "object") {
    const candidate = "code" in error ? error.code : "name" in error ? error.name : undefined;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 100);
    }
  }

  return "EMAIL_DELIVERY_FAILED";
}

function deadLetterJobId(deliveryId: string) {
  return `email-dead-letter-${deliveryId}`;
}

async function addDeadLetterPointer(data: EmailDeadLetterJob) {
  try {
    await emailDeadLetterQueue.add("email-dead-letter", data, {
      jobId: deadLetterJobId(data.deliveryId)
    });
  } catch (error) {
    console.error("Email delivery was persisted as dead-lettered but its Redis pointer could not be added.", {
      deliveryId: data.deliveryId,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

export async function processSendEmail(job: Job<SendEmailJob>) {
  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: {
      org: true,
      event: {
        select: {
          id: true,
          orgId: true,
          settings: true
        }
      }
    }
  });

  if (!delivery) {
    throw new UnrecoverableError("Email delivery record not found.");
  }
  if (delivery.status === "DELIVERED") {
    return { delivered: true, deliveryId: delivery.id, messageId: delivery.providerMessageId };
  }
  if (delivery.status === "DEAD_LETTERED") {
    throw new UnrecoverableError("Email delivery is already dead-lettered.");
  }
  if (delivery.attemptCount >= delivery.maxAttempts) {
    throw new UnrecoverableError("Email delivery exhausted its persisted attempt limit.");
  }

  const attemptNumber = delivery.attemptCount + 1;
  const claimed = await prisma.$transaction(async (tx) => {
    const update = await tx.emailDelivery.updateMany({
      where: {
        id: delivery.id,
        attemptCount: delivery.attemptCount,
        status: { in: ["QUEUED", "PROCESSING", "RETRYING"] }
      },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastErrorCode: null,
        lastErrorMessage: null
      }
    });

    if (update.count !== 1) {
      return false;
    }

    await tx.emailDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        status: "STARTED"
      }
    });
    return true;
  });

  if (!claimed) {
    throw new Error("Email delivery is already being processed by another worker.");
  }

  let provider: string | undefined;

  try {
    if (!delivery.payloadCiphertext || !delivery.payloadIv || !delivery.payloadAuthTag) {
      throw permanent("MISSING_ENCRYPTED_PAYLOAD", "Email delivery has no encrypted payload.");
    }

    const payload = decryptEmailDeliveryPayload(
      {
        payloadVersion: delivery.payloadVersion,
        payloadCiphertext: delivery.payloadCiphertext,
        payloadIv: delivery.payloadIv,
        payloadAuthTag: delivery.payloadAuthTag
      },
      workerEnv.EMAIL_DELIVERY_ENCRYPTION_KEY
    );

    if (payload.to !== delivery.recipient || payload.template !== delivery.template) {
      throw permanent("DELIVERY_CONTEXT_MISMATCH", "Encrypted email payload does not match its delivery metadata.");
    }

    let providerConfig: EmailProviderConfig;
    if (delivery.orgId) {
      if (!delivery.org) {
        throw permanent("ORGANIZATION_NOT_FOUND", "Email delivery organization no longer exists.");
      }
      if (delivery.eventId && (!delivery.event || delivery.event.orgId !== delivery.orgId)) {
        throw permanent("EVENT_CONTEXT_MISMATCH", "Event email context does not belong to this organization.");
      }

      const settings = emailSettings(delivery.org.emailSettings);
      providerConfig =
        delivery.org.emailProvider === "SES"
          ? {
              type: "SES",
              region: settings.region ?? workerEnv.AWS_REGION,
              fromEmail: settings.fromEmail ?? workerEnv.SMTP_FROM_EMAIL ?? delivery.org.contactEmail
            }
          : resolveSmtpProviderConfig(settings, delivery.org.contactEmail);
    } else {
      if (delivery.eventId || delivery.template !== "password-reset") {
        throw permanent("MISSING_DELIVERY_SCOPE", "Organization email delivery no longer has a tenant context.");
      }
      providerConfig = resolvePlatformProviderConfig();
    }

    provider = providerConfig.type;
    const result = await sendEmail(
      providerConfig,
      payload.to,
      payload.template,
      payload.data,
      delivery.event ? getEventEmailTemplate(delivery.event.settings, payload.template) ?? undefined : undefined
    );

    await prisma.$transaction([
      prisma.emailDeliveryAttempt.update({
        where: {
          deliveryId_attemptNumber: {
            deliveryId: delivery.id,
            attemptNumber
          }
        },
        data: {
          status: "DELIVERED",
          provider: result.provider,
          providerMessageId: result.messageId,
          finishedAt: new Date()
        }
      }),
      prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          provider: result.provider,
          providerMessageId: result.messageId,
          deliveredAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
          payloadCiphertext: null,
          payloadIv: null,
          payloadAuthTag: null
        }
      })
    ]);

    return { delivered: true, deliveryId: delivery.id, ...result };
  } catch (error) {
    const classification = classifyEmailDeliveryError(error);
    const code = errorCode(error);
    const message = sanitizeEmailDeliveryError(error);
    const finalFailure = classification === "PERMANENT" || attemptNumber >= delivery.maxAttempts;
    const failedAt = new Date();

    await prisma.$transaction([
      prisma.emailDeliveryAttempt.update({
        where: {
          deliveryId_attemptNumber: {
            deliveryId: delivery.id,
            attemptNumber
          }
        },
        data: {
          status: "FAILED",
          provider,
          errorCode: code,
          errorMessage: message,
          finishedAt: failedAt
        }
      }),
      prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: finalFailure ? "DEAD_LETTERED" : "RETRYING",
          provider,
          lastErrorCode: code,
          lastErrorMessage: message,
          deadLetteredAt: finalFailure ? failedAt : null,
          ...(
            finalFailure && !delivery.replayable
              ? { payloadCiphertext: null, payloadIv: null, payloadAuthTag: null }
              : {}
          )
        }
      })
    ]);

    if (finalFailure) {
      await addDeadLetterPointer({
        deliveryId: delivery.id,
        failedAt: failedAt.toISOString(),
        errorCode: code
      });
      throw new UnrecoverableError(message);
    }

    throw error;
  }
}
