import { describe, expect, it } from "vitest";
import { createProductInputSchema } from "@/shared/schemas/product";
import { publicRegistrationInputSchema } from "@/shared/schemas/registration";

describe("Phase 3 validation schemas", () => {
  it("accepts a minimal registration product", () => {
    const result = createProductInputSchema.parse({
      category: "REGISTRATION",
      name: "adult-pass",
      displayName: "Adult Pass",
      basePriceCents: 2500
    });

    expect(result.publicVisible).toBe(true);
    expect(result.images).toEqual([]);
  });

  it("normalizes public registration email", () => {
    const result = publicRegistrationInputSchema.parse({
      productId: "product_1",
      email: "Person@Example.COM",
      firstName: "Ada",
      lastName: "Lovelace",
      answers: []
    });

    expect(result.email).toBe("person@example.com");
  });
});
