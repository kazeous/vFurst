import { describe, expect, it } from "vitest";
import { checkInSearchQuerySchema, updateCheckInInputSchema } from "@/shared/schemas/check-in";

describe("Phase 7 check-in schemas", () => {
  it("defaults check-in search to standard mode", () => {
    const result = checkInSearchQuerySchema.parse({});

    expect(result.query).toBe("");
    expect(result.mode).toBe("standard");
  });

  it("accepts badge state and cashier note updates", () => {
    const result = updateCheckInInputSchema.parse({
      checkedIn: true,
      badgeStatus: "PRINT_READY",
      cashierNote: "Needs receipt"
    });

    expect(result.badgeStatus).toBe("PRINT_READY");
    expect(result.cashierNote).toBe("Needs receipt");
  });
});
