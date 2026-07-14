import { describe, expect, it, vi } from "vitest";
import { resolveWebhookTarget } from "./webhook-target.js";

describe("resolveWebhookTarget", () => {
  it("returns a pinned public address for an HTTPS DNS endpoint", async () => {
    const resolver = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const target = await resolveWebhookTarget("https://hooks.example.com/vfurst#fragment", resolver);

    expect(resolver).toHaveBeenCalledWith("hooks.example.com");
    expect(target.address).toBe("93.184.216.34");
    expect(target.hostname).toBe("hooks.example.com");
    expect(target.url.toString()).toBe("https://hooks.example.com/vfurst");
  });

  it.each([
    "10.0.0.2",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1"
  ])("rejects DNS answers in non-public ranges: %s", async (address) => {
    await expect(
      resolveWebhookTarget("https://hooks.example.com/vfurst", async () => [
        { address, family: address.includes(":") ? 6 : 4 }
      ])
    ).rejects.toThrow("public IP");
  });

  it("rejects a mixed public/private DNS answer to prevent fallback into the private network", async () => {
    await expect(
      resolveWebhookTarget("https://hooks.example.com/vfurst", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 }
      ])
    ).rejects.toThrow("public IP");
  });
});
