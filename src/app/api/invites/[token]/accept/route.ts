import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { getSessionUserId } from "@/server/rbac";
import { forbidden, handleRouteError, notFound } from "@/server/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const session = await requireSession();
    const userId = getSessionUserId(session);
    const email = session.user.email?.toLowerCase();

    if (!email) {
      forbidden("The signed-in account must have an email address to accept invites");
    }

    const organizationInvite = await db.organizationInvite.findUnique({ where: { token } });
    if (organizationInvite) {
      if (organizationInvite.email !== email) {
        forbidden("This invite belongs to another email address");
      }

      if (organizationInvite.status !== "PENDING" || organizationInvite.expiresAt < new Date()) {
        forbidden("This invite is no longer active");
      }

      const membership = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const member = await tx.organizationMember.upsert({
          where: {
            organizationId_userId: {
              organizationId: organizationInvite.organizationId,
              userId
            }
          },
          create: {
            organizationId: organizationInvite.organizationId,
            userId,
            role: organizationInvite.role
          },
          update: {}
        });

        await tx.organizationInvite.update({
          where: { id: organizationInvite.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date()
          }
        });

        await tx.auditLog.create({
          data: {
            organizationId: organizationInvite.organizationId,
            actorUserId: userId,
            action: "organization.invite.accepted",
            entityType: "OrganizationInvite",
            entityId: organizationInvite.id,
            metadata: { email, role: organizationInvite.role }
          }
        });

        return member;
      });

      return NextResponse.json({ type: "organization", membership });
    }

    const eventInvite = await db.eventInvite.findUnique({
      where: { token },
      include: {
        event: true
      }
    });

    if (!eventInvite) {
      notFound("Invite not found");
    }

    if (eventInvite.email !== email) {
      forbidden("This invite belongs to another email address");
    }

    if (eventInvite.status !== "PENDING" || eventInvite.expiresAt < new Date()) {
      forbidden("This invite is no longer active");
    }

    const membership = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const member = await tx.eventMember.upsert({
        where: {
          eventId_userId: {
            eventId: eventInvite.eventId,
            userId
          }
        },
        create: {
          eventId: eventInvite.eventId,
          userId,
          role: eventInvite.role
        },
        update: {}
      });

      await tx.eventInvite.update({
        where: { id: eventInvite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId: eventInvite.event.organizationId,
          eventId: eventInvite.eventId,
          actorUserId: userId,
          action: "event.invite.accepted",
          entityType: "EventInvite",
          entityId: eventInvite.id,
          metadata: { email, role: eventInvite.role }
        }
      });

      return member;
    });

    return NextResponse.json({ type: "event", membership });
  } catch (error) {
    return handleRouteError(error);
  }
}
