import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager, requireEventMember } from "@/server/rbac";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { createProductInputSchema } from "@/shared/schemas/product";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    await requireEventMember(userId, eventId);

    const products = await db.product.findMany({
      where: { eventId },
      orderBy: [{ archivedAt: "asc" }, { category: "asc" }, { createdAt: "asc" }],
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        options: {
          orderBy: { sortOrder: "asc" },
          include: { values: { orderBy: { sortOrder: "asc" } } }
        },
        _count: {
          select: {
            registrations: {
              where: { status: "SUBMITTED" }
            }
          }
        }
      }
    });

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        registrationCount: product._count.registrations,
        _count: undefined
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { eventId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, createProductInputSchema);

    const product = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.product.create({
        data: {
          eventId,
          category: input.category,
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          basePriceCents: input.basePriceCents,
          stockLimit: input.stockLimit,
          publicVisible: input.publicVisible,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
          availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
          minPurchaseAge: input.minPurchaseAge,
          maxPurchaseAge: input.maxPurchaseAge,
          images: {
            create: input.images.map((image, index) => ({
              url: image.url,
              altText: image.altText,
              sortOrder: index
            }))
          },
          options: {
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
          action: "product.created",
          entityType: "Product",
          entityId: created.id,
          metadata: { category: created.category, displayName: created.displayName }
        }
      });

      return created;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
