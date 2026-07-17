import { Prisma, type PrismaClient, type Session } from "@prisma/client";

export const IDENTITY_ISSUER = "platform-manager" as const;
export const TENANT_WEB_AUTHORIZATION_AUDIENCE = "tenant-web" as const;

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export type AuthorizationCodeStoreRecord = Readonly<{
  codeId: string;
  codeHash: string;
  issuer: typeof IDENTITY_ISSUER;
  audience: typeof TENANT_WEB_AUTHORIZATION_AUDIENCE;
  clientId: string;
  userId: string;
  identitySessionId: string;
  authVersion: number;
  redirectUri: string;
  codeChallenge: string;
  issuedAt: number;
  expiresAt: number;
  identitySessionExpiresAt: number;
}>;

export type ConsumedAuthorizationCodeStoreRecord = AuthorizationCodeStoreRecord &
  Readonly<{
    currentUserAuthVersion: number;
    identitySessionRevokedAt: number | null;
  }>;

export type AtomicAuthorizationCodeStoreConsumeResult =
  | Readonly<{ status: "consumed"; record: ConsumedAuthorizationCodeStoreRecord }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "replayed" }>;

/** Structurally implements @vfurst/auth's AuthorizationCodeStore port. */
export type PrismaAuthorizationCodeStore = Readonly<{
  create(record: AuthorizationCodeStoreRecord): Promise<void>;
  consume(codeHash: string, consumedAt: number): Promise<AtomicAuthorizationCodeStoreConsumeResult>;
}>;

export type AuthorizationCodePersistenceErrorCode = "SESSION_REVOKED" | "INVALID_EXPIRY";

export class AuthorizationCodePersistenceError extends Error {
  constructor(
    public readonly code: AuthorizationCodePersistenceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AuthorizationCodePersistenceError";
  }
}

export type RegisterIdentitySessionInput = {
  id: string;
  userId: string;
  /** Only the SHA-256 digest is persisted; the raw token must remain outside the database. */
  sessionTokenHash: string;
  expiresAt: Date;
  now?: Date;
};

function assertSha256Hash(value: string, field: string): void {
  if (!SHA_256_HEX_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 hex digest.`);
  }
}

function assertEpochSeconds(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative epoch-second integer.`);
  }
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1_000);
}

function assertFutureExpiry(now: Date, expiresAt: Date): void {
  if (expiresAt <= now) {
    throw new AuthorizationCodePersistenceError("INVALID_EXPIRY", "Identity session expiry must be in the future.");
  }
}

export async function registerIdentitySession(
  client: PrismaClient,
  input: RegisterIdentitySessionInput
): Promise<Session> {
  const now = input.now ?? new Date();
  assertSha256Hash(input.sessionTokenHash, "sessionTokenHash");
  assertFutureExpiry(now, input.expiresAt);

  return client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, authVersion: true }
    });

    if (!user) {
      throw new AuthorizationCodePersistenceError("SESSION_REVOKED", "Identity user is no longer available.");
    }

    return tx.session.create({
      data: {
        id: input.id,
        userId: user.id,
        sessionToken: input.sessionTokenHash,
        authVersion: user.authVersion,
        expires: input.expiresAt
      }
    });
  });
}

export async function revokeIdentitySession(
  client: Pick<PrismaClient, "session">,
  identitySessionId: string,
  revokedAt = new Date()
): Promise<boolean> {
  const result = await client.session.updateMany({
    where: {
      id: identitySessionId,
      revokedAt: null
    },
    data: {
      revokedAt
    }
  });

  return result.count === 1;
}

function toStoreRecord(code: {
  id: string;
  codeHash: string;
  audience: string;
  clientId: string;
  userId: string;
  identitySessionId: string;
  authVersion: number;
  redirectUri: string;
  codeChallenge: string;
  issuedAt: Date;
  expiresAt: Date;
  identitySession: {
    expires: Date;
    revokedAt: Date | null;
    user: { authVersion: number };
  };
}): ConsumedAuthorizationCodeStoreRecord {
  const sessionExpiresAt = epochSeconds(code.identitySession.expires);
  const revokedAt = code.identitySession.revokedAt ? epochSeconds(code.identitySession.revokedAt) : null;

  return {
    codeId: code.id,
    codeHash: code.codeHash,
    issuer: IDENTITY_ISSUER,
    audience: code.audience as typeof TENANT_WEB_AUTHORIZATION_AUDIENCE,
    clientId: code.clientId,
    userId: code.userId,
    identitySessionId: code.identitySessionId,
    authVersion: code.authVersion,
    redirectUri: code.redirectUri,
    codeChallenge: code.codeChallenge,
    issuedAt: epochSeconds(code.issuedAt),
    expiresAt: epochSeconds(code.expiresAt),
    identitySessionExpiresAt: revokedAt === null ? sessionExpiresAt : Math.min(sessionExpiresAt, revokedAt),
    currentUserAuthVersion: code.identitySession.user.authVersion,
    identitySessionRevokedAt: revokedAt
  };
}

/**
 * Prisma adapter for the auth package's storage port. It deliberately performs
 * no redirect/client/PKCE validation: those protocol checks remain in
 * AuthorizationCodeService. `consume` only performs the replay-safe atomic DB claim.
 */
export function createPrismaAuthorizationCodeStore(client: PrismaClient): PrismaAuthorizationCodeStore {
  return {
    async create(record) {
      assertSha256Hash(record.codeHash, "codeHash");
      assertEpochSeconds(record.issuedAt, "issuedAt");
      assertEpochSeconds(record.expiresAt, "expiresAt");
      assertEpochSeconds(record.identitySessionExpiresAt, "identitySessionExpiresAt");

      await client.$transaction(
        async (tx) => {
          const identitySession = await tx.session.findUnique({
            where: { id: record.identitySessionId },
            select: {
              id: true,
              userId: true,
              authVersion: true,
              expires: true,
              revokedAt: true,
              user: {
                select: {
                  authVersion: true
                }
              }
            }
          });

          if (
            !identitySession ||
            identitySession.userId !== record.userId ||
            identitySession.revokedAt !== null ||
            identitySession.authVersion !== record.authVersion ||
            identitySession.user.authVersion !== record.authVersion ||
            epochSeconds(identitySession.expires) !== record.identitySessionExpiresAt ||
            record.expiresAt >= record.identitySessionExpiresAt
          ) {
            throw new AuthorizationCodePersistenceError(
              "SESSION_REVOKED",
              "Identity session is expired, revoked, or no longer matches the authorization-code record."
            );
          }

          await tx.authorizationCode.create({
            data: {
              id: record.codeId,
              codeHash: record.codeHash,
              userId: record.userId,
              identitySessionId: record.identitySessionId,
              clientId: record.clientId,
              audience: record.audience,
              redirectUri: record.redirectUri,
              codeChallenge: record.codeChallenge,
              authVersion: record.authVersion,
              issuedAt: new Date(record.issuedAt * 1_000),
              expiresAt: new Date(record.expiresAt * 1_000)
            }
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    },

    async consume(codeHash, consumedAt) {
      assertSha256Hash(codeHash, "codeHash");
      assertEpochSeconds(consumedAt, "consumedAt");
      const consumedAtDate = new Date(consumedAt * 1_000);

      return client.$transaction(
        async (tx): Promise<AtomicAuthorizationCodeStoreConsumeResult> => {
          const claim = await tx.authorizationCode.updateMany({
            where: {
              codeHash,
              consumedAt: null
            },
            data: {
              consumedAt: consumedAtDate
            }
          });

          if (claim.count !== 1) {
            const existing = await tx.authorizationCode.findUnique({
              where: { codeHash },
              select: { id: true }
            });
            return existing ? { status: "replayed" } : { status: "missing" };
          }

          const code = await tx.authorizationCode.findUniqueOrThrow({
            where: { codeHash },
            include: {
              identitySession: {
                select: {
                  expires: true,
                  revokedAt: true,
                  user: {
                    select: {
                      authVersion: true
                    }
                  }
                }
              }
            }
          });

          return {
            status: "consumed",
            record: toStoreRecord(code)
          };
        }
      );
    }
  };
}
