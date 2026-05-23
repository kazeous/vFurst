import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId, requireEventManager } from "@/server/rbac";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { createVendorApprovalOrder } from "@/server/vendors";
import { updateVendorApplicationStatusInputSchema } from "@/shared/schemas/vendor";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
    applicationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { eventId, applicationId } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const access = await requireEventManager(userId, eventId);
    const input = await parseJsonBody(request, updateVendorApplicationStatusInputSchema);

    const application = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.vendorApplication.findUnique({
        where: { id: applicationId },
        include: {
          requestedTableProduct: true
        }
      });

      if (!existing || existing.eventId !== eventId) {
        notFound("Vendor application not found");
      }

      const updated = await tx.vendorApplication.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          adminNote: input.adminNote,
          reviewedByUserId: userId,
          reviewedAt: new Date()
        },
        include: {
          requestedTableProduct: true,
          approvedOrder: true,
          amenities: true,
          assistants: true,
          seatingPreferences: true,
          user: { select: { id: true, name: true, email: true } }
        }
      });

      let approvedOrderId = updated.approvedOrderId;
      if (input.status === "APPROVED_UNPAID") {
        approvedOrderId = await createVendorApprovalOrder(tx, updated);
      }

      await tx.auditLog.create({
        data: {
          organizationId: access.event.organizationId,
          eventId,
          actorUserId: userId,
          action: "vendor_application.reviewed",
          entityType: "VendorApplication",
          entityId: existing.id,
          metadata: {
            status: input.status,
            approvedOrderId,
            adminNote: input.adminNote
          }
        }
      });

      return tx.vendorApplication.findUnique({
        where: { id: existing.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
          requestedTableProduct: { select: { id: true, displayName: true, basePriceCents: true } },
          approvedOrder: { select: { id: true, status: true, totalCents: true } },
          amenities: { orderBy: { createdAt: "asc" } },
          assistants: { orderBy: { createdAt: "asc" } },
          seatingPreferences: { orderBy: { sortOrder: "asc" } }
        }
      });
    });

    return NextResponse.json({ application });
  } catch (error) {
    return handleRouteError(error);
  }
}
