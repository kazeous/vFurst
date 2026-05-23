import { describe, expect, it } from "vitest";
import { createEventInputSchema } from "@/shared/schemas/event";
import { createOrganizationInputSchema, createOrganizationInviteInputSchema } from "@/shared/schemas/organization";

describe("Phase 2 validation schemas", () => {
  it("accepts organization names and normalized slugs", () => {
    const result = createOrganizationInputSchema.safeParse({
      name: "Example Org",
      slug: "example-org"
    });

    expect(result.success).toBe(true);
  });

  it("rejects owner invites from public input", () => {
    const result = createOrganizationInviteInputSchema.safeParse({
      email: "person@example.com",
      role: "OWNER"
    });

    expect(result.success).toBe(false);
  });

  it("defaults event timezone for minimal event creation", () => {
    const result = createEventInputSchema.parse({
      name: "Example Event"
    });

    expect(result.timezone).toBe("UTC");
  });
});
