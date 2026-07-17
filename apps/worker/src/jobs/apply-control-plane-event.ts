import {
  controlPlaneEventSchema,
  controlPlaneJobDataSchema,
  type ControlPlaneEvent,
  type ControlPlaneJobData
} from "@vfurst/contracts";
import { prisma, recordControlPlaneEventReceipt } from "@vfurst/db";
import type { Job } from "bullmq";

export const CONTROL_PLANE_CONSUMER = "tenant-runtime-cache-v1";
export const DEFAULT_CONTROL_PLANE_INVALIDATION_CHANNEL = "vfurst:control-plane:invalidations";

export const CONTROL_PLANE_VERSION_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local proposed = tonumber(ARGV[1])

if proposed > current then
  redis.call("SET", KEYS[1], ARGV[1])
  return 1
end

return 0
`;

export interface ControlPlaneConsumerRepository {
  loadPayload(eventId: string): Promise<unknown | null>;
  hasReceipt(eventId: string, consumer: string): Promise<boolean>;
  recordReceipt(eventId: string, consumer: string, processedAt: Date): Promise<boolean>;
}

export interface ControlPlaneVersionStore {
  advanceVersion(key: string, aggregateVersion: number): Promise<boolean>;
  publishInvalidation?(event: ControlPlaneEvent): Promise<void>;
}

type RedisControlPlaneClient = {
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
};

export const prismaControlPlaneConsumerRepository: ControlPlaneConsumerRepository = {
  async loadPayload(eventId) {
    const event = await prisma.controlPlaneOutboxEvent.findUnique({
      where: { id: eventId },
      select: { payload: true }
    });
    return event?.payload ?? null;
  },
  async hasReceipt(eventId, consumer) {
    const receipt = await prisma.controlPlaneEventReceipt.findUnique({
      where: {
        eventId_consumer: { eventId, consumer }
      },
      select: { id: true }
    });
    return receipt !== null;
  },
  recordReceipt(eventId, consumer, processedAt) {
    return recordControlPlaneEventReceipt(prisma, { eventId, consumer, processedAt });
  }
};

export function controlPlaneVersionKey(event: Pick<ControlPlaneEvent, "aggregateType" | "aggregateId">) {
  return `vfurst:control-plane:version:${event.aggregateType}:${event.aggregateId}`;
}

export function createRedisControlPlaneVersionStore(
  redis: RedisControlPlaneClient,
  invalidationChannel = DEFAULT_CONTROL_PLANE_INVALIDATION_CHANNEL
): ControlPlaneVersionStore {
  const channel = invalidationChannel.trim() || DEFAULT_CONTROL_PLANE_INVALIDATION_CHANNEL;

  return {
    async advanceVersion(key, aggregateVersion) {
      const result = await redis.eval(CONTROL_PLANE_VERSION_LUA, 1, key, aggregateVersion);
      return Number(result) === 1;
    },
    async publishInvalidation(event: ControlPlaneEvent) {
      await redis.publish(
        channel,
        JSON.stringify({
          eventId: event.id,
          type: event.type,
          organizationId: "organizationId" in event ? event.organizationId : null,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion
        })
      );
    }
  };
}

export function createControlPlaneEventProcessor(input: {
  repository: ControlPlaneConsumerRepository;
  versionStore: ControlPlaneVersionStore;
  consumer?: string;
  now?: () => Date;
}) {
  const consumer = input.consumer ?? CONTROL_PLANE_CONSUMER;
  const now = input.now ?? (() => new Date());

  return async function processControlPlaneEvent(job: Pick<Job<ControlPlaneJobData>, "data">) {
    const pointer = controlPlaneJobDataSchema.parse(job.data);
    const payload = await input.repository.loadPayload(pointer.eventId);
    if (payload === null) {
      throw new Error(`Control-plane event ${pointer.eventId} does not exist.`);
    }

    const event = controlPlaneEventSchema.parse(payload);
    if (event.id !== pointer.eventId) {
      throw new Error("Control-plane queue pointer does not match the durable event envelope.");
    }

    // Validate every replay before trusting an existing receipt. This prevents a
    // corrupted canonical row from being silently accepted.
    if (await input.repository.hasReceipt(pointer.eventId, consumer)) {
      return {
        eventId: pointer.eventId,
        applied: false,
        duplicate: true,
        receiptRecorded: false
      };
    }

    const applied = await input.versionStore.advanceVersion(
      controlPlaneVersionKey(event),
      event.aggregateVersion
    );

    // Publish every unreceipted delivery. If SET succeeds but publish fails, the
    // retry observes an equal version yet still republishes before recording its
    // receipt, preserving at-least-once invalidation delivery.
    if (input.versionStore.publishInvalidation) {
      await input.versionStore.publishInvalidation(event);
    }

    const receiptRecorded = await input.repository.recordReceipt(pointer.eventId, consumer, now());

    return {
      eventId: pointer.eventId,
      applied,
      duplicate: !receiptRecorded,
      receiptRecorded
    };
  };
}
