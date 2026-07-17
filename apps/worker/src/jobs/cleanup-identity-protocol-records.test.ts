import { describe, expect, it, vi } from "vitest";
import { processCleanupIdentityProtocolRecords } from "./cleanup-identity-protocol-records.js";

const now = new Date("2026-07-17T10:00:00.000Z");

function batchResult(
  authorizationCodesDeleted: number,
  identitySessionsDeleted: number,
  hasMore: boolean
) {
  return {
    authorizationCodesSelected: authorizationCodesDeleted,
    authorizationCodesDeleted,
    identitySessionsSelected: identitySessionsDeleted,
    identitySessionsDeleted,
    hasMore
  };
}

describe("identity protocol retention worker", () => {
  it("drains bounded batches with one stable cutoff time", async () => {
    const cleanupBatch = vi
      .fn()
      .mockResolvedValueOnce(batchResult(250, 5, true))
      .mockResolvedValueOnce(batchResult(10, 2, false));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch })
    ).resolves.toEqual({
      batches: 2,
      authorizationCodesDeleted: 260,
      identitySessionsDeleted: 7,
      batchBudgetExhausted: false
    });
    expect(cleanupBatch).toHaveBeenNthCalledWith(1, { now, batchSize: 250 });
    expect(cleanupBatch).toHaveBeenNthCalledWith(2, { now, batchSize: 250 });
  });

  it("stops at the configured batch budget so startup and recurring jobs remain bounded", async () => {
    const cleanupBatch = vi.fn().mockResolvedValue(batchResult(1, 0, true));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch, batchSize: 1, maxBatches: 3 })
    ).resolves.toEqual({
      batches: 3,
      authorizationCodesDeleted: 3,
      identitySessionsDeleted: 0,
      batchBudgetExhausted: true
    });
    expect(cleanupBatch).toHaveBeenCalledTimes(3);
  });

  it("is harmless when replayed after the database has no eligible records", async () => {
    const cleanupBatch = vi.fn().mockResolvedValue(batchResult(0, 0, false));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch })
    ).resolves.toMatchObject({
      batches: 1,
      authorizationCodesDeleted: 0,
      identitySessionsDeleted: 0,
      batchBudgetExhausted: false
    });
  });
});
