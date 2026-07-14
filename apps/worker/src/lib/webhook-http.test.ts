import { describe, expect, it, vi } from "vitest";
import type { request } from "node:https";
import { postWebhook } from "./webhook-http.js";

function requestHarness(statusCode: number) {
  const response = {
    statusCode,
    resume: vi.fn()
  };
  const requestHandle = {
    destroy: vi.fn(),
    end: vi.fn(),
    once: vi.fn(),
    setTimeout: vi.fn()
  };
  const requestSpy = vi.fn((_options: unknown, callback: (value: typeof response) => void) => {
    callback(response);
    return requestHandle;
  });

  return {
    requestHandle,
    requestImpl: requestSpy as unknown as typeof request,
    requestSpy,
    response
  };
}

const target = {
  address: "93.184.216.34",
  hostname: "hooks.example.com",
  url: new URL("https://hooks.example.com:8443/vfurst?source=test")
};

describe("postWebhook", () => {
  it("pins the public DNS answer while preserving TLS SNI and the HTTP Host header", async () => {
    const harness = requestHarness(204);
    const result = await postWebhook(target, { "content-type": "application/json" }, '{"ok":true}', harness.requestImpl);

    expect(result).toEqual({ ok: true, status: 204 });
    expect(harness.requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: target.address,
        port: "8443",
        path: "/vfurst?source=test",
        servername: target.hostname,
        rejectUnauthorized: true,
        headers: expect.objectContaining({
          host: "hooks.example.com:8443",
          "content-length": "11"
        })
      }),
      expect.any(Function)
    );
    expect(harness.requestHandle.setTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(harness.requestHandle.end).toHaveBeenCalledWith('{"ok":true}');
    expect(harness.response.resume).toHaveBeenCalledOnce();
  });

  it("returns redirects as failures instead of following them", async () => {
    const harness = requestHarness(302);

    await expect(postWebhook(target, {}, "{}", harness.requestImpl)).resolves.toEqual({ ok: false, status: 302 });
    expect(harness.requestSpy).toHaveBeenCalledOnce();
  });
});
