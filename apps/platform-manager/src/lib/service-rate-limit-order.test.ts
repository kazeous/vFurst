import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyManagerRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  requireIdentityProtocolEnv: () => ({
    authClientId: "tenant-web",
    identityServiceSecret: "service-secret-at-least-32-bytes-long"
  })
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
  applyManagerRateLimit,
  managerRateLimitUnavailableResponse: () => NextResponse.json({}, { status: 503 }),
  managerRateLimitedResponse: () => NextResponse.json({}, { status: 429 })
}));

import { POST as exchange } from "../app/api/identity/exchange/route.js";
import { POST as revoke } from "../app/api/identity/revoke/route.js";

describe("identity service rate-limit ordering", () => {
  beforeEach(() => applyManagerRateLimit.mockReset());

  it.each([
    ["exchange", exchange],
    ["revoke", revoke]
  ])("rejects unauthenticated %s traffic before it can consume the trusted-service bucket", async (_name, handler) => {
    const response = await handler(
      new NextRequest(`https://manager.example/api/identity/${_name}`, {
        method: "POST",
        headers: { authorization: "Bearer invalid-service-secret" },
        body: "{}"
      })
    );

    expect(response.status).toBe(401);
    expect(applyManagerRateLimit).not.toHaveBeenCalled();
  });
});
