import type { ControlPlaneOutboxEvent, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  claimControlPlaneEvent,
  enqueueControlPlaneEvent,
  enqueueTenantControlPlaneEvent,
  markControlPlaneEventPublished,
  recordControlPlaneEventReceipt,
  rescheduleControlPlaneEvent
} from "./control-plane-outbox.js";

const now = new Date("2026-07-17T10:00:00.000Z");
const eventId = "00000000-0000-4000-8000-000000000011";
const organizationId = "00000000-0000-4000-8000-000000000012";
const correlationId = "00000000-0000-4000-8000-000000000013";

function event(overrides: Partial<ControlPlaneOutboxEvent> = {}): ControlPlaneOutboxEvent {
  return {
    id: eventId,
    idempotencyKey: "00000000-0000-4000-8000-000000000014",
    organizationId,
    aggregateType: "tenant",
    aggregateId: organizationId,
    eventType: "tenant.lifecycle-changed",
    aggregateVersion: 4,
    correlationId,
    actorUserId: null,
    occurredAt: now,
    payload: {},
    status: "PENDING",
    attemptCount: 0,
    maxAttempts: 12,
    availableAt: now,
    claimedAt: null,
    lastAttemptAt: null,
    publishedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("control-plane outbox", () => {
  it("increments a tenant aggregate version and persists a canonical event envelope", async () => {
    const created = event();
    const tx = {
      organization: {
        update: vi.fn().mockResolvedValue({ controlPlaneVersion: 4 })
      },
      controlPlaneOutboxEvent: {
        create: vi.fn().mockResolvedValue(created)
      }
    };

    await expect(
      enqueueTenantControlPlaneEvent(tx as never, {
        id: eventId,
        idempotencyKey: created.idempotencyKey,
        organizationId,
        eventType: created.eventType,
        correlationId,
        actorUserId: null,
        occurredAt: now,
        data: {
          previousStatus: "SUSPENDED",
          status: "ACTIVE"
        }
      })
    ).resolves.toEqual(created);

    expect(tx.controlPlaneOutboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateType: "tenant",
        aggregateId: organizationId,
        aggregateVersion: 4,
        payload: {
          id: eventId,
          type: created.eventType,
          organizationId,
          aggregateType: "tenant",
          aggregateId: organizationId,
          occurredAt: now.toISOString(),
          actorUserId: null,
          aggregateVersion: 4,
          correlationId,
          data: {
            previousStatus: "SUSPENDED",
            status: "ACTIVE"
          }
        }
      })
    });
  });

  it("supports platform-global aggregates without inventing an organization", async () => {
    const created = event({
      organizationId: null,
      aggregateType: "platform-payment-policy",
      aggregateId: "global",
      aggregateVersion: 9
    });
    const create = vi.fn().mockResolvedValue(created);

    await enqueueControlPlaneEvent({ controlPlaneOutboxEvent: { create } } as never, {
      id: eventId,
      idempotencyKey: created.idempotencyKey,
      organizationId: null,
      aggregateType: "platform-payment-policy",
      aggregateId: "global",
      aggregateVersion: 9,
      eventType: "platform.payment-policy-changed",
      correlationId,
      actorUserId: null,
      occurredAt: now,
      data: { providers: ["STRIPE"] }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: null,
        aggregateType: "platform-payment-policy",
        aggregateId: "global",
        aggregateVersion: 9,
        payload: {
          id: eventId,
          type: "platform.payment-policy-changed",
          aggregateType: "platform-payment-policy",
          aggregateId: "global",
          occurredAt: now.toISOString(),
          actorUserId: null,
          aggregateVersion: 9,
          correlationId,
          data: { providers: ["STRIPE"] }
        }
      })
    });
  });

  it("lets only a due non-exhausted pending event be claimed", async () => {
    const claimed = event({ status: "PROCESSING", attemptCount: 1, claimedAt: now });
    const repository = {
      findUnique: vi.fn()
        .mockResolvedValueOnce({ status: "PENDING", availableAt: now, attemptCount: 0, maxAttempts: 12, claimedAt: null })
        .mockResolvedValueOnce(claimed),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    };

    await expect(
      claimControlPlaneEvent({ controlPlaneOutboxEvent: repository } as unknown as PrismaClient, eventId, now)
    ).resolves.toEqual(claimed);
    expect(repository.updateMany).toHaveBeenCalledWith({
      where: { id: eventId, status: "PENDING", availableAt: { lte: now }, attemptCount: 0 },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        claimedAt: now,
        lastAttemptAt: now
      }
    });
  });

  it("does not claim an event whose persisted attempt budget is exhausted", async () => {
    const repository = {
      findUnique: vi.fn().mockResolvedValue({ status: "PENDING", availableAt: now, attemptCount: 12, maxAttempts: 12 }),
      updateMany: vi.fn()
    };

    await expect(
      claimControlPlaneEvent({ controlPlaneOutboxEvent: repository } as unknown as PrismaClient, eventId, now)
    ).resolves.toBeNull();
    expect(repository.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims a processing event after its bounded claim lease expires", async () => {
    const staleClaim = new Date(now.getTime() - 61_000);
    const claimed = event({ status: "PROCESSING", attemptCount: 2, claimedAt: now });
    const repository = {
      findUnique: vi.fn()
        .mockResolvedValueOnce({
          status: "PROCESSING",
          availableAt: now,
          attemptCount: 1,
          maxAttempts: 12,
          claimedAt: staleClaim
        })
        .mockResolvedValueOnce(claimed),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    };

    await expect(
      claimControlPlaneEvent({ controlPlaneOutboxEvent: repository } as unknown as PrismaClient, eventId, now)
    ).resolves.toEqual(claimed);
    expect(repository.updateMany).toHaveBeenCalledWith({
      where: { id: eventId, status: "PROCESSING", claimedAt: staleClaim, attemptCount: 1 },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        claimedAt: now,
        lastAttemptAt: now
      }
    });
  });

  it("does not steal an active processing lease", async () => {
    const repository = {
      findUnique: vi.fn().mockResolvedValue({
        status: "PROCESSING",
        availableAt: now,
        attemptCount: 1,
        maxAttempts: 12,
        claimedAt: new Date(now.getTime() - 30_000)
      }),
      updateMany: vi.fn()
    };

    await expect(
      claimControlPlaneEvent({ controlPlaneOutboxEvent: repository } as unknown as PrismaClient, eventId, now)
    ).resolves.toBeNull();
    expect(repository.updateMany).not.toHaveBeenCalled();
  });

  it("publishes only a claimed event and clears claim/error state", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await expect(
      markControlPlaneEventPublished(
        { controlPlaneOutboxEvent: { updateMany } } as unknown as PrismaClient,
        eventId,
        now
      )
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: eventId, status: "PROCESSING" },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        claimedAt: null,
        lastError: null
      }
    });
  });

  it("dead-letters an event after its last persisted attempt", async () => {
    const repository = {
      findUnique: vi.fn().mockResolvedValue({ status: "PROCESSING", attemptCount: 12, maxAttempts: 12 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    };

    await expect(
      rescheduleControlPlaneEvent({ controlPlaneOutboxEvent: repository } as unknown as PrismaClient, {
        eventId,
        availableAt: new Date(now.getTime() + 60_000),
        error: "redis unavailable"
      })
    ).resolves.toBe("FAILED");
    expect(repository.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("records a consumer receipt once with a database uniqueness boundary", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    await expect(
      recordControlPlaneEventReceipt(
        { controlPlaneEventReceipt: { createMany } } as unknown as PrismaClient,
        { eventId, consumer: "tenant-web:tenant-directory", processedAt: now }
      )
    ).resolves.toBe(true);
    expect(createMany).toHaveBeenCalledWith({
      data: { eventId, consumer: "tenant-web:tenant-directory", processedAt: now },
      skipDuplicates: true
    });
  });
});
