import { describe, expect, it, vi } from "vitest";
import { processCleanupIdentityProtocolRecords } from "./cleanup-identity-protocol-records.js";

const now = new Date("2026-07-17T10:00:00.000Z");

function batchResult(
  identitySessionsDeleted: number,
  hasMore: boolean,
  portalSessionsDeleted = 0,
  portalAccountTokensDeleted = 0
) {
  return {
    identitySessionsSelected: identitySessionsDeleted,
    identitySessionsDeleted,
    portalSessionsSelected: portalSessionsDeleted,
    portalSessionsDeleted,
    portalAccountTokensSelected: portalAccountTokensDeleted,
    portalAccountTokensDeleted,
    hasMore
  };
}

describe("identity protocol retention worker", () => {
  it("drains bounded batches with one stable cutoff time", async () => {
    const cleanupBatch = vi
      .fn()
      .mockResolvedValueOnce(batchResult(5, true, 3, 4))
      .mockResolvedValueOnce(batchResult(2, false, 1, 2));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch })
    ).resolves.toEqual({
      batches: 2,
      identitySessionsDeleted: 7,
      portalSessionsDeleted: 4,
      portalAccountTokensDeleted: 6,
      batchBudgetExhausted: false
    });
    expect(cleanupBatch).toHaveBeenNthCalledWith(1, { now, batchSize: 250 });
    expect(cleanupBatch).toHaveBeenNthCalledWith(2, { now, batchSize: 250 });
  });

  it("stops at the configured batch budget so startup and recurring jobs remain bounded", async () => {
    const cleanupBatch = vi.fn().mockResolvedValue(batchResult(0, true));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch, batchSize: 1, maxBatches: 3 })
    ).resolves.toEqual({
      batches: 3,
      identitySessionsDeleted: 0,
      portalSessionsDeleted: 0,
      portalAccountTokensDeleted: 0,
      batchBudgetExhausted: true
    });
    expect(cleanupBatch).toHaveBeenCalledTimes(3);
  });

  it("is harmless when replayed after the database has no eligible records", async () => {
    const cleanupBatch = vi.fn().mockResolvedValue(batchResult(0, false));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch })
    ).resolves.toMatchObject({
      batches: 1,
      identitySessionsDeleted: 0,
      portalSessionsDeleted: 0,
      portalAccountTokensDeleted: 0,
      batchBudgetExhausted: false
    });
  });

  it("continues draining when only portal tokens require another batch", async () => {
    const cleanupBatch = vi
      .fn()
      .mockResolvedValueOnce(batchResult(0, true, 0, 1))
      .mockResolvedValueOnce(batchResult(0, false));

    await expect(
      processCleanupIdentityProtocolRecords({ now, cleanupBatch, batchSize: 1 })
    ).resolves.toEqual({
      batches: 2,
      identitySessionsDeleted: 0,
      portalSessionsDeleted: 0,
      portalAccountTokensDeleted: 1,
      batchBudgetExhausted: false
    });
    expect(cleanupBatch).toHaveBeenCalledTimes(2);
  });
});
