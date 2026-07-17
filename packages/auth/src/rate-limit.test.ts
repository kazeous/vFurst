import { describe, expect, it } from "vitest";
import {
  RateLimitUnavailableError,
  UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT,
  createFixedWindowRateLimiter,
  fixedWindowStorageKey,
  rateLimitResponseHeaders,
  trustedClientIpSubject,
  type FixedWindowCounter
} from "./rate-limit.js";

describe("shared authentication rate-limit primitives", () => {
  it("shares hashed storage keys without exposing the subject", () => {
    const key = fixedWindowStorageKey("vFurst auth", "manager credentials", "person@example.com|203.0.113.4");

    expect(key).toMatch(/^vfurst-auth:manager-credentials:[a-f0-9]{64}$/);
    expect(key).not.toContain("person@example.com");
    expect(key).not.toContain("203.0.113.4");
  });

  it("enforces the fixed window across counter users", async () => {
    let count = 0;
    const counter: FixedWindowCounter = {
      async increment() {
        count += 1;
        return { count, resetAt: 70_000 };
      }
    };
    const limit = createFixedWindowRateLimiter(counter, { prefix: "test" });
    const input = { namespace: "login", subject: "account|ip", limit: 2, windowMs: 60_000 };

    await expect(limit(input)).resolves.toMatchObject({ limited: false, remaining: 1 });
    await expect(limit(input)).resolves.toMatchObject({ limited: false, remaining: 0 });
    await expect(limit(input)).resolves.toMatchObject({ limited: true, remaining: 0 });
  });

  it("fails closed when shared storage is missing or malformed", async () => {
    const unavailable = createFixedWindowRateLimiter(
      { increment: async () => Promise.reject(new Error("redis unavailable")) },
      { prefix: "test" }
    );
    const malformed = createFixedWindowRateLimiter(
      { increment: async () => ({ count: 0, resetAt: 0 }) },
      { prefix: "test" }
    );
    const input = { namespace: "login", subject: "account|ip", limit: 2, windowMs: 60_000 };

    await expect(unavailable(input)).rejects.toBeInstanceOf(RateLimitUnavailableError);
    await expect(malformed(input)).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("ignores spoofable forwarding headers unless the ingress header is explicitly trusted", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.4, 10.0.0.1",
      "x-real-ip": "198.51.100.8"
    });

    expect(trustedClientIpSubject(headers)).toBe(UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT);
    expect(trustedClientIpSubject(headers, "x-forwarded-for")).toBe("203.0.113.4");
    expect(trustedClientIpSubject(headers, "x-real-ip")).toBe("198.51.100.8");
    expect(trustedClientIpSubject(new Headers({ "x-real-ip": "not-an-ip" }), "x-real-ip")).toBe(
      UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT
    );
  });

  it("returns standard limit and retry headers", () => {
    expect(rateLimitResponseHeaders({ limited: true, limit: 10, remaining: 0, resetAt: 65_000 }, 5_000)).toEqual({
      "Retry-After": "60",
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "65"
    });
  });
});
