import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("product availability helpers", () => {
  it("treats visible, unarchived products inside the availability window as active", async () => {
    const { isProductActive } = await import("@/server/products");

    expect(
      isProductActive({
        publicVisible: true,
        archivedAt: null,
        availableFrom: new Date("2026-01-01T00:00:00.000Z"),
        availableUntil: new Date("2026-12-31T00:00:00.000Z")
      })
    ).toBe(true);
  });

  it("hides archived products", async () => {
    const { isProductActive } = await import("@/server/products");

    expect(
      isProductActive({
        publicVisible: true,
        archivedAt: new Date(),
        availableFrom: null,
        availableUntil: null
      })
    ).toBe(false);
  });

  it("calculates age before and after the birthday in the current year", async () => {
    const { calculateAge } = await import("@/server/products");

    expect(calculateAge(new Date("2000-06-01T00:00:00.000Z"), new Date("2026-05-31T00:00:00.000Z"))).toBe(25);
    expect(calculateAge(new Date("2000-06-01T00:00:00.000Z"), new Date("2026-06-01T00:00:00.000Z"))).toBe(26);
  });
});
