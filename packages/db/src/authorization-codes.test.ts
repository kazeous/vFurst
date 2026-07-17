import type { PrismaClient, Session } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthorizationCodePersistenceError } from "./authorization-codes.js";
import {
  createPrismaAuthorizationCodeStore,
  IDENTITY_ISSUER,
  registerIdentitySession,
  revokeIdentitySession,
  TENANT_WEB_AUTHORIZATION_AUDIENCE,
  type AuthorizationCodeStoreRecord
} from "./authorization-codes.js";

const now = new Date("2026-07-17T10:00:00.000Z");
const nowEpoch = Math.floor(now.getTime() / 1_000);
const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const codeId = "00000000-0000-4000-8000-000000000003";
const codeHash = "a".repeat(64);
const sessionTokenHash = "b".repeat(64);
const sessionExpiresAt = nowEpoch + 86_400;

const record: AuthorizationCodeStoreRecord = {
  codeId,
  codeHash,
  issuer: IDENTITY_ISSUER,
  audience: TENANT_WEB_AUTHORIZATION_AUDIENCE,
  clientId: "tenant-web-browser",
  userId,
  identitySessionId: sessionId,
  authVersion: 3,
  redirectUri: "https://console.vfurst.test/auth/callback",
  codeChallenge: "c".repeat(43),
  issuedAt: nowEpoch,
  expiresAt: nowEpoch + 90,
  identitySessionExpiresAt: sessionExpiresAt
};

function transactionClient(tx: Record<string, unknown>): PrismaClient {
  return {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  } as unknown as PrismaClient;
}

describe("identity session registry", () => {
  it("registers only a hashed session handle bound to the user's current auth version", async () => {
    const session = {
      id: sessionId,
      sessionToken: sessionTokenHash,
      userId,
      authVersion: 3,
      expires: new Date(sessionExpiresAt * 1_000),
      revokedAt: null,
      createdAt: now,
      updatedAt: now
    } satisfies Session;
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId, authVersion: 3 }) },
      session: { create: vi.fn().mockResolvedValue(session) }
    };

    await expect(
      registerIdentitySession(transactionClient(tx), {
        id: sessionId,
        userId,
        sessionTokenHash,
        expiresAt: session.expires,
        now
      })
    ).resolves.toEqual(session);
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionToken: sessionTokenHash, authVersion: 3 })
    });
  });

  it("rejects a raw non-hash session token", async () => {
    await expect(
      registerIdentitySession(transactionClient({}), {
        id: sessionId,
        userId,
        sessionTokenHash: "raw-token",
        expiresAt: new Date(sessionExpiresAt * 1_000),
        now
      })
    ).rejects.toThrow("sessionTokenHash must be a lowercase SHA-256 hex digest");
  });

  it("revokes a session idempotently", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await expect(
      revokeIdentitySession({ session: { updateMany } } as unknown as PrismaClient, sessionId, now)
    ).resolves.toBe(true);
  });
});

describe("Prisma authorization-code store", () => {
  it("implements the auth storage port and derives persistence from a live identity session", async () => {
    const tx = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: sessionId,
          userId,
          authVersion: 3,
          expires: new Date(sessionExpiresAt * 1_000),
          revokedAt: null,
          user: { authVersion: 3 }
        })
      },
      authorizationCode: { create: vi.fn().mockResolvedValue({}) }
    };

    await createPrismaAuthorizationCodeStore(transactionClient(tx)).create(record);
    expect(tx.authorizationCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: codeId,
        codeHash,
        clientId: record.clientId,
        issuedAt: new Date(record.issuedAt * 1_000),
        expiresAt: new Date(record.expiresAt * 1_000)
      })
    });
  });

  it("refuses creation when the session auth version is stale", async () => {
    const tx = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: sessionId,
          userId,
          authVersion: 2,
          expires: new Date(sessionExpiresAt * 1_000),
          revokedAt: null,
          user: { authVersion: 3 }
        })
      },
      authorizationCode: { create: vi.fn() }
    };

    await expect(createPrismaAuthorizationCodeStore(transactionClient(tx)).create(record)).rejects.toMatchObject({
      code: "SESSION_REVOKED"
    } satisfies Partial<AuthorizationCodePersistenceError>);
  });

  it("atomically claims by hash and returns session revocation/auth-version state", async () => {
    const persisted = {
      id: codeId,
      codeHash,
      userId,
      identitySessionId: sessionId,
      clientId: record.clientId,
      audience: record.audience,
      redirectUri: record.redirectUri,
      codeChallenge: record.codeChallenge,
      authVersion: record.authVersion,
      issuedAt: new Date(record.issuedAt * 1_000),
      expiresAt: new Date(record.expiresAt * 1_000),
      consumedAt: null,
      createdAt: now,
      identitySession: {
        expires: new Date(sessionExpiresAt * 1_000),
        revokedAt: null,
        user: { authVersion: 4 }
      }
    };
    const tx = {
      authorizationCode: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(persisted)
      }
    };

    await expect(createPrismaAuthorizationCodeStore(transactionClient(tx)).consume(codeHash, nowEpoch)).resolves.toEqual({
      status: "consumed",
      record: {
        ...record,
        currentUserAuthVersion: 4,
        identitySessionRevokedAt: null
      }
    });
    expect(tx.authorizationCode.updateMany).toHaveBeenCalledWith({
      where: { codeHash, consumedAt: null },
      data: { consumedAt: now }
    });
  });

  it("reports replay without attempting a second claim", async () => {
    const updateMany = vi.fn();
    const tx = {
      authorizationCode: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ id: codeId }),
        findUniqueOrThrow: updateMany
      }
    };

    await expect(createPrismaAuthorizationCodeStore(transactionClient(tx)).consume(codeHash, nowEpoch)).resolves.toEqual({
      status: "replayed"
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("treats a concurrent losing claim as replay", async () => {
    const tx = {
      authorizationCode: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ id: codeId })
      }
    };

    await expect(createPrismaAuthorizationCodeStore(transactionClient(tx)).consume(codeHash, nowEpoch)).resolves.toEqual({
      status: "replayed"
    });
  });
});
