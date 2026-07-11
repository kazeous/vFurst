import { prisma } from "@vfurst/db";

export async function reserveOrderInventory(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true }
    });

    if (order.inventoryReservedAt) {
      return;
    }

    for (const item of order.items) {
      if (item.itemType !== "PRODUCT" || !item.storeProductId) {
        continue;
      }

      const reserved = await tx.storeProduct.updateMany({
        where: {
          id: item.storeProductId,
          stock: { gte: item.quantity }
        },
        data: {
          stock: { decrement: item.quantity }
        }
      });

      if (reserved.count !== 1) {
        throw new Error("A product no longer has enough stock for this checkout.");
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: { inventoryReservedAt: new Date() }
    });
  });
}
