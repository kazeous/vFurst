import { sendOrgEmail } from "@/lib/email";
import { queueWebhookEvent } from "@/lib/webhooks";
import { organizerNetAmount } from "@/lib/payments/ledger";
import { Prisma, prisma, type PaymentAttempt, type PaymentProvider } from "@vfurst/db";

type ProviderPaymentContext = {
  paymentAttemptId?: string | null;
  attemptProviderReference?: string | null;
};

async function runSerializable<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let retry = 0; retry < 12; retry += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        retry < 11
      ) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (retry + 1), 40)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Payment settlement could not be serialized.");
}

async function recordStaleProviderPayment(input: {
  orderId: string;
  provider: PaymentProvider;
  providerReference: string;
  attempt: PaymentAttempt | null;
}) {
  await prisma.paymentException.upsert({
    where: {
      providerReference: input.providerReference
    },
    update: {},
    create: {
      orderId: input.orderId,
      paymentAttemptId: input.attempt?.id,
      providerReference: input.providerReference,
      type: "STALE_ATTEMPT",
      expectedAmount: input.attempt?.amount,
      details: {
        provider: input.provider,
        reason: "Provider callback did not match the authoritative active payment attempt."
      }
    }
  });
}

export async function markOrderPaid(
  orderId: string,
  stripePaymentIntentId?: string | null,
  context: ProviderPaymentContext = {}
) {
  return markOrderPaidWithProvider(
    orderId,
    stripePaymentIntentId ? "STRIPE" : null,
    stripePaymentIntentId,
    context
  );
}

export async function markOrderPaidWithProvider(
  orderId: string,
  paymentProvider: PaymentProvider | null,
  paymentReference?: string | null,
  context: ProviderPaymentContext = {}
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

  if (!order) {
    return order;
  }

  if (order.status !== "PENDING") {
    const isIdempotentPaidReplay = Boolean(
      order.status === "PAID" &&
        paymentProvider &&
        order.paymentProvider === paymentProvider &&
        (order.paymentReference === paymentReference || order.stripePaymentIntentId === paymentReference)
    );

    if (paymentProvider && paymentReference && !isIdempotentPaidReplay) {
      const referencedAttempt = context.paymentAttemptId
        ? await prisma.paymentAttempt.findFirst({
            where: {
              id: context.paymentAttemptId,
              orderId: order.id,
              provider: paymentProvider
            }
          })
        : null;
      await recordStaleProviderPayment({
        orderId: order.id,
        provider: paymentProvider,
        providerReference: paymentReference,
        attempt: referencedAttempt
      });
    }
    return order;
  }

  if (order.orgId !== order.event.orgId || order.eventId !== order.event.id) {
    throw new Error("Order tenant does not match its event.");
  }

  if (order.voucher && (order.voucher.orgId !== order.orgId || order.voucher.eventId !== order.eventId)) {
    throw new Error("Order voucher does not belong to this event.");
  }

  let transitionedToPaid = false;
  let rejectedAttempt: PaymentAttempt | null = null;
  let providerAttemptRejected = false;

  await runSerializable(async (tx) => {
    rejectedAttempt = null;
    providerAttemptRejected = false;
    let authoritativeAttempt: PaymentAttempt | null = null;

    if (paymentProvider) {
      if (context.paymentAttemptId) {
        authoritativeAttempt = await tx.paymentAttempt.findFirst({
          where: {
            id: context.paymentAttemptId,
            orderId: order.id,
            provider: paymentProvider
          }
        });
      } else if (context.attemptProviderReference) {
        authoritativeAttempt = await tx.paymentAttempt.findFirst({
          where: {
            orderId: order.id,
            provider: paymentProvider,
            providerReference: context.attemptProviderReference
          }
        });
      } else {
        authoritativeAttempt = await tx.paymentAttempt.findFirst({
          where: {
            orderId: order.id,
            provider: paymentProvider,
            status: "PENDING"
          },
          orderBy: {
            createdAt: "desc"
          }
        });
      }

      const conflictingAttempt = authoritativeAttempt
        ? await tx.paymentAttempt.findFirst({
            where: {
              activeOrderId: order.id,
              id: {
                not: authoritativeAttempt.id
              }
            }
          })
        : null;
      const attemptIsAuthoritative = Boolean(
        authoritativeAttempt &&
          authoritativeAttempt.status === "PENDING" &&
          authoritativeAttempt.expiresAt > new Date() &&
          authoritativeAttempt.amount === order.total &&
          authoritativeAttempt.currency === order.currency &&
          (authoritativeAttempt.activeOrderId === null || authoritativeAttempt.activeOrderId === order.id) &&
          !conflictingAttempt
      );

      if (!attemptIsAuthoritative) {
        rejectedAttempt = authoritativeAttempt;
        providerAttemptRejected = true;
        return;
      }
    }

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

    if (paymentProvider && authoritativeAttempt) {
      const paidAttempt = await tx.paymentAttempt.updateMany({
        where: {
          id: authoritativeAttempt.id,
          orderId: order.id,
          status: "PENDING"
        },
        data: {
          status: "PAID",
          activeOrderId: null,
          providerReference: paymentProvider === "SEPAY" ? paymentReference ?? undefined : undefined,
          paidAt: new Date()
        }
      });

      if (paidAttempt.count !== 1) {
        throw new Error("The authoritative payment attempt changed during settlement.");
      }
    } else if (!paymentProvider) {
      await tx.paymentAttempt.updateMany({
        where: {
          orderId: order.id,
          status: {
            in: ["PENDING", "REVIEW"]
          }
        },
        data: {
          status: "CANCELLED",
          activeOrderId: null
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
      const updatedVoucher = await tx.voucher.updateMany({
        where: {
          id: order.voucherId,
          orgId: order.orgId,
          eventId: order.eventId
        },
        data: {
          usedCount: {
            increment: 1
          }
        }
      });

      if (updatedVoucher.count !== 1) {
        throw new Error("Order voucher does not belong to this event.");
      }
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

  if (providerAttemptRejected && paymentProvider && paymentReference) {
    await recordStaleProviderPayment({
      orderId: order.id,
      provider: paymentProvider,
      providerReference: paymentReference,
      attempt: rejectedAttempt
    });
  }

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

export async function markOrderPaidByPaymentIntent(
  stripePaymentIntentId: string,
  metadataOrderId?: string | null,
  paymentAttemptId?: string | null
) {
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

  return markOrderPaid(order.id, stripePaymentIntentId, { paymentAttemptId });
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
    include: { event: true, items: true, voucher: true }
  });

  if (!order || order.status === "REFUNDED") {
    return order;
  }

  if (order.orgId !== order.event.orgId || order.eventId !== order.event.id) {
    throw new Error("Order tenant does not match its event.");
  }

  if (order.voucher && (order.voucher.orgId !== order.orgId || order.voucher.eventId !== order.eventId)) {
    throw new Error("Order voucher does not belong to this event.");
  }

  await prisma.$transaction(async (tx) => {
    const refunded = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      data: { status: "REFUNDED" }
    });

    if (refunded.count === 0) {
      return;
    }

    if (order.voucherId) {
      await tx.voucher.updateMany({
        where: {
          id: order.voucherId,
          orgId: order.orgId,
          eventId: order.eventId,
          usedCount: {
            gt: 0
          }
        },
        data: {
          usedCount: {
            decrement: 1
          }
        }
      });
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
