import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

export type SendEmailJob = {
  deliveryId: string;
};

function getConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

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

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5_000
  },
  removeOnComplete: 500,
  removeOnFail: false
};

const connection = getConnectionOptions();

export const emailQueue = new Queue<SendEmailJob>("email", {
  connection,
  defaultJobOptions
});

export function emailQueueJobId(deliveryId: string) {
  return `email-delivery-${deliveryId}`;
}

export async function enqueueEmailDelivery(deliveryId: string) {
  const jobId = emailQueueJobId(deliveryId);
  await emailQueue.add("send-email", { deliveryId }, { jobId });
  return jobId;
}
