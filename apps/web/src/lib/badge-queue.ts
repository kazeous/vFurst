import { Queue, type ConnectionOptions } from "bullmq";

export type GenerateBadgesJob = {
  orgId: string;
  eventId: string;
  templateId: string;
  badgeIds?: string[];
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

export const badgeQueue = new Queue<GenerateBadgesJob>("badge", {
  connection: getConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000
    },
    removeOnComplete: 250,
    removeOnFail: false
  }
});
