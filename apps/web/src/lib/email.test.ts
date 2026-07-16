import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlatformEmailConfig } from "./email";

describe("platform email configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the documented SMTP_PASSWORD variable for authenticated SMTP", () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mailer@example.test");
    vi.stubEnv("SMTP_PASSWORD", "documented-secret");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("SMTP_FROM_EMAIL", "no-reply@example.test");

    expect(getPlatformEmailConfig()).toEqual({
      type: "SMTP",
      host: "smtp.example.test",
      port: 587,
      secure: true,
      auth: { user: "mailer@example.test", pass: "documented-secret" },
      fromEmail: "no-reply@example.test"
    });
  });

  it("keeps compatibility with the legacy SMTP_PASS name", () => {
    vi.stubEnv("SMTP_USER", "mailer@example.test");
    vi.stubEnv("SMTP_PASSWORD", "");
    vi.stubEnv("SMTP_PASS", "legacy-secret");

    expect(getPlatformEmailConfig()).toEqual(
      expect.objectContaining({
        auth: { user: "mailer@example.test", pass: "legacy-secret" }
      })
    );
  });
});
