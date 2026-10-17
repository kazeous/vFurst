import { describe, expect, it } from "vitest";
import { isPortalTokenPage } from "./portal-token-telemetry";

const base = "https://portal.example.invalid/login";

describe("portal token telemetry exclusion", () => {
  it.each([
    "/set-password?token=fake",
    "/test-org/set-password?token=fake",
    "/set-password/",
    "/test-org/set-password/",
    "/set%2dpassword?token=fake",
    "https://portal.example.invalid/set-password?token=fake",
    "/set-password?returnTo=%2Flogin",
    "/set-password%"
  ])("excludes %s", (href) => {
    expect(isPortalTokenPage(href, base)).toBe(true);
  });

  it.each(["/login", "/test-org/signup", "/account", "/set-password-help", "/test-org/events/set-password"])(
    "preserves instrumentation on %s", (href) => {
      expect(isPortalTokenPage(href, base)).toBe(false);
    }
  );
});
