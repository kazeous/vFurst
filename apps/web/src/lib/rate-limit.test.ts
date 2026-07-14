import { describe, expect, it, vi } from "vitest";
import {
  RATE_LIMIT_FAILURE_MODES,
  RateLimitUnavailableError,
  createFixedWindowRateLimiter,
  rateLimitStorageKey,
  type RateLimitOptions
} from "./rate-limit";
import type { FixedWindowCounter } from "./redis-rate-limit";

class SharedCounter implements FixedWindowCounter {
  readonly counts = new Map<string, number>();

  async increment(key: string, windowMs: number) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, resetAt: Date.now() + windowMs };
  }
}

const request: RateLimitOptions = {
  namespace: "auth",
  key: "person@example.com",
  limit: 2,
  windowMs: 60_000
};

describe("shared fixed-window rate limiting", () => {
  it("shares one quota across independent limiter instances", async () => {
    const counter = new SharedCounter();
    const firstInstance = createFixedWindowRateLimiter(counter, { prefix: "test" });
    const secondInstance = createFixedWindowRateLimiter(counter, { prefix: "test" });

    expect((await firstInstance(request)).limited).toBe(false);
    expect((await secondInstance(request)).limited).toBe(false);
    expect((await firstInstance(request)).limited).toBe(true);
  });

  it("hashes subjects before constructing a storage key", () => {
    const storageKey = rateLimitStorageKey("payment:registration", request.key, "vFurst rate limit");

    expect(storageKey).toMatch(/^vfurst-rate-limit:payment:registration:[a-f0-9]{64}$/);
    expect(storageKey).not.toContain(request.key);
  });

  it("fails closed for auth, payment, and API traffic", async () => {
    const onFailure = vi.fn();
    const limiter = createFixedWindowRateLimiter(
      {
        async increment() {
          throw new Error("redis unavailable");
        }
      },
      { onFailure }
    );

    await expect(limiter({ ...request, failureMode: RATE_LIMIT_FAILURE_MODES.auth })).rejects.toBeInstanceOf(
      RateLimitUnavailableError
    );
    expect(onFailure).toHaveBeenCalledOnce();
    expect(RATE_LIMIT_FAILURE_MODES.payment).toBe("closed");
    expect(RATE_LIMIT_FAILURE_MODES.api).toBe("closed");
  });

  it("fails open only for signed-provider callback availability", async () => {
    const limiter = createFixedWindowRateLimiter({
      async increment() {
        throw new Error("redis unavailable");
      }
    });

    await expect(limiter({ ...request, failureMode: RATE_LIMIT_FAILURE_MODES.webhook })).resolves.toEqual(
      expect.objectContaining({ limited: false, degraded: true, remaining: request.limit })
    );
    expect(RATE_LIMIT_FAILURE_MODES.webhook).toBe("open");
  });
});
