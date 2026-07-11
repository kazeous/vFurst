import { prisma } from "@vfurst/db";

export async function processExpireCheckouts() {
  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      checkoutExpiresAt: { lte: new Date() }
    },
    include: { items: true },
    take: 250
  });

  let expired = 0;

  for (const order of orders) {
    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "CANCELLED", reservationReleasedAt: new Date() }
      });

      if (cancelled.count === 0) {
        return;
      }

      await tx.paymentAttempt.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "EXPIRED" }
      });

      for (const item of order.items) {
        if (item.itemType === "PRODUCT" && item.storeProductId && order.inventoryReservedAt && !order.reservationReleasedAt) {
          await tx.storeProduct.update({
            where: { id: item.storeProductId },
            data: { stock: { increment: item.quantity } }
          });
        }

        if (item.itemType === "REGISTRATION" && item.registrationId) {
          await tx.registration.updateMany({
            where: { id: item.registrationId, status: "PENDING" },
            data: { status: "CANCELLED" }
          });
        }

        if (item.itemType === "HOTEL") {
          await tx.hotelBooking.deleteMany({ where: { id: item.refId, confirmationCode: "PENDING" } });
        }
      }

      expired += 1;
    });
  }

  return { expired };
}
