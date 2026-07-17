import { describe, expect, it, vi } from "vitest";

vi.mock("@vfurst/db", () => ({
  prisma: {},
  recordControlPlaneEventReceipt: vi.fn()
}));

import {
  CONTROL_PLANE_VERSION_LUA,
  controlPlaneVersionKey,
  createControlPlaneEventProcessor,
  createRedisControlPlaneVersionStore,
  type ControlPlaneConsumerRepository,
  type ControlPlaneVersionStore
} from "./apply-control-plane-event.js";

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  newerEvent: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  actor: "44444444-4444-4444-8444-444444444444",
  correlation: "55555555-5555-4555-8555-555555555555"
};

function tenantEvent(id = ids.event, aggregateVersion = 1) {
  return {
    id,
    type: "tenant.lifecycle-changed" as const,
    organizationId: ids.organization,
    aggregateType: "tenant",
    aggregateId: ids.organization,
    occurredAt: "2026-07-17T10:00:00.000Z",
    actorUserId: ids.actor,
    aggregateVersion,
    correlationId: ids.correlation,
    data: {
      previousStatus: "PROVISIONING" as const,
      status: "ACTIVE" as const
    }
  };
}

function repository(payloads: Map<string, unknown>) {
  const receipts = new Set<string>();
  const repo: ControlPlaneConsumerRepository = {
    loadPayload: vi.fn(async (eventId) => payloads.get(eventId) ?? null),
    hasReceipt: vi.fn(async (eventId, consumer) => receipts.has(`${eventId}:${consumer}`)),
    recordReceipt: vi.fn(async (eventId, consumer) => {
      const key = `${eventId}:${consumer}`;
      if (receipts.has(key)) {
        return false;
      }
      receipts.add(key);
      return true;
    })
  };

  return repo;
}

function monotonicVersionStore() {
  const versions = new Map<string, number>();
  const publishInvalidation = vi.fn().mockResolvedValue(undefined);
  const store: ControlPlaneVersionStore = {
    advanceVersion: vi.fn(async (key, proposed) => {
      const current = versions.get(key) ?? 0;
      if (proposed <= current) {
        return false;
      }
      versions.set(key, proposed);
      return true;
    }),
    publishInvalidation
  };
  return { store, versions, publishInvalidation };
}

describe("control-plane event consumer", () => {
  it("rejects an invalid durable payload before touching cache state or receipts", async () => {
    const repo = repository(new Map([[ids.event, { id: ids.event, type: "unknown" }]]));
    const versions = monotonicVersionStore();
    const process = createControlPlaneEventProcessor({
      repository: repo,
      versionStore: versions.store
    });

    await expect(process({ data: { eventId: ids.event } })).rejects.toThrow();
    expect(versions.store.advanceVersion).not.toHaveBeenCalled();
    expect(repo.recordReceipt).not.toHaveBeenCalled();
  });

  it("makes repeated delivery harmless and records exactly one consumer receipt", async () => {
    const event = tenantEvent();
    const repo = repository(new Map([[event.id, event]]));
    const versions = monotonicVersionStore();
    const process = createControlPlaneEventProcessor({
      repository: repo,
      versionStore: versions.store,
      now: () => new Date("2026-07-17T10:01:00.000Z")
    });

    const first = await process({ data: { eventId: event.id } });
    const replay = await process({ data: { eventId: event.id } });

    expect(first).toMatchObject({ applied: true, duplicate: false, receiptRecorded: true });
    expect(replay).toMatchObject({ applied: false, duplicate: true, receiptRecorded: false });
    expect(versions.store.advanceVersion).toHaveBeenCalledTimes(1);
    expect(versions.publishInvalidation).toHaveBeenCalledTimes(1);
    expect(repo.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it("never lets an out-of-order event lower an aggregate cache version", async () => {
    const newer = tenantEvent(ids.newerEvent, 2);
    const older = tenantEvent(ids.event, 1);
    const repo = repository(
      new Map([
        [newer.id, newer],
        [older.id, older]
      ])
    );
    const versions = monotonicVersionStore();
    const process = createControlPlaneEventProcessor({
      repository: repo,
      versionStore: versions.store
    });

    const newestResult = await process({ data: { eventId: newer.id } });
    const olderResult = await process({ data: { eventId: older.id } });

    expect(newestResult.applied).toBe(true);
    expect(olderResult.applied).toBe(false);
    expect(versions.versions.get(controlPlaneVersionKey(newer))).toBe(2);
    expect(versions.publishInvalidation).toHaveBeenCalledTimes(2);
    expect(repo.recordReceipt).toHaveBeenCalledTimes(2);
  });

  it("retries invalidation after a publish failure even when the version already advanced", async () => {
    const event = tenantEvent();
    const repo = repository(new Map([[event.id, event]]));
    const versions = monotonicVersionStore();
    versions.publishInvalidation
      .mockRejectedValueOnce(new Error("publish interrupted"))
      .mockResolvedValueOnce(undefined);
    const process = createControlPlaneEventProcessor({
      repository: repo,
      versionStore: versions.store
    });

    await expect(process({ data: { eventId: event.id } })).rejects.toThrow("publish interrupted");
    expect(repo.recordReceipt).not.toHaveBeenCalled();

    const retry = await process({ data: { eventId: event.id } });

    expect(retry).toMatchObject({ applied: false, duplicate: false, receiptRecorded: true });
    expect(versions.store.advanceVersion).toHaveBeenCalledTimes(2);
    expect(versions.publishInvalidation).toHaveBeenCalledTimes(2);
    expect(repo.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it("uses an atomic Redis max operation and optionally publishes invalidations", async () => {
    const evalCommand = vi.fn().mockResolvedValue(1);
    const publish = vi.fn().mockResolvedValue(1);
    const event = tenantEvent();
    const store = createRedisControlPlaneVersionStore(
      { eval: evalCommand, publish },
      "vfurst:control-plane:invalidations"
    );
    const key = controlPlaneVersionKey(event);

    await expect(store.advanceVersion(key, 3)).resolves.toBe(true);
    await store.publishInvalidation?.(event);

    expect(evalCommand).toHaveBeenCalledWith(CONTROL_PLANE_VERSION_LUA, 1, key, 3);
    expect(publish).toHaveBeenCalledWith(
      "vfurst:control-plane:invalidations",
      expect.stringContaining(`"eventId":"${event.id}"`)
    );
  });
});
