import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("vendor helpers", () => {
  it("only opens vendor applications during registration-open or live events", async () => {
    const { assertVendorApplicationsOpen } = await import("@/server/vendors");

    expect(() => assertVendorApplicationsOpen({ status: "REGISTRATION_OPEN" })).not.toThrow();
    expect(() => assertVendorApplicationsOpen({ status: "LIVE" })).not.toThrow();
    expect(() => assertVendorApplicationsOpen({ status: "DRAFT" })).toThrow("Vendor applications are not open");
  });

  it("syncs approved unpaid applications to paid after order payment", async () => {
    const { markVendorApplicationsPaidForOrder } = await import("@/server/vendors");
    const tx = {
      vendorApplication: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    await markVendorApplicationsPaidForOrder(tx as never, "order_123");

    expect(tx.vendorApplication.updateMany).toHaveBeenCalledWith({
      where: {
        approvedOrderId: "order_123",
        status: "APPROVED_UNPAID"
      },
      data: {
        status: "APPROVED_PAID"
      }
    });
  });
});
