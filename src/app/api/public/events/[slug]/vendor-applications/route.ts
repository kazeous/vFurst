import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError, HttpError, notFound, parseJsonBody } from "@/server/http";
import { assertRateLimit } from "@/server/rate-limit";
import { assertVendorApplicationsOpen } from "@/server/vendors";
import { createVendorApplicationInputSchema } from "@/shared/schemas/vendor";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    assertRateLimit(`vendor-application:${slug}:${getClientIp(request)}`, 3, 60_000);

    const session = await requireSession();
    const userId = getSessionUserId(session);
    const input = await parseJsonBody(request, createVendorApplicationInputSchema);

    const event = await db.event.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    assertVendorApplicationsOpen(event);

    if (input.requestedTableProductId) {
      const product = await db.product.findFirst({
        where: {
          id: input.requestedTableProductId,
          eventId: event.id,
          category: "VENDOR_TABLE",
          archivedAt: null
        },
        select: { id: true }
      });

      if (!product) {
        throw new HttpError(400, "Requested vendor table is not available.");
      }
    }

    const application = await db.$transaction(async (tx: Prisma.TransactionClient) =>
      tx.vendorApplication.create({
        data: {
          eventId: event.id,
          userId,
          businessName: input.businessName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          description: input.description,
          productsServices: input.productsServices,
          requestedTableProductId: input.requestedTableProductId,
          seatingNotes: input.seatingNotes,
          amenities: {
            create: input.amenities.map((amenity) => ({
              name: amenity.name,
              details: amenity.details
            }))
          },
          assistants: {
            create: input.assistants.map((assistant) => ({
              name: assistant.name,
              email: assistant.email
            }))
          },
          seatingPreferences: {
            create: input.seatingPreferences.map((note, sortOrder) => ({
              note,
              sortOrder
            }))
          }
        },
        include: {
          amenities: true,
          assistants: true,
          seatingPreferences: true,
          requestedTableProduct: true
        }
      })
    );

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
