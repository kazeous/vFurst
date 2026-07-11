import { sendOrgEmail } from "@/lib/email";
import { queueWebhookEvent } from "@/lib/webhooks";
import { organizerNetAmount } from "@/lib/payments/ledger";
import { prisma, type PaymentProvider } from "@vfurst/db";

export async function markOrderPaid(orderId: string, stripePaymentIntentId?: string | null) {
  return markOrderPaidWithProvider(orderId, stripePaymentIntentId ? "STRIPE" : null, stripePaymentIntentId);
}

export async function markOrderPaidWithProvider(
  orderId: string,
  paymentProvider: PaymentProvider | null,
  paymentReference?: string | null
) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId
    },
    include: {
      event: true,
      items: true,
      org: true,
      user: true,
      voucher: true
    }
  });

  if (!order || order.status !== "PENDING") {
    return order;
  }

  let transitionedToPaid = false;

  await prisma.$transaction(async (tx) => {
    const paidOrder = await tx.order.updateMany({
      where: {
        id: order.id,
        status: "PENDING"
      },
      data: {
        status: "PAID",
        paymentProvider: paymentProvider ?? order.paymentProvider,
        paymentReference: paymentReference ?? order.paymentReference,
        stripePaymentIntentId:
          paymentProvider === "STRIPE" ? paymentReference ?? order.stripePaymentIntentId : order.stripePaymentIntentId
      }
    });

    if (paidOrder.count === 0) {
      return;
    }

    transitionedToPaid = true;

    if (paymentProvider) {
      await tx.paymentAttempt.updateMany({
        where: {
          orderId: order.id,
          provider: paymentProvider,
          status: "PENDING"
        },
        data: {
          status: "PAID",
          providerReference: paymentProvider === "SEPAY" ? paymentReference ?? undefined : undefined,
          paidAt: new Date()
        }
      });
    }

    if (paymentProvider === "SEPAY") {
      await tx.organizerLedgerEntry.upsert({
        where: {
          orderId_type: {
            orderId: order.id,
            type: "PAYMENT"
          }
        },
        update: {},
        create: {
          orgId: order.orgId,
          orderId: order.id,
          type: "PAYMENT",
          currency: order.currency,
          amount: organizerNetAmount(order.total, order.platformFee),
          note: `SePay payment ${paymentReference ?? ""}`.trim()
        }
      });
    }

    if (order.voucherId) {
      await tx.voucher.update({
        where: {
          id: order.voucherId
        },
        data: {
          usedCount: {
            increment: 1
          }
        }
      });
    }

    for (const item of order.items) {
      if (item.itemType === "REGISTRATION" && item.registrationId) {
        await tx.registration.update({
          where: {
            id: item.registrationId
          },
          data: {
            status: "CONFIRMED"
          }
        });
      }

      if (item.itemType === "PRODUCT" && item.storeProductId && !order.inventoryReservedAt) {
        await tx.storeProduct.update({
          where: {
            id: item.storeProductId
          },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
      }

      if (item.itemType === "HOTEL") {
        await tx.hotelBooking.update({
          where: {
            id: item.refId
          },
          data: {
            confirmationCode: `VF-${item.refId.slice(0, 8).toUpperCase()}`
          }
        });
      }

      if (item.itemType === "VENDOR") {
        await tx.vendorApplication.update({
          where: {
            id: item.refId
          },
          data: {
            boothPaidAt: new Date(),
            paymentOrderId: order.id
          }
        });
      }
    }

    if (order.cartId) {
      await tx.cart.update({
        where: {
          id: order.cartId
        },
        data: {
          voucherId: null,
          items: {
            deleteMany: {}
          }
        }
      });
    }
  });

  if (!transitionedToPaid) {
    return prisma.order.findUnique({
      where: {
        id: orderId
      }
    });
  }

  const registrationItem = order.items.find((item) => item.itemType === "REGISTRATION" && item.registrationId);
  const hotelItem = order.items.find((item) => item.itemType === "HOTEL");

  if (registrationItem) {
    try {
      await sendOrgEmail(order.org, order.user.email, "registration-confirmation", {
        eventName: order.event.name,
        attendeeName: order.user.name
      });
    } catch (error) {
      console.error("Registration confirmation email failed after payment fulfillment.", error);
    }
  }

  if (hotelItem) {
    try {
      await sendOrgEmail(order.org, order.user.email, "hotel-booking-confirmation", {
        eventName: order.event.name,
        attendeeName: order.user.name
      });
    } catch (error) {
      console.error("Hotel confirmation email failed after payment fulfillment.", error);
    }
  }

  await queueWebhookEvent({
    orgId: order.orgId,
    eventId: order.eventId,
    type: "order.paid",
    data: {
      orderId: order.id,
      userId: order.userId,
      total: order.total,
      platformFee: order.platformFee,
      paymentProvider: paymentProvider ?? order.paymentProvider,
      paymentReference: paymentReference ?? order.paymentReference,
      stripePaymentIntentId: paymentProvider === "STRIPE" ? paymentReference : order.stripePaymentIntentId
    }
  });

  return prisma.order.findUnique({
    where: {
      id: orderId
    }
  });
}

export async function markOrderPaidByPaymentIntent(stripePaymentIntentId: string, metadataOrderId?: string | null) {
  const order =
    metadataOrderId != null
      ? await prisma.order.findUnique({
          where: {
            id: metadataOrderId
          }
        })
      : await prisma.order.findUnique({
          where: {
            stripePaymentIntentId
          }
        });

  if (!order) {
    return null;
  }

  return markOrderPaid(order.id, stripePaymentIntentId);
}

export async function markOrderRefundedByPaymentIntent(stripePaymentIntentId: string) {
  const order = await prisma.order.findUnique({
    where: {
      stripePaymentIntentId
    }
  });

  if (!order) {
    return null;
  }

  return reverseOrderFulfillment(order.id);
}

export async function reverseOrderFulfillment(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order || order.status === "REFUNDED") {
    return order;
  }

  await prisma.$transaction(async (tx) => {
    const refunded = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      data: { status: "REFUNDED" }
    });

    if (refunded.count === 0) {
      return;
    }

    for (const item of order.items) {
      if (item.registrationId) {
        await tx.registration.update({
          where: {
            id: item.registrationId
          },
          data: {
            status: "CANCELLED"
          }
        });
      }

      if (item.itemType === "PRODUCT" && item.storeProductId) {
        await tx.storeProduct.update({
          where: {
            id: item.storeProductId
          },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });
      }

      if (item.itemType === "VENDOR") {
        await tx.vendorApplication.update({
          where: {
            id: item.refId
          },
          data: {
            boothPaidAt: null
          }
        });
      }


      if (item.itemType === "HOTEL") {
        await tx.hotelBooking.updateMany({
          where: { id: item.refId },
          data: { confirmationCode: "CANCELLED" }
        });
      }
    }
  });

  await queueWebhookEvent({
    orgId: order.orgId,
    eventId: order.eventId,
    type: "order.refunded",
    data: {
      orderId: order.id,
      total: order.total,
      platformFee: order.platformFee,
      paymentProvider: order.paymentProvider,
      paymentReference: order.paymentReference,
      stripePaymentIntentId: order.stripePaymentIntentId
    }
  });

  return order;
}
