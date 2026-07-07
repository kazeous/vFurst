import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { EmailTemplateName } from "@vfurst/email";

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
  orgId: string;
  to: string;
  template: EmailTemplateName;
  data: Record<string, unknown>;
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

export type SendWebhookJob = {
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

export const badgeQueue = new Queue<GenerateBadgesJob>("badge", {
  connection,
  defaultJobOptions
});

export const reconcileQueue = new Queue<ReconcileFeesJob>("reconcile", {
  connection,
  defaultJobOptions
});

export const webhookQueue = new Queue<SendWebhookJob>("webhook", {
  connection,
  defaultJobOptions
});

export { connection };
