import {
  cleanupIdentityProtocolRecordBatch,
  DEFAULT_IDENTITY_RETENTION_BATCH_SIZE,
  prisma,
  type CleanupIdentityProtocolRecordBatchInput,
  type CleanupIdentityProtocolRecordBatchResult
} from "@vfurst/db";

export const DEFAULT_IDENTITY_RETENTION_MAX_BATCHES = 4;

export type IdentityProtocolCleanupBatch = (
  input: CleanupIdentityProtocolRecordBatchInput
) => Promise<CleanupIdentityProtocolRecordBatchResult>;

export type ProcessIdentityProtocolCleanupInput = Readonly<{
  now?: Date;
  batchSize?: number;
  maxBatches?: number;
  cleanupBatch?: IdentityProtocolCleanupBatch;
}>;

export async function processCleanupIdentityProtocolRecords(
  input: ProcessIdentityProtocolCleanupInput = {}
) {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? DEFAULT_IDENTITY_RETENTION_BATCH_SIZE;
  const maxBatches = input.maxBatches ?? DEFAULT_IDENTITY_RETENTION_MAX_BATCHES;
  const cleanupBatch =
    input.cleanupBatch ??
    ((batchInput) => cleanupIdentityProtocolRecordBatch(prisma, batchInput));

  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 20) {
    throw new TypeError("maxBatches must be an integer between 1 and 20.");
  }

  let batches = 0;
  let identitySessionsDeleted = 0;
  let hasMore = false;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await cleanupBatch({ now, batchSize });
    batches += 1;
    identitySessionsDeleted += result.identitySessionsDeleted;
    hasMore = result.hasMore;
    if (!hasMore) break;
  }

  return Object.freeze({
    batches,
    identitySessionsDeleted,
    batchBudgetExhausted: hasMore
  });
}
