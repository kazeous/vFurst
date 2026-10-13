import type { Prisma, PrismaClient } from "@prisma/client";

export const DEFAULT_IDENTITY_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_IDENTITY_RETENTION_BATCH_SIZE = 250;
export const MAX_IDENTITY_RETENTION_BATCH_SIZE = 1_000;

export type CleanupIdentityProtocolRecordBatchInput = Readonly<{
  now?: Date;
  identitySessionRetentionMs?: number;
  batchSize?: number;
}>;

export type CleanupIdentityProtocolRecordBatchResult = Readonly<{
  identitySessionsSelected: number;
  identitySessionsDeleted: number;
  hasMore: boolean;
}>;

function assertValidDate(value: Date, field: string) {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError(`${field} must be a valid date.`);
  }
}

function assertPositiveDuration(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 60_000) {
    throw new TypeError(`${field} must be an integer of at least 60000 milliseconds.`);
  }
}

function assertBatchSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_IDENTITY_RETENTION_BATCH_SIZE) {
    throw new TypeError(
      `batchSize must be an integer between 1 and ${MAX_IDENTITY_RETENTION_BATCH_SIZE}.`
    );
  }
}

/**
 * Prunes one bounded, rechecked batch of long-expired or revoked staff identity sessions.
 * Portal records join this retention job in unit 1B.2.
 */
export async function cleanupIdentityProtocolRecordBatch(
  client: PrismaClient,
  input: CleanupIdentityProtocolRecordBatchInput = {}
): Promise<CleanupIdentityProtocolRecordBatchResult> {
  const now = input.now ?? new Date();
  const identitySessionRetentionMs =
    input.identitySessionRetentionMs ?? DEFAULT_IDENTITY_SESSION_RETENTION_MS;
  const batchSize = input.batchSize ?? DEFAULT_IDENTITY_RETENTION_BATCH_SIZE;

  assertValidDate(now, "now");
  assertPositiveDuration(identitySessionRetentionMs, "identitySessionRetentionMs");
  assertBatchSize(batchSize);

  const identitySessionCutoff = new Date(now.getTime() - identitySessionRetentionMs);

  return client.$transaction(async (tx) => {
    const sessionEligibility: Prisma.SessionWhereInput = {
      OR: [
        { expires: { lte: identitySessionCutoff } },
        { revokedAt: { lte: identitySessionCutoff } }
      ]
    };
    const identitySessions = await tx.session.findMany({
      where: sessionEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize
    });
    const identitySessionIds = identitySessions.map(({ id }) => id);
    const identitySessionDelete =
      identitySessionIds.length === 0
        ? { count: 0 }
        : await tx.session.deleteMany({
            where: {
              id: { in: identitySessionIds },
              ...sessionEligibility
            }
          });

    return Object.freeze({
      identitySessionsSelected: identitySessionIds.length,
      identitySessionsDeleted: identitySessionDelete.count,
      hasMore: identitySessionIds.length === batchSize
    });
  });
}
