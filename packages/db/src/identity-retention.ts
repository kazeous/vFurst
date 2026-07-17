import type { Prisma, PrismaClient } from "@prisma/client";

export const DEFAULT_AUTHORIZATION_CODE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const DEFAULT_IDENTITY_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_IDENTITY_RETENTION_BATCH_SIZE = 250;
export const MAX_IDENTITY_RETENTION_BATCH_SIZE = 1_000;

export type CleanupIdentityProtocolRecordBatchInput = Readonly<{
  now?: Date;
  authorizationCodeRetentionMs?: number;
  identitySessionRetentionMs?: number;
  batchSize?: number;
}>;

export type CleanupIdentityProtocolRecordBatchResult = Readonly<{
  authorizationCodesSelected: number;
  authorizationCodesDeleted: number;
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
 * Deletes one bounded, replay-safe retention batch.
 *
 * Authorization codes are retained for seven days after expiry, whether they
 * were consumed or not. Valid codes expire within seconds, so expiry is the
 * common indexed boundary that also preserves consumed-code replay evidence.
 *
 * Session is shared by Auth.js and the custom identity registry. We therefore
 * delete only long-expired or long-revoked rows with no authorization-code
 * children. The empty-child guard prevents the Session cascade from turning a
 * bounded cleanup into an unbounded code deletion and is rechecked at delete.
 */
export async function cleanupIdentityProtocolRecordBatch(
  client: PrismaClient,
  input: CleanupIdentityProtocolRecordBatchInput = {}
): Promise<CleanupIdentityProtocolRecordBatchResult> {
  const now = input.now ?? new Date();
  const authorizationCodeRetentionMs =
    input.authorizationCodeRetentionMs ?? DEFAULT_AUTHORIZATION_CODE_RETENTION_MS;
  const identitySessionRetentionMs =
    input.identitySessionRetentionMs ?? DEFAULT_IDENTITY_SESSION_RETENTION_MS;
  const batchSize = input.batchSize ?? DEFAULT_IDENTITY_RETENTION_BATCH_SIZE;

  assertValidDate(now, "now");
  assertPositiveDuration(authorizationCodeRetentionMs, "authorizationCodeRetentionMs");
  assertPositiveDuration(identitySessionRetentionMs, "identitySessionRetentionMs");
  assertBatchSize(batchSize);
  if (identitySessionRetentionMs < authorizationCodeRetentionMs) {
    throw new TypeError("identitySessionRetentionMs must not be shorter than authorizationCodeRetentionMs.");
  }

  const authorizationCodeCutoff = new Date(now.getTime() - authorizationCodeRetentionMs);
  const identitySessionCutoff = new Date(now.getTime() - identitySessionRetentionMs);

  return client.$transaction(async (tx) => {
    const authorizationCodes = await tx.authorizationCode.findMany({
      where: { expiresAt: { lte: authorizationCodeCutoff } },
      select: { id: true },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: batchSize
    });
    const authorizationCodeIds = authorizationCodes.map(({ id }) => id);
    const authorizationCodeDelete =
      authorizationCodeIds.length === 0
        ? { count: 0 }
        : await tx.authorizationCode.deleteMany({
            where: {
              id: { in: authorizationCodeIds },
              expiresAt: { lte: authorizationCodeCutoff }
            }
          });

    const sessionEligibility: Prisma.SessionWhereInput = {
      authorizationCodes: { none: {} },
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
      authorizationCodesSelected: authorizationCodeIds.length,
      authorizationCodesDeleted: authorizationCodeDelete.count,
      identitySessionsSelected: identitySessionIds.length,
      identitySessionsDeleted: identitySessionDelete.count,
      hasMore:
        authorizationCodeIds.length === batchSize || identitySessionIds.length === batchSize
    });
  });
}
