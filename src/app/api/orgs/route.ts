import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getSessionUserId } from "@/server/rbac";
import { handleRouteError, parseJsonBody, HttpError } from "@/server/http";
import { requireSession } from "@/server/auth/session";
import { slugify } from "@/server/slug";
import { createOrganizationInputSchema } from "@/shared/schemas/organization";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const userId = getSessionUserId(session);

    const memberships = await db.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                events: true,
                members: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
        eventCount: membership.organization._count.events,
        memberCount: membership.organization._count.members
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const input = await parseJsonBody(request, createOrganizationInputSchema);
    const slug = input.slug ?? slugify(input.name);

    if (!slug) {
      throw new HttpError(400, "Organization slug is required");
    }

    const existing = await db.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new HttpError(409, "Organization slug is already in use");
    }

    const organization = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.organization.create({
        data: {
          name: input.name,
          slug,
          members: {
            create: {
              userId,
              role: "OWNER"
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: created.id,
          actorUserId: userId,
          action: "organization.created",
          entityType: "Organization",
          entityId: created.id,
          metadata: { name: created.name, slug: created.slug }
        }
      });

      return created;
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
