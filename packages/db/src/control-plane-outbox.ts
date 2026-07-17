import {
  type ControlPlaneOutboxEvent,
  type Prisma,
  type PrismaClient
} from "@prisma/client";

const DEFAULT_MAX_ATTEMPTS = 12;
export const DEFAULT_CONTROL_PLANE_CLAIM_LEASE_MS = 60_000;

type GenericEnqueueClient = Pick<Prisma.TransactionClient, "controlPlaneOutboxEvent">;
type TenantEnqueueClient = Pick<Prisma.TransactionClient, "organization" | "controlPlaneOutboxEvent">;

export type EnqueueControlPlaneEventInput = {
  id: string;
  idempotencyKey: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  correlationId: string;
  actorUserId: string | null;
  data: Prisma.InputJsonObject;
  occurredAt?: Date;
  availableAt?: Date;
  maxAttempts?: number;
};

export type RescheduleControlPlaneEventInput = {
  eventId: string;
  availableAt: Date;
  error: string;
};

export type ControlPlaneEventEnvelope = {
  id: string;
  type: string;
  organizationId?: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  actorUserId: string | null;
  aggregateVersion: number;
  correlationId: string;
  data: Prisma.InputJsonObject;
};

function assertMaxAttempts(maxAttempts: number): void {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new TypeError("maxAttempts must be an integer between 1 and 100.");
  }
}

function createEnvelope(
  input: EnqueueControlPlaneEventInput,
  occurredAt: Date
): ControlPlaneEventEnvelope {
  const envelope: ControlPlaneEventEnvelope = {
    id: input.id,
    type: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: occurredAt.toISOString(),
    actorUserId: input.actorUserId,
    aggregateVersion: input.aggregateVersion,
    correlationId: input.correlationId,
    data: input.data
  };

  if (input.organizationId !== null) {
    envelope.organizationId = input.organizationId;
  }

  return envelope;
}

/**
 * Enqueue from inside the same database transaction that mutates the tenant.
 * If the outbox insert fails, the caller's control-plane mutation must roll back.
 */
export async function enqueueControlPlaneEvent(
  tx: GenericEnqueueClient,
  input: EnqueueControlPlaneEventInput
): Promise<ControlPlaneOutboxEvent> {
  const occurredAt = input.occurredAt ?? new Date();
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  assertMaxAttempts(maxAttempts);
  if (!Number.isInteger(input.aggregateVersion) || input.aggregateVersion < 1) {
    throw new TypeError("aggregateVersion must be a positive integer.");
  }

  const payload = createEnvelope(input, occurredAt);
  return tx.controlPlaneOutboxEvent.create({
    data: {
      id: input.id,
      idempotencyKey: input.idempotencyKey,
      organizationId: input.organizationId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      aggregateVersion: input.aggregateVersion,
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      occurredAt,
      payload,
      maxAttempts,
      availableAt: input.availableAt ?? occurredAt
    }
  });
}

export type EnqueueTenantControlPlaneEventInput = Omit<
  EnqueueControlPlaneEventInput,
  "organizationId" | "aggregateType" | "aggregateId" | "aggregateVersion"
> & {
  organizationId: string;
};

/** Increments the tenant aggregate version and writes its event in the caller's transaction. */
export async function enqueueTenantControlPlaneEvent(
  tx: TenantEnqueueClient,
  input: EnqueueTenantControlPlaneEventInput
): Promise<ControlPlaneOutboxEvent> {
  const organization = await tx.organization.update({
    where: { id: input.organizationId },
    data: {
      controlPlaneVersion: { increment: 1 }
    },
    select: {
      controlPlaneVersion: true
    }
  });

  return enqueueControlPlaneEvent(tx, {
    ...input,
    organizationId: input.organizationId,
    aggregateType: "tenant",
    aggregateId: input.organizationId,
    aggregateVersion: organization.controlPlaneVersion
  });
}

/** Atomically lets only one dispatcher claim a due event. */
export async function claimControlPlaneEvent(
  client: Pick<PrismaClient, "controlPlaneOutboxEvent">,
  eventId: string,
  now = new Date(),
  leaseMs = DEFAULT_CONTROL_PLANE_CLAIM_LEASE_MS
): Promise<ControlPlaneOutboxEvent | null> {
  if (!Number.isInteger(leaseMs) || leaseMs < 1) {
    throw new TypeError("leaseMs must be a positive integer.");
  }

  const staleBefore = new Date(now.getTime() - leaseMs);
  const event = await client.controlPlaneOutboxEvent.findUnique({
    where: { id: eventId },
    select: {
      status: true,
      availableAt: true,
      attemptCount: true,
      maxAttempts: true,
      claimedAt: true
    }
  });

  if (!event) {
    return null;
  }

  const isDuePending = event.status === "PENDING" && event.availableAt <= now;
  const isStaleProcessing =
    event.status === "PROCESSING" && (event.claimedAt === null || event.claimedAt <= staleBefore);

  if (!isDuePending && !isStaleProcessing) {
    return null;
  }

  const statusBoundary = isDuePending
    ? { status: "PENDING" as const, availableAt: { lte: now } }
    : { status: "PROCESSING" as const, claimedAt: event.claimedAt };

  if (event.attemptCount >= event.maxAttempts) {
    if (isStaleProcessing) {
      await client.controlPlaneOutboxEvent.updateMany({
        where: {
          id: eventId,
          ...statusBoundary,
          attemptCount: event.attemptCount
        },
        data: {
          status: "FAILED",
          claimedAt: null,
          lastError: "Control-plane dispatch claim expired after exhausting its attempt budget."
        }
      });
    }
    return null;
  }

  const claim = await client.controlPlaneOutboxEvent.updateMany({
    where: {
      id: eventId,
      ...statusBoundary,
      attemptCount: event.attemptCount
    },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      claimedAt: now,
      lastAttemptAt: now
    }
  });

  if (claim.count !== 1) {
    return null;
  }

  return client.controlPlaneOutboxEvent.findUnique({ where: { id: eventId } });
}

export async function markControlPlaneEventPublished(
  client: Pick<PrismaClient, "controlPlaneOutboxEvent">,
  eventId: string,
  publishedAt = new Date()
): Promise<boolean> {
  const result = await client.controlPlaneOutboxEvent.updateMany({
    where: {
      id: eventId,
      status: "PROCESSING"
    },
    data: {
      status: "PUBLISHED",
      publishedAt,
      claimedAt: null,
      lastError: null
    }
  });

  return result.count === 1;
}

export async function rescheduleControlPlaneEvent(
  client: Pick<PrismaClient, "controlPlaneOutboxEvent">,
  input: RescheduleControlPlaneEventInput
): Promise<"PENDING" | "FAILED" | null> {
  const event = await client.controlPlaneOutboxEvent.findUnique({
    where: { id: input.eventId },
    select: {
      status: true,
      attemptCount: true,
      maxAttempts: true
    }
  });

  if (!event || event.status !== "PROCESSING") {
    return null;
  }

  const status = event.attemptCount >= event.maxAttempts ? "FAILED" : "PENDING";
  const result = await client.controlPlaneOutboxEvent.updateMany({
    where: {
      id: input.eventId,
      status: "PROCESSING",
      attemptCount: event.attemptCount
    },
    data: {
      status,
      availableAt: input.availableAt,
      claimedAt: null,
      lastError: input.error.slice(0, 2_000)
    }
  });

  return result.count === 1 ? status : null;
}

/** Returns true only for the first successful receipt insert. */
export async function recordControlPlaneEventReceipt(
  client: Pick<PrismaClient, "controlPlaneEventReceipt">,
  input: {
    eventId: string;
    consumer: string;
    processedAt?: Date;
  }
): Promise<boolean> {
  const result = await client.controlPlaneEventReceipt.createMany({
    data: {
      eventId: input.eventId,
      consumer: input.consumer,
      processedAt: input.processedAt ?? new Date()
    },
    skipDuplicates: true
  });

  return result.count === 1;
}
