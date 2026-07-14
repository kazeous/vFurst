import {
  calculateFeeSummariesByCurrency,
  createFeePolicy,
  DEFAULT_VND_ATTENDEE_FEE,
  DEFAULT_VND_HOTEL_BOOKING_FEE,
  prisma,
  type FeePolicyByCurrency,
  type Prisma
} from "@vfurst/db";
import type { Job } from "bullmq";
import type { ReconcileFeesJob } from "../queues.js";

function configuredFee(settings: Prisma.JsonValue, key: string, fallback: number) {
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    return fallback;
  }

  const value = settings[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

async function loadFeePolicies() {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: {
      provider: "SEPAY"
    },
    select: {
      settings: true
    }
  });
  const settings = config?.settings ?? {};

  return createFeePolicy({
    registrationFeeVnd: configuredFee(settings, "registrationFeeVnd", DEFAULT_VND_ATTENDEE_FEE),
    hotelFeeVnd: configuredFee(settings, "hotelFeeVnd", DEFAULT_VND_HOTEL_BOOKING_FEE)
  });
}

async function reportForOrg(orgId: string, policies: FeePolicyByCurrency) {
  const [events, registrations, hotelBookings, paidOrders] = await Promise.all([
    prisma.event.findMany({
      where: {
        orgId
      },
      select: {
        currency: true
      }
    }),
    prisma.registration.findMany({
      where: {
        orgId,
        event: {
          orgId
        },
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
          event: {
            orgId
          }
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
        event: {
          orgId
        },
        status: "PAID"
      },
      select: {
        currency: true,
        platformFee: true,
        event: {
          select: {
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
      }
    })
  ]);

  return {
    orgId,
    currencies: calculateFeeSummariesByCurrency({
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
    }),
    currencyMismatchCount: paidOrders.filter((order) => order.currency !== order.event.currency).length,
    generatedAt: new Date().toISOString()
  };
}

export async function processReconcileFees(job: Job<ReconcileFeesJob>) {
  const [orgs, policies] = await Promise.all([
    prisma.organization.findMany({
      where: job.data.orgId
        ? {
            id: job.data.orgId
          }
        : undefined,
      select: {
        id: true
      }
    }),
    loadFeePolicies()
  ]);

  const reports = [];

  for (const org of orgs) {
    reports.push(await reportForOrg(org.id, policies));
  }

  return {
    reportCount: reports.length,
    reports
  };
}
