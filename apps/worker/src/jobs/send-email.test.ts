import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEventEmailTemplate, sendEmail } = vi.hoisted(() => ({
  getEventEmailTemplate: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock("@vfurst/email", () => ({
  getEventEmailTemplate,
  sendEmail
}));

vi.mock("@vfurst/db", () => ({
  prisma: {
    organization: { findUniqueOrThrow: vi.fn() },
    event: { findFirst: vi.fn() }
  }
}));

vi.mock("../env.js", () => ({
  workerEnv: {
    AWS_REGION: "us-east-1",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_FROM_EMAIL: "fallback@example.com",
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined
  }
}));

import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import type { SendEmailJob } from "../queues.js";
import { processSendEmail } from "./send-email.js";

const orgId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";

describe("processSendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUniqueOrThrow).mockResolvedValue({
      id: orgId,
      name: "Email Worker Organization",
      slug: "email-worker",
      subdomain: "email-worker",
      contactEmail: "owner@example.com",
      emailProvider: "SMTP",
      emailSettings: {},
      status: "ACTIVE",
      suspendedAt: null,
      suspensionReason: null,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      customDomain: null,
      customDomainStatus: "UNCONFIGURED",
      customDomainVerifiedAt: null,
      customDomainVerificationTokenHash: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as never);
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      settings: { emailTemplates: { "payment-receipt": { subject: "Saved", html: "<p>Saved</p>", text: "Saved" } } }
    } as never);
    getEventEmailTemplate.mockReturnValue({
      key: "payment-receipt",
      template: { subject: "Saved", html: "<p>Saved</p>", text: "Saved" }
    });
    sendEmail.mockResolvedValue({ provider: "SMTP", messageId: "message-1" });
  });

  it("loads the event override through an organization-scoped query", async () => {
    const data: SendEmailJob = {
      orgId,
      eventId,
      to: "attendee@example.com",
      template: "payment-receipt",
      data: { eventName: "Email Worker Event", orderTotal: "$10.00" }
    };

    const result = await processSendEmail({ data } as Job<SendEmailJob>);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: eventId, orgId },
      select: { settings: true }
    });
    expect(getEventEmailTemplate).toHaveBeenCalledWith(expect.any(Object), "payment-receipt");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SMTP" }),
      data.to,
      data.template,
      data.data,
      expect.objectContaining({ key: "payment-receipt" })
    );
    expect(result).toEqual(expect.objectContaining({ delivered: true, messageId: "message-1" }));
  });

  it("rejects a foreign event context instead of falling back silently", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue(null);
    const data: SendEmailJob = {
      orgId,
      eventId,
      to: "attendee@example.com",
      template: "registration-confirmation",
      data: {}
    };

    await expect(processSendEmail({ data } as Job<SendEmailJob>)).rejects.toThrow(
      "Event email context does not belong to this organization."
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
