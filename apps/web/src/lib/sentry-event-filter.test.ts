import { describe, expect, it } from "vitest";
import {
  filterExpectedNextHttpAccessFallback,
  isExpectedNextHttpAccessFallback
} from "./sentry-event-filter";

describe("isExpectedNextHttpAccessFallback", () => {
  it.each([401, 403, 404])("recognizes the expected Next.js %s access interrupt", (status) => {
    const error = Object.assign(new Error(`NEXT_HTTP_ERROR_FALLBACK;${status}`), {
      digest: `NEXT_HTTP_ERROR_FALLBACK;${status}`
    });

    expect(isExpectedNextHttpAccessFallback(error)).toBe(true);
  });

  it("does not suppress a real error that only has a matching message", () => {
    expect(isExpectedNextHttpAccessFallback(new Error("NEXT_HTTP_ERROR_FALLBACK;403"))).toBe(false);
  });

  it.each([
    null,
    "NEXT_HTTP_ERROR_FALLBACK;403",
    { digest: 403 },
    { digest: "NEXT_HTTP_ERROR_FALLBACK;500" },
    { digest: "NEXT_HTTP_ERROR_FALLBACK;403;unexpected" },
    { digest: "SOME_OTHER_ERROR;403" }
  ])("keeps unrelated or malformed values reportable", (error) => {
    expect(isExpectedNextHttpAccessFallback(error)).toBe(false);
  });

  it("drops expected access interrupts and preserves other events", () => {
    const sentryEvent = { event_id: "event-1" };
    const forbidden = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;403"
    });

    expect(filterExpectedNextHttpAccessFallback(sentryEvent, { originalException: forbidden })).toBeNull();
    expect(
      filterExpectedNextHttpAccessFallback(sentryEvent, {
        originalException: new Error("Database unavailable")
      })
    ).toBe(sentryEvent);
  });
});
