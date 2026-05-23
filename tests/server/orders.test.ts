import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("order helpers", () => {
  it("sums line item totals from quantity and unit price", async () => {
    const { sumOrderItems } = await import("@/server/orders");

    expect(
      sumOrderItems([
        { quantity: 2, unitPriceCents: 1500 },
        { quantity: 1, unitPriceCents: 700 }
      ])
    ).toBe(3700);
  });
});
