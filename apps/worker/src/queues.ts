import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import {
  EMAIL_DEAD_LETTER_JOB_OPTIONS,
  QUEUE_NAMES,
  STANDARD_QUEUE_JOB_OPTIONS,
  type ControlPlaneJobData
} from "@vfurst/contracts";
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

const defaultJobOptions: JobsOptions = STANDARD_QUEUE_JOB_OPTIONS;

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
  defaultJobOptions: EMAIL_DEAD_LETTER_JOB_OPTIONS
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

export const controlPlaneQueue = new Queue<ControlPlaneJobData>("control-plane", {
  connection,
  defaultJobOptions
});

export const allQueues = [
  emailQueue,
  emailDeadLetterQueue,
  badgeQueue,
  reconcileQueue,
  webhookQueue,
  controlPlaneQueue
];

export const queueNames = QUEUE_NAMES.filter((name) => name !== "email-dead-letter");

export { connection };
