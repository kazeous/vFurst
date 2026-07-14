import Redis from "ioredis";

export type FixedWindowIncrement = {
  count: number;
  resetAt: number;
};

export interface FixedWindowCounter {
  increment(key: string, windowMs: number): Promise<FixedWindowIncrement>;
}

type RedisEvalClient = {
  status: string;
  connect(): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

export const FIXED_WINDOW_LUA = `
local count = redis.call("INCR", KEYS[1])
local window = tonumber(ARGV[1])

if count == 1 then
  redis.call("PEXPIRE", KEYS[1], window)
end

local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], window)
  ttl = window
end

local current = redis.call("TIME")
local now = (tonumber(current[1]) * 1000) + math.floor(tonumber(current[2]) / 1000)

return { count, now + ttl }
`;

export class RedisFixedWindowCounter implements FixedWindowCounter {
  constructor(private readonly client: RedisEvalClient) {}

  async increment(key: string, windowMs: number): Promise<FixedWindowIncrement> {
    if (this.client.status === "wait") {
      await this.client.connect();
    }

    const result = await this.client.eval(FIXED_WINDOW_LUA, 1, key, windowMs);

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("Redis returned an invalid fixed-window result.");
    }

    const count = Number(result[0]);
    const resetAt = Number(result[1]);

    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(resetAt) || resetAt < 1) {
      throw new Error("Redis returned an invalid fixed-window value.");
    }

    return { count, resetAt };
  }
}

const globalForRateLimit = globalThis as typeof globalThis & {
  vfurstRateLimitRedis?: Redis;
};

function createRateLimitRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for shared rate limiting.");
  }

  const client = new Redis(redisUrl, {
    commandTimeout: 1_500,
    connectTimeout: 1_500,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(attempt) {
      return attempt <= 1 ? 50 : null;
    }
  });

  // Command callers receive connection errors. This listener prevents ioredis
  // from also emitting an unhandled EventEmitter error while Redis is down.
  client.on("error", () => undefined);
  return client;
}

function getRateLimitRedisClient() {
  if (!globalForRateLimit.vfurstRateLimitRedis || globalForRateLimit.vfurstRateLimitRedis.status === "end") {
    globalForRateLimit.vfurstRateLimitRedis = createRateLimitRedisClient();
  }

  return globalForRateLimit.vfurstRateLimitRedis;
}

export async function incrementSharedFixedWindow(key: string, windowMs: number) {
  const counter = new RedisFixedWindowCounter(getRateLimitRedisClient());
  return counter.increment(key, windowMs);
}
