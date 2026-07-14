import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { createFixedWindowRateLimiter, rateLimitStorageKey } from "../../apps/web/src/lib/rate-limit";
import { RedisFixedWindowCounter } from "../../apps/web/src/lib/redis-rate-limit";

test("shares one atomic quota across independent Redis clients and expires it", async () => {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const clientA = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  const clientB = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  const prefix = `vfurst:e2e:shared-rate:${Date.now()}:${process.pid}`;
  const namespace = "multi-instance";
  const subject = "organizer@example.com";
  const storageKey = rateLimitStorageKey(namespace, subject, prefix);
  const windowMs = 500;
  const limit = 10;
  const limiterA = createFixedWindowRateLimiter(new RedisFixedWindowCounter(clientA), { prefix });
  const limiterB = createFixedWindowRateLimiter(new RedisFixedWindowCounter(clientB), { prefix });

  try {
    await clientA.del(storageKey);

    const results = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        (index % 2 === 0 ? limiterA : limiterB)({
          namespace,
          key: subject,
          limit,
          windowMs
        })
      )
    );

    expect(results.filter((result) => !result.limited)).toHaveLength(limit);
    expect(results.filter((result) => result.limited)).toHaveLength(24 - limit);
    expect(await clientA.exists(storageKey)).toBe(1);
    expect(storageKey).not.toContain(subject);

    const ttl = await clientB.pttl(storageKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(windowMs);

    await expect
      .poll(() => clientA.exists(storageKey), { timeout: windowMs + 2_000 })
      .toBe(0);

    const afterExpiry = await limiterB({ namespace, key: subject, limit, windowMs });
    expect(afterExpiry).toMatchObject({ limited: false, remaining: limit - 1 });
  } finally {
    await clientA.del(storageKey).catch(() => undefined);
    clientA.disconnect();
    clientB.disconnect();
  }
});
