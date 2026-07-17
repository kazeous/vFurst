import {
  encryptEmailDeliveryPayload,
  PermanentEmailDeliveryError,
  type EmailTemplateName
} from "@vfurst/email";
import { prisma, type Organization } from "@vfurst/db";
import { enqueueEmailDelivery } from "./email-queue";

type EmailOrg = Pick<Organization, "id" | "contactEmail" | "emailProvider" | "emailSettings" | "name">;

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
          id: true
        }
      })
    : null;

  if (eventId && !event) {
    throw new Error("Event email context does not belong to this organization.");
  }

  return createQueuedEmailDelivery({
    orgId: org.id,
    eventId: event?.id,
    to,
    template,
    data
  });
}

export async function sendPlatformEmail(to: string, template: EmailTemplateName, data: Record<string, unknown>) {
  return createQueuedEmailDelivery({ to, template, data });
}

const nonReplayableTemplates = new Set<EmailTemplateName>([
  "organization-invitation",
  "password-reset",
  "registration-transfer"
]);

function emailDeliveryEncryptionKey() {
  const key =
    process.env.EMAIL_DELIVERY_ENCRYPTION_KEY?.trim() ||
    (process.env.NODE_ENV !== "production" ? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" : undefined);

  if (!key) {
    throw new PermanentEmailDeliveryError(
      "MISSING_ENCRYPTION_KEY",
      "EMAIL_DELIVERY_ENCRYPTION_KEY is required to queue email delivery."
    );
  }

  return key;
}

type QueuedEmailDeliveryInput = {
  orgId?: string;
  eventId?: string;
  to: string;
  template: EmailTemplateName;
  data: Record<string, unknown>;
};

async function createQueuedEmailDelivery(input: QueuedEmailDeliveryInput) {
  const encrypted = encryptEmailDeliveryPayload(
    {
      to: input.to,
      template: input.template,
      data: input.data
    },
    emailDeliveryEncryptionKey()
  );
  const delivery = await prisma.emailDelivery.create({
    data: {
      org: input.orgId ? { connect: { id: input.orgId } } : undefined,
      event: input.eventId ? { connect: { id: input.eventId } } : undefined,
      recipient: input.to,
      template: input.template,
      replayable: !nonReplayableTemplates.has(input.template),
      payloadVersion: encrypted.payloadVersion,
      payloadCiphertext: Uint8Array.from(encrypted.payloadCiphertext),
      payloadIv: Uint8Array.from(encrypted.payloadIv),
      payloadAuthTag: Uint8Array.from(encrypted.payloadAuthTag)
    }
  });

  try {
    const queueJobId = await enqueueEmailDelivery(delivery.id);
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { queueJobId }
    });
  } catch (error) {
    console.error("Email delivery is durable but could not be added to Redis; recovery will retry.", {
      deliveryId: delivery.id,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }

  return delivery;
}
