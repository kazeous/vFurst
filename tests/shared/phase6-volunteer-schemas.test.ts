import { describe, expect, it } from "vitest";
import { createVolunteerApplicationInputSchema, updateVolunteerApplicationInputSchema } from "@/shared/schemas/volunteer";

describe("Phase 6 volunteer schemas", () => {
  it("normalizes volunteer applicant email and defaults contact method", () => {
    const result = createVolunteerApplicationInputSchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "Volunteer@Example.COM",
      availability: "Friday evening and Saturday morning",
      departmentInterests: "Registration desk and line support"
    });

    expect(result.email).toBe("volunteer@example.com");
    expect(result.preferredContactMethod).toBe("EMAIL");
  });

  it("accepts assignment state updates only from the known volunteer states", () => {
    expect(updateVolunteerApplicationInputSchema.parse({ status: "ACCEPTED", assignmentState: "ASSIGNED" }).assignmentState).toBe(
      "ASSIGNED"
    );
    expect(() => updateVolunteerApplicationInputSchema.parse({ status: "ACCEPTED", assignmentState: "PAID" })).toThrow();
  });
});
