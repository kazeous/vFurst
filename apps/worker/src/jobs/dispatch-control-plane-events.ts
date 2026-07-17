import {
  DEFAULT_CONTROL_PLANE_CLAIM_LEASE_MS,
  claimControlPlaneEvent,
  markControlPlaneEventPublished,
  prisma,
  rescheduleControlPlaneEvent
} from "@vfurst/db";
import { QUEUE_JOB_NAMES, type ControlPlaneJobData } from "@vfurst/contracts";
import { controlPlaneQueue } from "../queues.js";

const RECOVERY_BATCH_SIZE = 100;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

type DispatchClaim = {
  id: string;
  attemptCount: number;
};

export interface ControlPlaneDispatchRepository {
  findRecoverable(input: {
    now: Date;
    staleBefore: Date;
    take: number;
  }): Promise<Array<{ id: string }>>;
  claim(eventId: string, now: Date, leaseMs: number): Promise<DispatchClaim | null>;
  markPublished(eventId: string, publishedAt: Date): Promise<boolean>;
  reschedule(input: {
    eventId: string;
    availableAt: Date;
    error: string;
  }): Promise<"PENDING" | "FAILED" | null>;
}

export interface ControlPlaneDispatchQueue {
  add(
    name: typeof QUEUE_JOB_NAMES.applyControlPlaneEvent,
    data: ControlPlaneJobData,
    options: { jobId: string }
  ): Promise<unknown>;
}

export const prismaControlPlaneDispatchRepository: ControlPlaneDispatchRepository = {
  async findRecoverable({ now, staleBefore, take }) {
    return prisma.controlPlaneOutboxEvent.findMany({
      where: {
        OR: [
          {
            status: "PENDING",
            availableAt: { lte: now }
          },
          {
            status: "PROCESSING",
            OR: [{ claimedAt: null }, { claimedAt: { lte: staleBefore } }]
          }
        ]
      },
      select: { id: true },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take
    });
  },
  claim(eventId, now, leaseMs) {
    return claimControlPlaneEvent(prisma, eventId, now, leaseMs);
  },
  markPublished(eventId, publishedAt) {
    return markControlPlaneEventPublished(prisma, eventId, publishedAt);
  },
  reschedule(input) {
    return rescheduleControlPlaneEvent(prisma, input);
  }
};

function retryDelayMs(attemptCount: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attemptCount - 1), MAX_RETRY_DELAY_MS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function dispatchControlPlaneEvents(input: {
  repository: ControlPlaneDispatchRepository;
  queue: ControlPlaneDispatchQueue;
  now?: Date;
  leaseMs?: number;
  batchSize?: number;
}) {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? DEFAULT_CONTROL_PLANE_CLAIM_LEASE_MS;
  const batchSize = input.batchSize ?? RECOVERY_BATCH_SIZE;
  const staleBefore = new Date(now.getTime() - leaseMs);
  const recoverable = await input.repository.findRecoverable({ now, staleBefore, take: batchSize });
  const result = {
    scanned: recoverable.length,
    claimed: 0,
    published: 0,
    rescheduled: 0,
    failed: 0
  };

  for (const pointer of recoverable) {
    const claimed = await input.repository.claim(pointer.id, now, leaseMs);
    if (!claimed) {
      continue;
    }

    result.claimed += 1;
    try {
      // Redis/BullMQ receives only a durable pointer. Resolving add means the
      // deterministic job id has been accepted by Redis.
      await input.queue.add(
        QUEUE_JOB_NAMES.applyControlPlaneEvent,
        { eventId: claimed.id },
        { jobId: claimed.id }
      );

      const marked = await input.repository.markPublished(claimed.id, new Date());
      if (!marked) {
        throw new Error("The claimed control-plane event could not be marked as published.");
      }

      result.published += 1;
    } catch (error) {
      const disposition = await input.repository.reschedule({
        eventId: claimed.id,
        availableAt: new Date(now.getTime() + retryDelayMs(claimed.attemptCount)),
        error: errorMessage(error)
      });

      if (disposition === "FAILED") {
        result.failed += 1;
      } else if (disposition === "PENDING") {
        result.rescheduled += 1;
      }
    }
  }

  return result;
}

export function processDispatchControlPlaneEvents(now = new Date()) {
  return dispatchControlPlaneEvents({
    repository: prismaControlPlaneDispatchRepository,
    queue: controlPlaneQueue,
    now
  });
}
