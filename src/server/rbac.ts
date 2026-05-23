import "server-only";
import type { EventRole, OrganizationRole } from "@prisma/client";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/http";
import type { Session } from "next-auth";

const ORG_MANAGERS: OrganizationRole[] = ["OWNER", "ADMIN"];
const EVENT_MANAGERS: EventRole[] = ["EVENT_ADMIN"];

export function getSessionUserId(session: Session) {
  const userId = session.user?.id;

  if (!userId) {
    forbidden("Authenticated session is missing a user id");
  }

  return userId;
}

export async function requireOrganizationMember(userId: string, organizationId: string) {
  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    }
  });

  if (!membership) {
    notFound("Organization not found");
  }

  return membership;
}

export async function requireOrganizationManager(userId: string, organizationId: string) {
  const membership = await requireOrganizationMember(userId, organizationId);

  if (!ORG_MANAGERS.includes(membership.role)) {
    forbidden("Organization admin access is required");
  }

  return membership;
}

export async function requireOrganizationOwner(userId: string, organizationId: string) {
  const membership = await requireOrganizationMember(userId, organizationId);

  if (membership.role !== "OWNER") {
    forbidden("Organization owner access is required");
  }

  return membership;
}

export async function requireEventMember(userId: string, eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      members: {
        where: { userId },
        take: 1
      },
      organization: {
        include: {
          members: {
            where: { userId },
            take: 1
          }
        }
      }
    }
  });

  if (!event) {
    notFound("Event not found");
  }

  const eventMembership = event.members[0] ?? null;
  const organizationMembership = event.organization.members[0] ?? null;

  if (!eventMembership && !organizationMembership) {
    notFound("Event not found");
  }

  return { event, eventMembership, organizationMembership };
}

export async function requireEventManager(userId: string, eventId: string) {
  const access = await requireEventMember(userId, eventId);

  if (access.organizationMembership && ORG_MANAGERS.includes(access.organizationMembership.role)) {
    return access;
  }

  if (!access.eventMembership || !EVENT_MANAGERS.includes(access.eventMembership.role)) {
    forbidden("Event admin access is required");
  }

  return access;
}

export async function assertCanRemoveOrganizationMember(actorUserId: string, organizationId: string, memberId: string) {
  await requireOrganizationManager(actorUserId, organizationId);

  const member = await db.organizationMember.findUnique({ where: { id: memberId } });
  if (!member || member.organizationId !== organizationId) {
    notFound("Organization member not found");
  }

  if (member.role === "OWNER") {
    forbidden("Organization owners cannot be removed in Phase 2");
  }

  if (member.userId === actorUserId) {
    forbidden("You cannot remove your own organization membership");
  }

  return member;
}
