import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { handleRouteError, notFound } from "@/server/http";
import { isProductActive } from "@/server/products";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const event = await db.event.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true
      }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    const products = await db.product.findMany({
      where: {
        eventId: event.id,
        archivedAt: null,
        publicVisible: true
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
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
      products: products.filter(isProductActive).map((product) => ({
        ...product,
        registrationCount: product._count.registrations,
        _count: undefined
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
