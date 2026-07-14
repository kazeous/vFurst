import { describe, expect, it } from "vitest";
import { normalizeWebhookTarget } from "@/lib/webhook-target";

describe("normalizeWebhookTarget", () => {
  it("normalizes public HTTPS endpoints without sending fragments", () => {
    expect(normalizeWebhookTarget("https://Hooks.Example.com/vfurst?source=test#secret-fragment")).toBe(
      "https://hooks.example.com/vfurst?source=test"
    );
  });

  it.each([
    "http://hooks.example.com/vfurst",
    "https://user:password@hooks.example.com/vfurst",
    "https://localhost/vfurst",
    "https://service.internal/vfurst",
    "https://127.0.0.1/vfurst",
    "https://[::1]/vfurst",
    "https://2130706433/vfurst"
  ])("rejects non-public webhook target %s", (target) => {
    expect(() => normalizeWebhookTarget(target)).toThrow();
  });
});
