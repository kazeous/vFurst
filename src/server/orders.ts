import "server-only";
import type { Prisma, Product } from "@prisma/client";
import { HttpError } from "@/server/http";
import { isProductActive } from "@/server/products";

const STOCKED_ORDER_STATUSES = ["UNPAID", "PAID", "PARTIALLY_REFUNDED", "FULFILLED"] as const;

export function assertProductCanBeOrdered(
  product: Pick<Product, "publicVisible" | "archivedAt" | "availableFrom" | "availableUntil">
) {
  if (!isProductActive(product)) {
    throw new HttpError(404, "Product is not available");
  }
}

export async function countClaimedProductUnits(tx: Prisma.TransactionClient, productId: string) {
  const [registrations, orderItems] = await Promise.all([
    tx.registration.count({
      where: {
        productId,
        status: "SUBMITTED"
      }
    }),
    tx.orderItem.aggregate({
      where: {
        productId,
        order: {
          status: {
            in: [...STOCKED_ORDER_STATUSES]
          }
        }
      },
      _sum: {
        quantity: true
      }
    })
  ]);

  return registrations + (orderItems._sum.quantity ?? 0);
}

export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  product: Pick<Product, "id" | "displayName" | "stockLimit">,
  requestedQuantity: number
) {
  if (product.stockLimit == null) {
    return;
  }

  const claimed = await countClaimedProductUnits(tx, product.id);

  if (claimed + requestedQuantity > product.stockLimit) {
    throw new HttpError(409, `${product.displayName} does not have enough stock remaining.`);
  }
}

export function sumOrderItems(items: Array<{ quantity: number; unitPriceCents: number }>) {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}
