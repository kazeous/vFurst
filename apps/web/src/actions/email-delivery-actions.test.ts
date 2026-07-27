import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emailDelivery = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  };
  const prisma = {
    emailDelivery,
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma))
  };
  return {
    prisma,
    requireEventAccess: vi.fn(),
    requirePlatformAdmin: vi.fn(),
    enqueueEmailDelivery: vi.fn(),
    revalidatePath: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
  prisma: mocks.prisma
}));
vi.mock("@/lib/dashboard-access", () => ({
  requireEventAccess: mocks.requireEventAccess,
  requirePlatformAdmin: mocks.requirePlatformAdmin
}));
vi.mock("@/lib/email-queue", () => ({ enqueueEmailDelivery: mocks.enqueueEmailDelivery }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { replayEventEmailDelivery, replayPlatformEmailDelivery } from "./email-delivery-actions";

const deliveryId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const orgId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const replayId = "00000000-0000-4000-8000-000000000005";

function original(overrides: Record<string, unknown> = {}) {
  return {
    id: deliveryId,
    orgId,
    eventId,
    recipient: "attendee@example.test",
    template: "payment-receipt",
    status: "DEAD_LETTERED",
    payloadCiphertext: Uint8Array.from([1, 2, 3]),
    payloadIv: new Uint8Array(12),
    payloadAuthTag: new Uint8Array(16),
    payloadVersion: 1,
    maxAttempts: 5,
    replayable: true,
    ...overrides
  };
}

function formData() {
  const form = new FormData();
  form.set("deliveryId", deliveryId);
  return form;
}

describe("email delivery replay actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue(original());
    mocks.prisma.emailDelivery.findFirst.mockResolvedValue(null);
    mocks.prisma.emailDelivery.create.mockResolvedValue({ id: replayId, eventId });
    mocks.prisma.emailDelivery.update.mockResolvedValue({});
    mocks.requireEventAccess.mockResolvedValue({ userId, event: { id: eventId, orgId } });
    mocks.requirePlatformAdmin.mockResolvedValue({ id: userId });
    mocks.enqueueEmailDelivery.mockResolvedValue(`email-delivery-${replayId}`);
  });

  it("derives organizer authorization from the delivery's stored event and preserves replay lineage", async () => {
    await replayEventEmailDelivery({}, formData());

    expect(mocks.requireEventAccess).toHaveBeenCalledWith(eventId);
    expect(mocks.prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId,
        eventId,
        replayedFromId: deliveryId,
        replayedById: userId,
        replayable: true
      })
    });
    expect(mocks.enqueueEmailDelivery).toHaveBeenCalledWith(replayId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/events/${eventId}/settings/emails`);
  });

  it("stops before replay when the stored event is outside the organizer's authority", async () => {
    mocks.requireEventAccess.mockRejectedValue(new Error("forbidden"));

    await expect(replayEventEmailDelivery({}, formData())).rejects.toThrow("forbidden");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.enqueueEmailDelivery).not.toHaveBeenCalled();
  });

  it("refuses platform replay of single-use token messages", async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue(
      original({ template: "password-reset", replayable: false, payloadCiphertext: null, payloadIv: null, payloadAuthTag: null })
    );

    await expect(replayPlatformEmailDelivery({}, formData())).resolves.toEqual({
      error: "This email contains an expired or single-use link and cannot be replayed."
    });

    expect(mocks.prisma.emailDelivery.create).not.toHaveBeenCalled();
    expect(mocks.enqueueEmailDelivery).not.toHaveBeenCalled();
  });
});
