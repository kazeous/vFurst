import { afterEach, beforeEach, expect, it, vi } from "vitest";

const init = vi.fn();

beforeEach(() => {
  vi.resetModules();
  init.mockReset();
  vi.doMock("@sentry/nextjs", () => ({ init }));
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  vi.stubEnv("SENTRY_DSN", "");
});

afterEach(() => vi.unstubAllEnvs());

it("does not initialize the server SDK without a DSN", async () => {
  await import("./sentry.server.config");
  expect(init).not.toHaveBeenCalled();
});

it("initializes with the DSN and the configured trace rate", async () => {
  vi.stubEnv("SENTRY_DSN", "https://public@example.invalid/1");
  vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", undefined);
  await import("./sentry.server.config");
  expect(init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    dsn: "https://public@example.invalid/1", enabled: true, tracesSampleRate: 0.1, sendDefaultPii: false
  }));
});
