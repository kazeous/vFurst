import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    paymentProviderConfig: {
      upsert: vi.fn()
    },
    controlPlaneOutboxEvent: {
      findFirst: vi.fn()
    }
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  };

  return {
    tx,
    prisma,
    enqueueControlPlaneEvent: vi.fn(),
    requirePlatformAdmin: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
    TransactionIsolationLevel: { Serializable: "Serializable" }
  },
  prisma: mocks.prisma,
  enqueueControlPlaneEvent: mocks.enqueueControlPlaneEvent,
  PAYMENT_ATTEMPT_TTL_MS: 900_000
}));
vi.mock("@/lib/dashboard-access", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/fulfillment", () => ({ reverseOrderFulfillment: vi.fn() }));
vi.mock("@/lib/payments/platform", async () => {
  const { z } = await import("zod");
  return {
    isSePayEnvironmentReady: () => true,
    isSePaySettingsReady: () => true,
    sepaySettingsSchema: z.object({
      bankCode: z.string().default("VCB"),
      accountNumber: z.string().default("12345678"),
      accountHolder: z.string().default("VFURST"),
      bankAccountId: z.string().default("bank-account"),
      memoPrefix: z.string().default("VF"),
      registrationFeeVnd: z.coerce.number().default(0),
      hotelFeeVnd: z.coerce.number().default(0)
    })
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { savePlatformPaymentSettings } from "./payment-actions";

const adminId = "00000000-0000-4000-8000-000000000001";

function settingsForm() {
  const form = new FormData();
  form.set("stripeEnabled", "on");
  form.set("sepayEnabled", "on");
  form.set("bankCode", "VCB");
  form.set("accountNumber", "12345678");
  form.set("accountHolder", "VFURST");
  form.set("bankAccountId", "bank-account");
  form.set("memoPrefix", "VF");
  form.set("registrationFeeVnd", "1000");
  form.set("hotelFeeVnd", "2000");
  return form;
}

describe("platform payment policy control-plane event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ id: adminId });
    mocks.prisma.$transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => unknown) =>
      callback(mocks.tx)
    );
    mocks.tx.paymentProviderConfig.upsert.mockResolvedValue({});
    mocks.tx.controlPlaneOutboxEvent.findFirst.mockResolvedValue({ aggregateVersion: 6 });
    mocks.enqueueControlPlaneEvent.mockResolvedValue({});
  });

  it("updates both providers and emits the next global aggregate version atomically", async () => {
    await savePlatformPaymentSettings(settingsForm());

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable"
    });
    expect(mocks.tx.paymentProviderConfig.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.tx.controlPlaneOutboxEvent.findFirst).toHaveBeenCalledWith({
      where: {
        aggregateType: "platform-payment-policy",
        aggregateId: "global"
      },
      orderBy: { aggregateVersion: "desc" },
      select: { aggregateVersion: true }
    });
    expect(mocks.enqueueControlPlaneEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        organizationId: null,
        aggregateType: "platform-payment-policy",
        aggregateId: "global",
        aggregateVersion: 7,
        eventType: "platform.payment-policy-changed",
        actorUserId: adminId,
        data: {
          providers: [
            { provider: "STRIPE", enabled: true },
            { provider: "SEPAY", enabled: true }
          ],
          policyVersion: 7
        }
      })
    );
    const event = mocks.enqueueControlPlaneEvent.mock.calls[0]?.[1];
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.redirect).toHaveBeenCalledWith("/platform/payments?paymentsSaved=1");
  });

  it("keeps provider writes and outbox insertion in one rollback boundary", async () => {
    mocks.enqueueControlPlaneEvent.mockRejectedValue(new Error("outbox unavailable"));

    await expect(savePlatformPaymentSettings(settingsForm())).rejects.toThrow("outbox unavailable");

    expect(mocks.tx.paymentProviderConfig.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueControlPlaneEvent).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
