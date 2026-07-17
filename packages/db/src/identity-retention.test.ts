import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupIdentityProtocolRecordBatch,
  DEFAULT_AUTHORIZATION_CODE_RETENTION_MS,
  DEFAULT_IDENTITY_SESSION_RETENTION_MS
} from "./identity-retention.js";

const now = new Date("2026-07-17T10:00:00.000Z");
const oldCodeId = "00000000-0000-4000-8000-000000000001";
const oldSessionId = "00000000-0000-4000-8000-000000000002";

function clientWithTransaction(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
  } as unknown as PrismaClient;
}

describe("identity protocol retention", () => {
  it("retains a forensic/replay window and deletes only a bounded, rechecked batch", async () => {
    const tx = {
      authorizationCode: {
        findMany: vi.fn().mockResolvedValue([{ id: oldCodeId }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      session: {
        findMany: vi.fn().mockResolvedValue([{ id: oldSessionId }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 25 })
    ).resolves.toEqual({
      authorizationCodesSelected: 1,
      authorizationCodesDeleted: 1,
      identitySessionsSelected: 1,
      identitySessionsDeleted: 1,
      hasMore: false
    });

    const codeCutoff = new Date(now.getTime() - DEFAULT_AUTHORIZATION_CODE_RETENTION_MS);
    const sessionCutoff = new Date(now.getTime() - DEFAULT_IDENTITY_SESSION_RETENTION_MS);
    expect(tx.authorizationCode.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: codeCutoff } },
      select: { id: true },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 25
    });
    expect(tx.authorizationCode.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [oldCodeId] }, expiresAt: { lte: codeCutoff } }
    });
    expect(tx.session.findMany).toHaveBeenCalledWith({
      where: {
        authorizationCodes: { none: {} },
        OR: [{ expires: { lte: sessionCutoff } }, { revokedAt: { lte: sessionCutoff } }]
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 25
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: [oldSessionId] },
        authorizationCodes: { none: {} },
        OR: [{ expires: { lte: sessionCutoff } }, { revokedAt: { lte: sessionCutoff } }]
      }
    });
  });

  it("does not treat consumption as immediate deletion eligibility", async () => {
    const tx = {
      authorizationCode: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn()
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn()
      }
    };

    await cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now });

    const where = tx.authorizationCode.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      expiresAt: { lte: new Date(now.getTime() - DEFAULT_AUTHORIZATION_CODE_RETENTION_MS) }
    });
    expect(where).not.toHaveProperty("consumedAt");
    expect(tx.authorizationCode.deleteMany).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("is idempotent on an empty batch and signals when another bounded batch may exist", async () => {
    const emptyTx = {
      authorizationCode: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() }
    };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(emptyTx), { now })).resolves.toMatchObject({
      authorizationCodesDeleted: 0,
      identitySessionsDeleted: 0,
      hasMore: false
    });

    const fullTx = {
      authorizationCode: {
        findMany: vi.fn().mockResolvedValue([{ id: oldCodeId }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() }
    };
    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(fullTx), { now, batchSize: 1 })
    ).resolves.toMatchObject({ hasMore: true });
  });

  it("rejects unbounded or retention-inverting cleanup inputs", async () => {
    const client = clientWithTransaction({});
    await expect(
      cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 1_001 })
    ).rejects.toThrow(/batchSize/);
    await expect(
      cleanupIdentityProtocolRecordBatch(client, {
        now,
        authorizationCodeRetentionMs: 2 * 60_000,
        identitySessionRetentionMs: 60_000
      })
    ).rejects.toThrow(/must not be shorter/);
  });
});
