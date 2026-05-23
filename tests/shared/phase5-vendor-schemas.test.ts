import { describe, expect, it } from "vitest";
import { createVendorApplicationInputSchema, updateVendorApplicationStatusInputSchema } from "@/shared/schemas/vendor";

describe("Phase 5 vendor schemas", () => {
  it("accepts a signed-in vendor application payload", () => {
    const result = createVendorApplicationInputSchema.parse({
      businessName: "Bright Forge Goods",
      contactName: "Morgan Lee",
      contactEmail: "Morgan@Example.COM",
      description: "Handmade convention accessories and display items.",
      productsServices: "Pins, lanyards, tabletop display accessories.",
      amenities: [{ name: "Electricity" }],
      assistants: [{ name: "Riley", email: "riley@example.com" }],
      seatingPreferences: ["Near similar craft vendors"]
    });

    expect(result.contactEmail).toBe("Morgan@Example.COM");
    expect(result.amenities).toHaveLength(1);
    expect(result.assistants).toHaveLength(1);
  });

  it("does not let review requests directly mark vendor applications paid", () => {
    expect(() => updateVendorApplicationStatusInputSchema.parse({ status: "APPROVED_PAID" })).toThrow();
    expect(updateVendorApplicationStatusInputSchema.parse({ status: "APPROVED_UNPAID" }).status).toBe("APPROVED_UNPAID");
  });
});
