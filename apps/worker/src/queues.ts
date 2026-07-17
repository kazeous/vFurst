import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { workerEnv } from "./env.js";

function getConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(workerEnv.REDIS_URL);

  return {
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : undefined,
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}

const connection = getConnectionOptions();

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5_000
  },
  removeOnComplete: 500,
  removeOnFail: false
};

export type SendEmailJob = {
  deliveryId: string;
};

export type EmailDeadLetterJob = {
  deliveryId: string;
  failedAt: string;
  errorCode: string;
};

export type GenerateBadgesJob = {
  orgId: string;
  eventId: string;
  templateId: string;
  badgeIds?: string[];
};

export type ReconcileFeesJob = {
  orgId?: string;
};

export type ReconciliationJob = ReconcileFeesJob | Record<string, never>;

export type SendWebhookJob = {
  deliveryId?: string;
  createdAt?: string;
  orgId: string;
  endpointId?: string;
  type: string;
  eventId?: string;
  data: Record<string, unknown>;
};

export const emailQueue = new Queue<SendEmailJob>("email", {
  connection,
  defaultJobOptions
});

export const emailDeadLetterQueue = new Queue<EmailDeadLetterJob>("email-dead-letter", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false
  }
});

export const badgeQueue = new Queue<GenerateBadgesJob>("badge", {
  connection,
  defaultJobOptions
});

export const reconcileQueue = new Queue<ReconciliationJob>("reconcile", {
  connection,
  defaultJobOptions
});

export const webhookQueue = new Queue<SendWebhookJob>("webhook", {
  connection,
  defaultJobOptions
});

export const allQueues = [emailQueue, emailDeadLetterQueue, badgeQueue, reconcileQueue, webhookQueue];

export { connection };
