import type { Prisma, PrismaClient } from "@prisma/client";

export const DEFAULT_IDENTITY_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_PORTAL_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_PORTAL_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const DEFAULT_IDENTITY_RETENTION_BATCH_SIZE = 250;
export const MAX_IDENTITY_RETENTION_BATCH_SIZE = 1_000;

export type CleanupIdentityProtocolRecordBatchInput = Readonly<{
  now?: Date;
  identitySessionRetentionMs?: number;
  portalSessionRetentionMs?: number;
  portalTokenRetentionMs?: number;
  batchSize?: number;
}>;

export type CleanupIdentityProtocolRecordBatchResult = Readonly<{
  identitySessionsSelected: number;
  identitySessionsDeleted: number;
  portalSessionsSelected: number;
  portalSessionsDeleted: number;
  portalAccountTokensSelected: number;
  portalAccountTokensDeleted: number;
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
 * Prunes bounded, rechecked batches of staff sessions, portal sessions, and portal account tokens.
 */
export async function cleanupIdentityProtocolRecordBatch(
  client: PrismaClient,
  input: CleanupIdentityProtocolRecordBatchInput = {}
): Promise<CleanupIdentityProtocolRecordBatchResult> {
  const now = input.now ?? new Date();
  const identitySessionRetentionMs =
    input.identitySessionRetentionMs ?? DEFAULT_IDENTITY_SESSION_RETENTION_MS;
  const portalSessionRetentionMs =
    input.portalSessionRetentionMs ?? DEFAULT_PORTAL_SESSION_RETENTION_MS;
  const portalTokenRetentionMs = input.portalTokenRetentionMs ?? DEFAULT_PORTAL_TOKEN_RETENTION_MS;
  const batchSize = input.batchSize ?? DEFAULT_IDENTITY_RETENTION_BATCH_SIZE;

  assertValidDate(now, "now");
  assertPositiveDuration(identitySessionRetentionMs, "identitySessionRetentionMs");
  assertPositiveDuration(portalSessionRetentionMs, "portalSessionRetentionMs");
  assertPositiveDuration(portalTokenRetentionMs, "portalTokenRetentionMs");
  assertBatchSize(batchSize);

  const identitySessionCutoff = new Date(now.getTime() - identitySessionRetentionMs);
  const portalSessionCutoff = new Date(now.getTime() - portalSessionRetentionMs);
  const tokenCutoff = new Date(now.getTime() - portalTokenRetentionMs);

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

    const portalSessionEligibility: Prisma.PortalSessionWhereInput = {
      OR: [
        { expiresAt: { lte: portalSessionCutoff } },
        { revokedAt: { lte: portalSessionCutoff } }
      ]
    };
    const portalSessions = await tx.portalSession.findMany({
      where: portalSessionEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize
    });
    const portalSessionIds = portalSessions.map(({ id }) => id);
    const portalSessionDelete =
      portalSessionIds.length === 0
        ? { count: 0 }
        : await tx.portalSession.deleteMany({
            where: {
              id: { in: portalSessionIds },
              ...portalSessionEligibility
            }
          });

    const tokenEligibility: Prisma.PortalAccountTokenWhereInput = {
      OR: [{ expiresAt: { lte: tokenCutoff } }, { consumedAt: { lte: tokenCutoff } }]
    };
    const portalAccountTokens = await tx.portalAccountToken.findMany({
      where: tokenEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize
    });
    const portalAccountTokenIds = portalAccountTokens.map(({ id }) => id);
    const portalAccountTokenDelete =
      portalAccountTokenIds.length === 0
        ? { count: 0 }
        : await tx.portalAccountToken.deleteMany({
            where: {
              id: { in: portalAccountTokenIds },
              ...tokenEligibility
            }
          });

    return Object.freeze({
      identitySessionsSelected: identitySessionIds.length,
      identitySessionsDeleted: identitySessionDelete.count,
      portalSessionsSelected: portalSessionIds.length,
      portalSessionsDeleted: portalSessionDelete.count,
      portalAccountTokensSelected: portalAccountTokenIds.length,
      portalAccountTokensDeleted: portalAccountTokenDelete.count,
      hasMore:
        identitySessionIds.length === batchSize ||
        portalSessionIds.length === batchSize ||
        portalAccountTokenIds.length === batchSize
    });
  });
}
