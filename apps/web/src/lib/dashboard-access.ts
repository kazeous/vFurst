import { auth } from "@/lib/auth";
import { prisma, type OrgRole } from "@vfurst/db";
import { redirect } from "next/navigation";

export async function requireDashboardUser() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

export async function requireOrgAccess(orgId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId
      }
    }
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("You do not have permission to manage this organization.");
  }

  return {
    userId,
    membership
  };
}

export async function requireEventAccess(eventId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    select: {
      id: true,
      orgId: true
    }
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId: event.orgId
      }
    }
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("You do not have permission to manage this event.");
  }

  return {
    userId,
    membership,
    event
  };
}
