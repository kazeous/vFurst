import { prisma, type OrderItemType, type Prisma } from "@vfurst/db";

export type FeeLine = {
  label: string;
  expected: number;
  collected: number;
  units: number;
  basis: string;
};

export type FeeHistoryEntry = {
  orderId: string;
  eventName: string;
  collectedAt: string;
  gross: number;
  platformFee: number;
  source: string;
};

export type FeeDiscrepancy = {
  severity: "info" | "warning";
  message: string;
};

export type OrganizationFeeReport = {
  orgId: string;
  generatedAt: string;
  attendeeCount: number;
  hotelBookingCount: number;
  storeVendorRevenue: number;
  expectedTotal: number;
  collectedTotal: number;
  lines: FeeLine[];
  history: FeeHistoryEntry[];
  discrepancies: FeeDiscrepancy[];
};

const ATTENDEE_FEE_CENTS = 100;
const HOTEL_BOOKING_FEE_CENTS = 100;
const TRANSACTION_FEE_RATE = 0.01;

function cents(value: number) {
  return Math.max(0, Math.round(value));
}

function itemSource(itemTypes: OrderItemType[]) {
  if (itemTypes.includes("VENDOR")) {
    return "Vendor";
  }

  if (itemTypes.includes("PRODUCT")) {
    return "Store";
  }

  if (itemTypes.includes("HOTEL")) {
    return "Hotel";
  }

  if (itemTypes.includes("REGISTRATION")) {
    return "Registration";
  }

  return "Mixed";
}

function itemRevenue(items: Array<{ itemType: OrderItemType; unitPrice: number; quantity: number }>, types: OrderItemType[]) {
  return items
    .filter((item) => types.includes(item.itemType))
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export async function getOrganizationFeeReport(orgId: string): Promise<OrganizationFeeReport> {
  const [attendeeCount, hotelBookingCount, paidOrders, compedRegistrations] = await Promise.all([
    prisma.registration.count({
      where: {
        orgId,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"]
        }
      }
    }),
    prisma.hotelBooking.count({
      where: {
        orgId,
        confirmationCode: {
          not: "PENDING"
        }
      }
    }),
    prisma.order.findMany({
      where: {
        orgId,
        status: "PAID"
      },
      include: {
        event: true,
        items: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.registration.count({
      where: {
        orgId,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"]
        },
        orderItems: {
          none: {
            order: {
              status: "PAID",
              platformFee: {
                gt: 0
              }
            }
          }
        }
      }
    })
  ]);

  const storeVendorRevenue = paidOrders.reduce((sum, order) => sum + itemRevenue(order.items, ["PRODUCT", "VENDOR"]), 0);
  const attendeeExpected = attendeeCount * ATTENDEE_FEE_CENTS;
  const hotelExpected = hotelBookingCount * HOTEL_BOOKING_FEE_CENTS;
  const transactionExpected = cents(storeVendorRevenue * TRANSACTION_FEE_RATE);
  const expectedTotal = attendeeExpected + hotelExpected + transactionExpected;
  const collectedTotal = paidOrders.reduce((sum, order) => sum + order.platformFee, 0);

  const attendeeCollected = paidOrders.reduce((sum, order) => {
    const hasRegistration = order.items.some((item) => item.itemType === "REGISTRATION");
    return sum + (hasRegistration ? Math.min(order.platformFee, ATTENDEE_FEE_CENTS) : 0);
  }, 0);
  const hotelCollected = paidOrders.reduce((sum, order) => {
    const hasHotel = order.items.some((item) => item.itemType === "HOTEL");
    return sum + (hasHotel ? Math.min(order.platformFee, HOTEL_BOOKING_FEE_CENTS) : 0);
  }, 0);
  const transactionCollected = Math.max(0, collectedTotal - attendeeCollected - hotelCollected);

  const discrepancies: FeeDiscrepancy[] = [];
  const gap = expectedTotal - collectedTotal;

  if (gap !== 0) {
    discrepancies.push({
      severity: "warning",
      message: `${gap > 0 ? "Under-collected" : "Over-collected"} by ${Math.abs(gap)} cents compared with current usage.`
    });
  }

  if (compedRegistrations > 0) {
    discrepancies.push({
      severity: "info",
      message: `${compedRegistrations} confirmed attendee record(s) do not have a paid order with a collected attendee fee.`
    });
  }

  return {
    orgId,
    generatedAt: new Date().toISOString(),
    attendeeCount,
    hotelBookingCount,
    storeVendorRevenue,
    expectedTotal,
    collectedTotal,
    lines: [
      {
        label: "Attendee fees",
        expected: attendeeExpected,
        collected: attendeeCollected,
        units: attendeeCount,
        basis: "$1.00 per confirmed or checked-in attendee"
      },
      {
        label: "Hotel booking fees",
        expected: hotelExpected,
        collected: hotelCollected,
        units: hotelBookingCount,
        basis: "$1.00 per confirmed hotel booking"
      },
      {
        label: "Store and vendor transaction fees",
        expected: transactionExpected,
        collected: transactionCollected,
        units: storeVendorRevenue,
        basis: "1% of paid store and vendor revenue"
      }
    ],
    history: paidOrders.map((order) => ({
      orderId: order.id,
      eventName: order.event.name,
      collectedAt: order.updatedAt.toISOString(),
      gross: order.total,
      platformFee: order.platformFee,
      source: itemSource(order.items.map((item) => item.itemType))
    })),
    discrepancies
  };
}

export function feeReportToJson(report: OrganizationFeeReport): Prisma.InputJsonValue {
  return report as unknown as Prisma.InputJsonValue;
}
