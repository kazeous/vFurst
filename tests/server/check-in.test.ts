import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("check-in helpers", () => {
  it("treats paid-like order statuses as paid for check-in display", async () => {
    const { isOrderStatusPaid } = await import("@/server/check-in");

    expect(isOrderStatusPaid("PAID")).toBe(true);
    expect(isOrderStatusPaid("PARTIALLY_REFUNDED")).toBe(true);
    expect(isOrderStatusPaid("UNPAID")).toBe(false);
  });

  it("detects registration check-in state from checkedInAt", async () => {
    const { isRegistrationCheckedIn } = await import("@/server/check-in");

    expect(isRegistrationCheckedIn({ checkedInAt: new Date() })).toBe(true);
    expect(isRegistrationCheckedIn({ checkedInAt: null })).toBe(false);
  });
});
