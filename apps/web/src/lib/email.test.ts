import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  deliveryCreate: vi.fn(),
  deliveryUpdate: vi.fn(),
  enqueueEmailDelivery: vi.fn()
}));

vi.mock("@vfurst/db", () => ({
  prisma: {
    event: { findFirst: mocks.eventFindFirst },
    emailDelivery: {
      create: mocks.deliveryCreate,
      update: mocks.deliveryUpdate
    }
  }
}));
vi.mock("./email-queue", () => ({ enqueueEmailDelivery: mocks.enqueueEmailDelivery }));

import { sendOrgEmail, sendPlatformEmail } from "./email";

const encryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const org = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test organization",
  contactEmail: "owner@example.test",
  emailProvider: "SMTP" as const,
  emailSettings: {}
};

describe("durable email outbox", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_DELIVERY_ENCRYPTION_KEY", encryptionKey);
    mocks.eventFindFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002" });
    mocks.deliveryCreate.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000003" });
    mocks.deliveryUpdate.mockResolvedValue({});
    mocks.enqueueEmailDelivery.mockResolvedValue("email-delivery-00000000-0000-4000-8000-000000000003");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects a foreign event context before creating an outbox record", async () => {
    mocks.eventFindFirst.mockResolvedValue(null);

    await expect(
      sendOrgEmail(org, "attendee@example.test", "payment-receipt", {}, "00000000-0000-4000-8000-000000000099")
    ).rejects.toThrow("does not belong to this organization");

    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the production encryption key is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_DELIVERY_ENCRYPTION_KEY", "");

    await expect(sendPlatformEmail("user@example.test", "password-reset", {})).rejects.toThrow(
      "EMAIL_DELIVERY_ENCRYPTION_KEY is required"
    );
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });

  it("persists an encrypted organization outbox record and sends only its ID to Redis", async () => {
    await sendOrgEmail(
      org,
      "attendee@example.test",
      "payment-receipt",
      { eventName: "Test event", secretMarker: "plaintext-must-not-leak" },
      "00000000-0000-4000-8000-000000000002"
    );

    const createInput = mocks.deliveryCreate.mock.calls[0]?.[0];
    expect(createInput).toEqual({
      data: expect.objectContaining({
        recipient: "attendee@example.test",
        template: "payment-receipt",
        replayable: true,
        payloadVersion: 1,
        payloadCiphertext: expect.any(Uint8Array),
        org: { connect: { id: org.id } },
        event: { connect: { id: "00000000-0000-4000-8000-000000000002" } }
      })
    });
    expect(Buffer.from(createInput.data.payloadCiphertext).toString("utf8")).not.toContain("plaintext-must-not-leak");
    expect(mocks.enqueueEmailDelivery).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000003");
  });

  it("retains a durable queued row when Redis is temporarily unavailable", async () => {
    mocks.enqueueEmailDelivery.mockRejectedValue(new Error("Redis unavailable"));

    await expect(sendPlatformEmail("user@example.test", "password-reset", { resetUrl: "https://example.test/reset?token=secret" }))
      .resolves.toEqual({ id: "00000000-0000-4000-8000-000000000003" });

    expect(mocks.deliveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ replayable: false, template: "password-reset" })
    });
    expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
  });
});
