import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupIdentityProtocolRecordBatch,
  DEFAULT_IDENTITY_SESSION_RETENTION_MS
} from "./identity-retention.js";

const now = new Date("2026-07-17T10:00:00.000Z");
const oldSessionId = "00000000-0000-4000-8000-000000000002";
const sessionCutoff = new Date(now.getTime() - DEFAULT_IDENTITY_SESSION_RETENTION_MS);
const eligibility = { OR: [{ expires: { lte: sessionCutoff } }, { revokedAt: { lte: sessionCutoff } }] };

function clientWithTransaction(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
  } as unknown as PrismaClient;
}

describe("identity protocol retention", () => {
  it("deletes only a bounded, rechecked batch of long-expired or long-revoked staff sessions", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([{ id: oldSessionId }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 25 }))
      .resolves.toEqual({ identitySessionsSelected: 1, identitySessionsDeleted: 1, hasMore: false });
    expect(tx.session.findMany).toHaveBeenCalledWith({ where: eligibility, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 25 });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [oldSessionId] }, ...eligibility } });
  });

  it("is idempotent on an empty batch", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now }))
      .resolves.toEqual({ identitySessionsSelected: 0, identitySessionsDeleted: 0, hasMore: false });
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("signals another batch when a full batch was selected", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([{ id: oldSessionId }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 1 }))
      .resolves.toMatchObject({ hasMore: true });
  });

  it("rejects unbounded batches and sub-minute retention", async () => {
    const client = clientWithTransaction({});
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 1_001 })).rejects.toThrow(/batchSize/);
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 0 })).rejects.toThrow(/batchSize/);
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, identitySessionRetentionMs: 59_999 })).rejects.toThrow(/identitySessionRetentionMs/);
  });
});
