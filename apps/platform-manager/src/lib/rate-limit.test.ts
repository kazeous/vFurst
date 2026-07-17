import { describe, expect, it } from "vitest";
import {
  RateLimitUnavailableError,
  UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT,
  fixedWindowStorageKey
} from "@vfurst/auth/rate-limit";
import {
  createManagerRateLimitGuard,
  managerRateLimitUnavailableResponse,
  managerRateLimitedResponse
} from "./rate-limit.js";

const baseConfig = {
  authorizeRateLimitPerMinute: 2,
  credentialAccountRateLimitPerMinute: 1,
  credentialIpRateLimitPerMinute: 5,
  exchangeRateLimitPerMinute: 3,
  rateLimitPrefix: "test:manager",
  revokeRateLimitPerMinute: 4,
  trustedClientIpHeader: undefined
} as const;

describe("platform-manager distributed rate limits", () => {
  it("uses a safe shared bucket unless an ingress header is explicitly trusted", async () => {
    const calls: Array<[string, number]> = [];
    const increment = async (key: string, windowMs: number) => {
      calls.push([key, windowMs]);
      return { count: 1, resetAt: Date.now() + 60_000 };
    };
    const request = new Request("https://manager.example/login", {
      headers: { "x-forwarded-for": "203.0.113.7" }
    });

    await createManagerRateLimitGuard({ increment }, baseConfig)(request, "credentialIp");

    expect(calls).toHaveLength(1);
    const key = calls[0]?.[0];
    expect(key).toBe(
      fixedWindowStorageKey(
        "test:manager",
        "auth:credentials:ip",
        UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT
      )
    );
  });

  it("uses independent client-IP and normalized-account credential buckets", async () => {
    const keys: string[] = [];
    const guard = createManagerRateLimitGuard(
      {
        async increment(key) {
          keys.push(key);
          return { count: 1, resetAt: Date.now() + 60_000 };
        }
      },
      { ...baseConfig, trustedClientIpHeader: "x-real-ip" }
    );
    const firstIp = new Request("https://manager.example/login", {
      headers: { "x-real-ip": "198.51.100.1" }
    });
    const secondIp = new Request("https://manager.example/login", {
      headers: { "x-real-ip": "198.51.100.2" }
    });

    await guard(firstIp, "credentialIp");
    await guard(firstIp, "credentialAccount", ["person@example.com"]);
    await guard(secondIp, "credentialAccount", ["person@example.com"]);

    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
  });

  it("uses the configured policy limits and blocks after the boundary", async () => {
    let count = 0;
    const guard = createManagerRateLimitGuard(
      { increment: async () => ({ count: ++count, resetAt: Date.now() + 60_000 }) },
      { ...baseConfig, trustedClientIpHeader: "x-real-ip" }
    );
    const request = new Request("https://manager.example/api/identity/authorize", {
      headers: { "x-real-ip": "198.51.100.2" }
    });

    await expect(guard(request, "authorize")).resolves.toMatchObject({ limited: false, limit: 2 });
    await expect(guard(request, "authorize")).resolves.toMatchObject({ limited: false, remaining: 0 });
    await expect(guard(request, "authorize")).resolves.toMatchObject({ limited: true, remaining: 0 });
  });

  it("fails closed when Redis is unavailable", async () => {
    const guard = createManagerRateLimitGuard(
      { increment: async () => Promise.reject(new Error("redis unavailable")) },
      baseConfig
    );

    await expect(guard(new Request("https://manager.example"), "exchange")).rejects.toBeInstanceOf(
      RateLimitUnavailableError
    );
  });

  it("returns non-cacheable 429 and 503 responses with retry guidance", async () => {
    const limited = managerRateLimitedResponse({
      limited: true,
      limit: 2,
      remaining: 0,
      resetAt: Date.now() + 30_000
    });
    const unavailable = managerRateLimitUnavailableResponse();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(limited.headers.get("cache-control")).toBe("no-store");
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "rate_limited" } });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("1");
  });
});
