import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { writeAuditLog } from "@/server/audit";
import { updateProductInputSchema } from "@/shared/schemas/product";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    productId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, productId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateProductInputSchema);

    const existing = await db.product.findUnique({ where: { id: productId } });
    if (!existing || existing.eventId !== eventId) {
      notFound("Product not found");
    }

    const product = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.images) {
        await tx.productImage.deleteMany({ where: { productId } });
      }

      if (input.options) {
        await tx.productOption.deleteMany({ where: { productId } });
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          category: input.category,
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          basePriceCents: input.basePriceCents,
          stockLimit: input.stockLimit,
          publicVisible: input.publicVisible,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
          availableUntil: input.availableUntil ? new Date(input.availableUntil) : undefined,
          minPurchaseAge: input.minPurchaseAge,
          maxPurchaseAge: input.maxPurchaseAge,
          images: input.images
            ? {
                create: input.images.map((image, index) => ({
                  url: image.url,
                  altText: image.altText,
                  sortOrder: index
                }))
              }
            : undefined,
          options: input.options
            ? {
                create: input.options.map((option, optionIndex) => ({
                  label: option.label,
                  required: option.required,
                  sortOrder: optionIndex,
                  values: {
                    create: option.values.map((value, valueIndex) => ({
                      label: value,
                      sortOrder: valueIndex
                    }))
                  }
                }))
              }
            : undefined
        },
        include: {
          images: true,
          options: { include: { values: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: access.event.organizationId,
          eventId,
          actorUserId: userId,
          action: "product.updated",
          entityType: "Product",
          entityId: productId,
          metadata: { category: updated.category, displayName: updated.displayName }
        }
      });

      return updated;
    });

    return NextResponse.json({ product });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { eventId, productId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);

    const existing = await db.product.findUnique({ where: { id: productId } });
    if (!existing || existing.eventId !== eventId) {
      notFound("Product not found");
    }

    const product = await db.product.update({
      where: { id: productId },
      data: {
        publicVisible: false,
        archivedAt: new Date()
      }
    });

    await writeAuditLog({
      organizationId: access.event.organizationId,
      eventId,
      actorUserId: userId,
      action: "product.archived",
      entityType: "Product",
      entityId: productId,
      metadata: { displayName: product.displayName }
    });

    return NextResponse.json({ product });
  } catch (error) {
    return handleRouteError(error);
  }
}
