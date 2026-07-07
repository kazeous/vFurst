import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import type { ReconcileFeesJob } from "../queues";

const ATTENDEE_FEE_CENTS = 100;
const HOTEL_BOOKING_FEE_CENTS = 100;

function cents(value: number) {
  return Math.max(0, Math.round(value));
}

async function reportForOrg(orgId: string) {
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
        items: true
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

  const storeVendorRevenue = paidOrders.reduce(
    (sum, order) =>
      sum +
      order.items
        .filter((item) => item.itemType === "PRODUCT" || item.itemType === "VENDOR")
        .reduce((itemSum, item) => itemSum + item.unitPrice * item.quantity, 0),
    0
  );
  const expectedTotal = attendeeCount * ATTENDEE_FEE_CENTS + hotelBookingCount * HOTEL_BOOKING_FEE_CENTS + cents(storeVendorRevenue * 0.01);
  const collectedTotal = paidOrders.reduce((sum, order) => sum + order.platformFee, 0);

  return {
    orgId,
    attendeeCount,
    hotelBookingCount,
    storeVendorRevenue,
    expectedTotal,
    collectedTotal,
    discrepancyCents: expectedTotal - collectedTotal,
    compedRegistrations,
    generatedAt: new Date().toISOString()
  };
}

export async function processReconcileFees(job: Job<ReconcileFeesJob>) {
  const orgs = await prisma.organization.findMany({
    where: job.data.orgId
      ? {
          id: job.data.orgId
        }
      : undefined,
    select: {
      id: true
    }
  });

  const reports = [];

  for (const org of orgs) {
    reports.push(await reportForOrg(org.id));
  }

  return {
    reportCount: reports.length,
    reports
  };
}
