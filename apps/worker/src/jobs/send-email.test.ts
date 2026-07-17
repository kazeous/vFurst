import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as EmailPackage from "@vfurst/email";

const mocks = vi.hoisted(() => {
  const emailDelivery = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn()
  };
  const emailDeliveryAttempt = {
    create: vi.fn(),
    update: vi.fn()
  };
  const prisma = {
    emailDelivery,
    emailDeliveryAttempt,
    $transaction: vi.fn(async (input: unknown) =>
      Array.isArray(input) ? Promise.all(input) : (input as (tx: unknown) => unknown)(prisma)
    )
  };

  return {
    prisma,
    decryptEmailDeliveryPayload: vi.fn(),
    getEventEmailTemplate: vi.fn(),
    sendEmail: vi.fn(),
    emailDeadLetterQueueAdd: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({ prisma: mocks.prisma }));
vi.mock("@vfurst/email", async (importOriginal) => {
  const original = await importOriginal<typeof EmailPackage>();
  return {
    ...original,
    decryptEmailDeliveryPayload: mocks.decryptEmailDeliveryPayload,
    getEventEmailTemplate: mocks.getEventEmailTemplate,
    sendEmail: mocks.sendEmail
  };
});
vi.mock("../queues.js", () => ({
  emailDeadLetterQueue: { add: mocks.emailDeadLetterQueueAdd }
}));
vi.mock("../env.js", () => ({
  workerEnv: {
    AWS_REGION: "us-east-1",
    EMAIL_DELIVERY_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_FROM_EMAIL: "fallback@example.com",
    SMTP_USER: "mailer@example.com",
    SMTP_PASSWORD: "documented-secret"
  }
}));

import type { Job } from "bullmq";
import type { SendEmailJob } from "../queues.js";
import { processSendEmail } from "./send-email.js";

const orgId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const deliveryId = "00000000-0000-4000-8000-000000000003";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: deliveryId,
    orgId,
    eventId,
    recipient: "attendee@example.com",
    template: "payment-receipt",
    status: "QUEUED",
    providerMessageId: null,
    payloadCiphertext: Uint8Array.from([1, 2, 3]),
    payloadIv: new Uint8Array(12),
    payloadAuthTag: new Uint8Array(16),
    payloadVersion: 1,
    attemptCount: 0,
    maxAttempts: 5,
    replayable: true,
    org: {
      id: orgId,
      contactEmail: "owner@example.com",
      emailProvider: "SMTP",
      emailSettings: {}
    },
    event: {
      id: eventId,
      orgId,
      settings: { emailTemplates: {} }
    },
    ...overrides
  };
}

function job(): Job<SendEmailJob> {
  return { data: { deliveryId } } as Job<SendEmailJob>;
}

describe("processSendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue(delivery());
    mocks.prisma.emailDelivery.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.emailDelivery.update.mockResolvedValue({});
    mocks.prisma.emailDeliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.emailDeliveryAttempt.update.mockResolvedValue({});
    mocks.decryptEmailDeliveryPayload.mockReturnValue({
      to: "attendee@example.com",
      template: "payment-receipt",
      data: { eventName: "Email Worker Event", orderTotal: "$10.00" }
    });
    mocks.getEventEmailTemplate.mockReturnValue(undefined);
    mocks.sendEmail.mockResolvedValue({ provider: "SMTP", messageId: "message-1" });
    mocks.emailDeadLetterQueueAdd.mockResolvedValue({});
  });

  it("loads a durable delivery by ID and records a successful provider attempt", async () => {
    const result = await processSendEmail(job());

    expect(mocks.prisma.emailDelivery.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: deliveryId } })
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SMTP",
        auth: { user: "mailer@example.com", pass: "documented-secret" }
      }),
      "attendee@example.com",
      "payment-receipt",
      expect.any(Object),
      undefined
    );
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DELIVERED",
          providerMessageId: "message-1",
          payloadCiphertext: null
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ delivered: true, deliveryId, messageId: "message-1" }));
  });

  it("dead-letters a permanent tenant-context failure", async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue(
      delivery({ event: { id: eventId, orgId: "00000000-0000-4000-8000-000000000099", settings: {} } })
    );

    await expect(processSendEmail(job())).rejects.toThrow("Event email context does not belong");

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DEAD_LETTERED" }) })
    );
    expect(mocks.emailDeadLetterQueueAdd).toHaveBeenCalledWith(
      "email-dead-letter",
      expect.objectContaining({ deliveryId, errorCode: "EVENT_CONTEXT_MISMATCH" }),
      expect.objectContaining({ jobId: `email-dead-letter-${deliveryId}` })
    );
  });

  it("persists retryable provider failures without adding a dead-letter pointer", async () => {
    mocks.sendEmail.mockRejectedValue(Object.assign(new Error("Provider is temporarily unavailable"), { responseCode: 421 }));

    await expect(processSendEmail(job())).rejects.toThrow("temporarily unavailable");

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RETRYING" }) })
    );
    expect(mocks.emailDeadLetterQueueAdd).not.toHaveBeenCalled();
  });
});
