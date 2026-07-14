import { getSePaySettings } from "@/lib/payments/platform";
import { formatCurrency } from "@/lib/registration/pricing";
import {
  calculateFeeSummariesByCurrency,
  createFeePolicy,
  prisma,
  type CurrencyCode,
  type CurrencyFeeSummary,
  type OrderItemType,
  type Prisma
} from "@vfurst/db";

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

export type CurrencyFeeReport = CurrencyFeeSummary & {
  lines: FeeLine[];
  history: FeeHistoryEntry[];
  discrepancies: FeeDiscrepancy[];
};

export type OrganizationFeeReport = {
  orgId: string;
  eventId?: string;
  generatedAt: string;
  currencies: CurrencyFeeReport[];
  currencyMismatchCount: number;
};

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

function feeBasis(currency: CurrencyCode, amount: number, noun: string) {
  return `${formatCurrency(amount, currency)} per ${noun}`;
}

export async function getOrganizationFeeReport(
  orgId: string,
  options: { eventId?: string } = {}
): Promise<OrganizationFeeReport> {
  const eventScope = options.eventId ? { id: options.eventId, orgId } : { orgId };
  const [events, registrations, hotelBookings, paidOrders, sepaySettings] = await Promise.all([
    prisma.event.findMany({
      where: eventScope,
      select: {
        currency: true
      }
    }),
    prisma.registration.findMany({
      where: {
        orgId,
        eventId: options.eventId,
        event: eventScope,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"]
        }
      },
      select: {
        event: {
          select: {
            currency: true
          }
        },
        orderItems: {
          where: {
            orgId,
            order: {
              orgId,
              eventId: options.eventId,
              status: "PAID",
              platformFee: {
                gt: 0
              }
            }
          },
          select: {
            order: {
              select: {
                currency: true
              }
            }
          }
        }
      }
    }),
    prisma.hotelBooking.findMany({
      where: {
        orgId,
        confirmationCode: {
          not: "PENDING"
        },
        block: {
          orgId,
          eventId: options.eventId,
          event: eventScope
        }
      },
      select: {
        block: {
          select: {
            event: {
              select: {
                currency: true
              }
            }
          }
        }
      }
    }),
    prisma.order.findMany({
      where: {
        orgId,
        eventId: options.eventId,
        event: eventScope,
        status: "PAID"
      },
      select: {
        id: true,
        currency: true,
        total: true,
        platformFee: true,
        updatedAt: true,
        event: {
          select: {
            name: true,
            currency: true
          }
        },
        items: {
          where: {
            orgId
          },
          select: {
            itemType: true,
            unitPrice: true,
            quantity: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    getSePaySettings()
  ]);

  const policies = createFeePolicy(sepaySettings);
  const summaries = calculateFeeSummariesByCurrency({
    policies,
    includeCurrencies: events.map((event) => event.currency),
    registrations: registrations.map((registration) => ({
      currency: registration.event.currency,
      hasCollectedAttendeeFee: registration.orderItems.some(
        (item) => item.order.currency === registration.event.currency
      )
    })),
    hotelBookings: hotelBookings.map((booking) => ({
      currency: booking.block.event.currency
    })),
    paidOrders
  });

  return {
    orgId,
    eventId: options.eventId,
    generatedAt: new Date().toISOString(),
    currencyMismatchCount: paidOrders.filter((order) => order.currency !== order.event.currency).length,
    currencies: summaries.map((summary) => {
      const policy = policies[summary.currency];
      const discrepancies: FeeDiscrepancy[] = [];

      if (summary.discrepancy !== 0) {
        discrepancies.push({
          severity: "warning",
          message: `${summary.discrepancy > 0 ? "Under-collected" : "Over-collected"} by ${formatCurrency(
            Math.abs(summary.discrepancy),
            summary.currency
          )} compared with current usage.`
        });
      }

      if (summary.compedRegistrationCount > 0) {
        discrepancies.push({
          severity: "info",
          message: `${summary.compedRegistrationCount} confirmed attendee record(s) do not have a paid order with a collected attendee fee.`
        });
      }

      return {
        ...summary,
        lines: [
          {
            label: "Attendee fees",
            expected: summary.attendeeExpected,
            collected: summary.attendeeCollected,
            units: summary.attendeeCount,
            basis: feeBasis(summary.currency, policy.attendeeFee, "confirmed or checked-in attendee")
          },
          {
            label: "Hotel booking fees",
            expected: summary.hotelExpected,
            collected: summary.hotelCollected,
            units: summary.hotelBookingCount,
            basis: feeBasis(summary.currency, policy.hotelBookingFee, "confirmed hotel booking")
          },
          {
            label: "Store and vendor transaction fees",
            expected: summary.transactionExpected,
            collected: summary.transactionCollected,
            units: summary.storeVendorRevenue,
            basis: "1% of paid store and vendor revenue"
          }
        ],
        history: paidOrders
          .filter((order) => order.currency === summary.currency)
          .map((order) => ({
            orderId: order.id,
            eventName: order.event.name,
            collectedAt: order.updatedAt.toISOString(),
            gross: order.total,
            platformFee: order.platformFee,
            source: itemSource(order.items.map((item) => item.itemType))
          })),
        discrepancies
      };
    })
  };
}

export function feeReportToJson(report: OrganizationFeeReport): Prisma.InputJsonValue {
  return report as unknown as Prisma.InputJsonValue;
}
