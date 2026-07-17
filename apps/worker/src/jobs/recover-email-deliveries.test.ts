import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  emailGetJob: vi.fn(),
  emailAdd: vi.fn(),
  deadLetterGetJob: vi.fn(),
  deadLetterAdd: vi.fn()
}));

vi.mock("@vfurst/db", () => ({
  prisma: {
    emailDelivery: {
      findMany: mocks.findMany,
      update: mocks.update
    }
  }
}));
vi.mock("../queues.js", () => ({
  emailQueue: { getJob: mocks.emailGetJob, add: mocks.emailAdd },
  emailDeadLetterQueue: { getJob: mocks.deadLetterGetJob, add: mocks.deadLetterAdd }
}));

import { processRecoverEmailDeliveries } from "./recover-email-deliveries.js";

const deliveryId = "00000000-0000-4000-8000-000000000001";
const deadLetterId = "00000000-0000-4000-8000-000000000002";

describe("processRecoverEmailDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany
      .mockResolvedValueOnce([{ id: deliveryId }])
      .mockResolvedValueOnce([
        {
          id: deadLetterId,
          deadLetteredAt: new Date("2026-07-17T00:00:00.000Z"),
          lastErrorCode: "EAUTH"
        }
      ]);
    mocks.emailGetJob.mockResolvedValue(null);
    mocks.deadLetterGetJob.mockResolvedValue(null);
    mocks.emailAdd.mockResolvedValue({});
    mocks.deadLetterAdd.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
  });

  it("restores missing source jobs and named dead-letter pointers from PostgreSQL", async () => {
    const result = await processRecoverEmailDeliveries(new Date("2026-07-17T00:01:00.000Z"));

    expect(mocks.emailAdd).toHaveBeenCalledWith(
      "send-email",
      { deliveryId },
      { jobId: `email-delivery-${deliveryId}` }
    );
    expect(mocks.deadLetterAdd).toHaveBeenCalledWith(
      "email-dead-letter",
      {
        deliveryId: deadLetterId,
        failedAt: "2026-07-17T00:00:00.000Z",
        errorCode: "EAUTH"
      },
      { jobId: `email-dead-letter-${deadLetterId}` }
    );
    expect(result).toEqual({ scanned: 1, recovered: 1, deadLetterPointers: 1 });
  });

  it("retries an existing failed source job without creating a duplicate", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    mocks.emailGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue("failed"),
      retry
    });
    mocks.findMany.mockReset().mockResolvedValueOnce([{ id: deliveryId }]).mockResolvedValueOnce([]);

    const result = await processRecoverEmailDeliveries(new Date("2026-07-17T00:01:00.000Z"));

    expect(retry).toHaveBeenCalledWith("failed");
    expect(mocks.emailAdd).not.toHaveBeenCalled();
    expect(result.recovered).toBe(1);
  });
});
