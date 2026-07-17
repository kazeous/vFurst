import { describe, expect, it } from "vitest";
import { PLATFORM_MANAGER_RUNTIME, createPlatformManagerHealth } from "./health.js";

describe("platform-manager health identity", () => {
  it("identifies the non-tenant control-plane runtime deterministically", () => {
    const timestamp = new Date("2026-07-17T12:00:00.000Z");

    expect(PLATFORM_MANAGER_RUNTIME).toBe("platform-manager");
    expect(createPlatformManagerHealth(timestamp)).toEqual({
      status: "ok",
      runtime: "platform-manager",
      plane: "control",
      identityIssuer: "platform-manager",
      sessionCookieScope: "host-only",
      timestamp: "2026-07-17T12:00:00.000Z"
    });
  });

  it("returns an immutable health snapshot", () => {
    expect(Object.isFrozen(createPlatformManagerHealth())).toBe(true);
  });
});
