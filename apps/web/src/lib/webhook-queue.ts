import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

export const WEBHOOK_EVENT_TYPES = [
  "event.published",
  "registration.created",
  "registration.checked_in",
  "order.paid",
  "order.refunded",
  "hotel_booking.created",
  "volunteer_application.submitted",
  "vendor_application.submitted",
  "webhook.test"
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type SendWebhookJob = {
  orgId: string;
  endpointId?: string;
  type: WebhookEventType;
  eventId?: string;
  data: Record<string, unknown>;
};

function getConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null
  };
}

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5_000
  },
  removeOnComplete: 500,
  removeOnFail: false
};

export const webhookQueue = new Queue<SendWebhookJob>("webhook", {
  connection: getConnectionOptions(),
  defaultJobOptions
});
