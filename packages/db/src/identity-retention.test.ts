import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupIdentityProtocolRecordBatch,
  DEFAULT_IDENTITY_SESSION_RETENTION_MS,
  DEFAULT_PORTAL_SESSION_RETENTION_MS,
  DEFAULT_PORTAL_TOKEN_RETENTION_MS
} from "./identity-retention.js";

const now = new Date("2026-07-17T10:00:00.000Z");
const oldSessionId = "00000000-0000-4000-8000-000000000002";
const sessionCutoff = new Date(now.getTime() - DEFAULT_IDENTITY_SESSION_RETENTION_MS);
const eligibility = {
  OR: [{ expires: { lte: sessionCutoff } }, { revokedAt: { lte: sessionCutoff } }]
};

function clientWithTransaction(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
  } as unknown as PrismaClient;
}

function sessionTransaction(
  selectedIds: string[],
  portalSessionIds: string[] = [],
  portalAccountTokenIds: string[] = []
) {
  return {
    session: {
      findMany: vi.fn().mockResolvedValue(selectedIds.map((id) => ({ id }))),
      deleteMany: vi.fn().mockResolvedValue({ count: selectedIds.length })
    },
    portalSession: {
      findMany: vi.fn().mockResolvedValue(portalSessionIds.map((id) => ({ id }))),
      deleteMany: vi.fn().mockResolvedValue({ count: portalSessionIds.length })
    },
    portalAccountToken: {
      findMany: vi.fn().mockResolvedValue(portalAccountTokenIds.map((id) => ({ id }))),
      deleteMany: vi.fn().mockResolvedValue({ count: portalAccountTokenIds.length })
    }
  };
}

describe("identity protocol retention", () => {
  it("deletes only a bounded, rechecked batch of long-expired or long-revoked staff sessions", async () => {
    const tx = sessionTransaction([oldSessionId]);

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 25 })
    ).resolves.toEqual({
      identitySessionsSelected: 1,
      identitySessionsDeleted: 1,
      portalSessionsSelected: 0,
      portalSessionsDeleted: 0,
      portalAccountTokensSelected: 0,
      portalAccountTokensDeleted: 0,
      hasMore: false
    });

    expect(tx.session.findMany).toHaveBeenCalledWith({
      where: eligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 25
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [oldSessionId] }, ...eligibility }
    });
  });

  it("is idempotent on an empty batch", async () => {
    const tx = sessionTransaction([]);

    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now })).resolves.toEqual({
      identitySessionsSelected: 0,
      identitySessionsDeleted: 0,
      portalSessionsSelected: 0,
      portalSessionsDeleted: 0,
      portalAccountTokensSelected: 0,
      portalAccountTokensDeleted: 0,
      hasMore: false
    });
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
    expect(tx.portalSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.portalAccountToken.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps portal sessions for 30 days and account tokens for 7 days after expiry or termination", async () => {
    expect(DEFAULT_PORTAL_SESSION_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(DEFAULT_PORTAL_TOKEN_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1_000);
    const tx = sessionTransaction([], ["portal-session"], ["portal-token"]);
    const portalSessionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const tokenCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
    const portalSessionEligibility = {
      OR: [{ expiresAt: { lte: portalSessionCutoff } }, { revokedAt: { lte: portalSessionCutoff } }]
    };
    const tokenEligibility = {
      OR: [{ expiresAt: { lte: tokenCutoff } }, { consumedAt: { lte: tokenCutoff } }]
    };
    // A concurrent eligibility change can reduce deletes below the selected count.
    tx.portalAccountToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 25 })
    ).resolves.toEqual({
      identitySessionsSelected: 0,
      identitySessionsDeleted: 0,
      portalSessionsSelected: 1,
      portalSessionsDeleted: 1,
      portalAccountTokensSelected: 1,
      portalAccountTokensDeleted: 0,
      hasMore: false
    });
    expect(tx.portalSession.findMany).toHaveBeenCalledWith({
      where: portalSessionEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 25
    });
    expect(tx.portalSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["portal-session"] }, ...portalSessionEligibility }
    });
    expect(tx.portalAccountToken.findMany).toHaveBeenCalledWith({
      where: tokenEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 25
    });
    expect(tx.portalAccountToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["portal-token"] }, ...tokenEligibility }
    });
  });

  it("uses independent validated portal retention overrides", async () => {
    const tx = sessionTransaction([], ["portal-session"], ["portal-token"]);
    const portalSessionCutoff = new Date(now.getTime() - 60_000);
    const tokenCutoff = new Date(now.getTime() - 120_000);
    const portalSessionEligibility = {
      OR: [{ expiresAt: { lte: portalSessionCutoff } }, { revokedAt: { lte: portalSessionCutoff } }]
    };
    const tokenEligibility = {
      OR: [{ expiresAt: { lte: tokenCutoff } }, { consumedAt: { lte: tokenCutoff } }]
    };

    await cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), {
      now,
      portalSessionRetentionMs: 60_000,
      portalTokenRetentionMs: 120_000,
      batchSize: 10
    });
    expect(tx.portalSession.findMany).toHaveBeenCalledWith({
      where: portalSessionEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10
    });
    expect(tx.portalSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["portal-session"] }, ...portalSessionEligibility }
    });
    expect(tx.portalAccountToken.findMany).toHaveBeenCalledWith({
      where: tokenEligibility,
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10
    });
    expect(tx.portalAccountToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["portal-token"] }, ...tokenEligibility }
    });
  });

  it.each(["portalSessionRetentionMs", "portalTokenRetentionMs"] as const)(
    "rejects invalid %s before entering a transaction",
    async (field) => {
      const client = clientWithTransaction({});
      for (const value of [59_999, 60_000.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await expect(
          cleanupIdentityProtocolRecordBatch(client, { now, [field]: value })
        ).rejects.toThrow(`${field} must be an integer of at least 60000 milliseconds.`);
      }
      expect(client.$transaction).not.toHaveBeenCalled();
    }
  );

  it("signals another batch when only portal sessions fill the batch", async () => {
    const tx = sessionTransaction([], ["portal-session"]);
    tx.portalSession.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 1 })
    ).resolves.toMatchObject({ portalSessionsSelected: 1, portalSessionsDeleted: 0, hasMore: true });
  });

  it("signals another batch when only portal tokens fill the batch", async () => {
    const tx = sessionTransaction([], [], ["portal-token"]);
    tx.portalAccountToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 1 })
    ).resolves.toMatchObject({
      portalAccountTokensSelected: 1,
      portalAccountTokensDeleted: 0,
      hasMore: true
    });
  });

  it("signals another batch when a full batch was selected", async () => {
    const tx = sessionTransaction([oldSessionId]);

    await expect(
      cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 1 })
    ).resolves.toMatchObject({ hasMore: true });
  });

  it("rejects unbounded batches and sub-minute retention", async () => {
    const client = clientWithTransaction({});

    await expect(
      cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 1_001 })
    ).rejects.toThrow(/batchSize/);
    await expect(
      cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 0 })
    ).rejects.toThrow(/batchSize/);
    await expect(
      cleanupIdentityProtocolRecordBatch(client, { now, identitySessionRetentionMs: 59_999 })
    ).rejects.toThrow(/identitySessionRetentionMs/);
  });
});
