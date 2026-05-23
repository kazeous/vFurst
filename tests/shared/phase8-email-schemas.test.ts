import { describe, expect, it } from "vitest";
import { upsertEmailTemplateSchema } from "@/shared/schemas/email";

describe("Phase 8 email template schemas", () => {
  it("accepts a server-managed template override payload", () => {
    const result = upsertEmailTemplateSchema.safeParse({
      key: "EVENT_INVITE",
      name: "Event team invite",
      subject: "Join {{ event.name }}",
      bodyText: "Accept: {{ invite.url }}",
      enabled: true,
      nonCritical: false
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown template keys", () => {
    const result = upsertEmailTemplateSchema.safeParse({
      key: "PASSWORD_RESET",
      name: "Password reset",
      subject: "Reset",
      bodyText: "Reset link",
      enabled: true,
      nonCritical: false
    });

    expect(result.success).toBe(false);
  });
});

