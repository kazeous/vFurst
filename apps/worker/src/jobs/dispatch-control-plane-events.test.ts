import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  claim: vi.fn(),
  markPublished: vi.fn(),
  reschedule: vi.fn(),
  queueAdd: vi.fn()
}));

vi.mock("@vfurst/db", () => ({
  DEFAULT_CONTROL_PLANE_CLAIM_LEASE_MS: 60_000,
  claimControlPlaneEvent: mocks.claim,
  markControlPlaneEventPublished: mocks.markPublished,
  rescheduleControlPlaneEvent: mocks.reschedule,
  prisma: {
    controlPlaneOutboxEvent: {
      findMany: mocks.findMany
    }
  }
}));

vi.mock("../queues.js", () => ({
  controlPlaneQueue: {
    add: mocks.queueAdd
  }
}));

import {
  dispatchControlPlaneEvents,
  prismaControlPlaneDispatchRepository,
  type ControlPlaneDispatchRepository
} from "./dispatch-control-plane-events.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-07-17T10:00:00.000Z");

function repository(
  overrides: Partial<ControlPlaneDispatchRepository> = {}
): ControlPlaneDispatchRepository {
  return {
    findRecoverable: vi.fn().mockResolvedValue([{ id: eventId }]),
    claim: vi.fn().mockResolvedValue({ id: eventId, attemptCount: 2 }),
    markPublished: vi.fn().mockResolvedValue(true),
    reschedule: vi.fn().mockResolvedValue("PENDING"),
    ...overrides
  };
}

describe("control-plane outbox dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reschedules a claimed event when deterministic BullMQ acceptance fails", async () => {
    const repo = repository();
    const add = vi.fn().mockRejectedValue(new Error("redis unavailable"));

    const result = await dispatchControlPlaneEvents({
      repository: repo,
      queue: { add },
      now
    });

    expect(add).toHaveBeenCalledWith(
      "apply-control-plane-event",
      { eventId },
      { jobId: eventId }
    );
    expect(repo.markPublished).not.toHaveBeenCalled();
    expect(repo.reschedule).toHaveBeenCalledWith({
      eventId,
      availableAt: new Date("2026-07-17T10:00:10.000Z"),
      error: "redis unavailable"
    });
    expect(result).toEqual({
      scanned: 1,
      claimed: 1,
      published: 0,
      rescheduled: 1,
      failed: 0
    });
  });

  it("reports a terminal failure when the repository exhausts the attempt budget", async () => {
    const repo = repository({
      reschedule: vi.fn().mockResolvedValue("FAILED")
    });

    const result = await dispatchControlPlaneEvents({
      repository: repo,
      queue: { add: vi.fn().mockRejectedValue(new Error("still unavailable")) },
      now
    });

    expect(result.failed).toBe(1);
    expect(result.rescheduled).toBe(0);
  });

  it("recovers both due pending rows and stale processing leases", async () => {
    mocks.findMany.mockResolvedValue([{ id: eventId }]);
    const staleBefore = new Date("2026-07-17T09:59:00.000Z");

    await prismaControlPlaneDispatchRepository.findRecoverable({
      now,
      staleBefore,
      take: 100
    });
    await prismaControlPlaneDispatchRepository.claim(eventId, now, 60_000);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          {
            status: "PROCESSING",
            OR: [{ claimedAt: null }, { claimedAt: { lte: staleBefore } }]
          }
        ]
      },
      select: { id: true },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: 100
    });
    expect(mocks.claim).toHaveBeenCalledWith(expect.anything(), eventId, now, 60_000);
  });
});
