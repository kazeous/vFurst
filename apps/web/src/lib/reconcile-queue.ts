import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

export type ReconcileFeesJob = {
  orgId?: string;
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

export const reconcileQueue = new Queue<ReconcileFeesJob>("reconcile", {
  connection: getConnectionOptions(),
  defaultJobOptions
});
