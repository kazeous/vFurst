import Redis from "ioredis";
import type { FixedWindowCounter, FixedWindowIncrement } from "@vfurst/auth/rate-limit";

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

    return { count: Number(result[0]), resetAt: Number(result[1]) };
  }
}

const globalForManagerRateLimit = globalThis as typeof globalThis & {
  vfurstManagerRateLimitRedis?: Map<string, Redis>;
};

function getRedisClient(redisUrl: string) {
  const clients = (globalForManagerRateLimit.vfurstManagerRateLimitRedis ??= new Map());
  const cached = clients.get(redisUrl);
  if (cached && cached.status !== "end") return cached;

  const client = new Redis(redisUrl, {
    commandTimeout: 1_500,
    connectTimeout: 1_500,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(attempt) {
      return attempt <= 1 ? 50 : null;
    }
  });
  client.on("error", () => undefined);
  clients.set(redisUrl, client);
  return client;
}

export async function incrementManagerFixedWindow(
  redisUrl: string | undefined,
  key: string,
  windowMs: number
) {
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for platform-manager rate limiting.");
  }

  return new RedisFixedWindowCounter(getRedisClient(redisUrl)).increment(key, windowMs);
}
