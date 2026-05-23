import "server-only";
import type { Prisma, Product, VendorApplication } from "@prisma/client";
import { HttpError } from "@/server/http";
import { assertStockAvailable } from "@/server/orders";

export function assertVendorApplicationsOpen(event: { status: string }) {
  if (event.status !== "REGISTRATION_OPEN" && event.status !== "LIVE") {
    throw new HttpError(403, "Vendor applications are not open for this event.");
  }
}

function assertVendorTableProductAvailable(
  product: Pick<Product, "category" | "archivedAt" | "availableFrom" | "availableUntil">
) {
  if (product.category !== "VENDOR_TABLE") {
    throw new HttpError(400, "Selected product is not a vendor table.");
  }

  const now = new Date();
  if (product.archivedAt || (product.availableFrom && product.availableFrom > now) || (product.availableUntil && product.availableUntil < now)) {
    throw new HttpError(409, "Selected vendor table is not available.");
  }
}

export async function createVendorApprovalOrder(
  tx: Prisma.TransactionClient,
  application: VendorApplication & {
    requestedTableProduct: Product | null;
  }
) {
  if (application.approvedOrderId) {
    return application.approvedOrderId;
  }

  const product = application.requestedTableProduct;
  if (!product) {
    throw new HttpError(400, "A requested vendor table product is required before approval.");
  }

  if (product.eventId !== application.eventId) {
    throw new HttpError(400, "Requested vendor table does not belong to this event.");
  }

  assertVendorTableProductAvailable(product);
  await assertStockAvailable(tx, product, 1);

  const order = await tx.order.create({
    data: {
      eventId: application.eventId,
      userId: application.userId,
      status: product.basePriceCents === 0 ? "PAID" : "UNPAID",
      subtotalCents: product.basePriceCents,
      totalCents: product.basePriceCents,
      currency: "usd",
      items: {
        create: {
          productId: product.id,
          productName: product.displayName,
          productCategory: product.category,
          unitPriceCents: product.basePriceCents,
          quantity: 1,
          totalCents: product.basePriceCents
        }
      }
    }
  });

  await tx.vendorApplication.update({
    where: { id: application.id },
    data: {
      approvedOrderId: order.id,
      status: product.basePriceCents === 0 ? "APPROVED_PAID" : "APPROVED_UNPAID"
    }
  });

  return order.id;
}

export async function markVendorApplicationsPaidForOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.vendorApplication.updateMany({
    where: {
      approvedOrderId: orderId,
      status: "APPROVED_UNPAID"
    },
    data: {
      status: "APPROVED_PAID"
    }
  });
}
