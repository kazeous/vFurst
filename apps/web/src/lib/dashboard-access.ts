import { auth } from "@/lib/auth";
import { prisma, type OrgRole } from "@vfurst/db";
import { notFound, redirect } from "next/navigation";

export async function requireDashboardUser() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

async function getPlatformUser(userId: string) {
  return prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true
    }
  });
}

async function getOrgMembership(userId: string, orgId: string) {
  return prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId
      }
    }
  });
}

async function getEventTenant(eventId: string) {
  return prisma.event.findUnique({
    where: {
      id: eventId
    },
    select: {
      id: true,
      orgId: true,
      currency: true
    }
  });
}

async function getRegistrationTypeTenant(typeId: string) {
  return prisma.registrationType.findUnique({
    where: {
      id: typeId
    },
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          id: true,
          orgId: true,
          currency: true
        }
      }
    }
  });
}

async function getAddOnDefinitionTenant(addOnId: string) {
  return prisma.addOnDefinition.findUnique({
    where: {
      id: addOnId
    },
    select: {
      id: true,
      registrationTypeId: true,
      registrationType: {
        select: {
          event: {
            select: {
              id: true,
              orgId: true,
              currency: true
            }
          }
        }
      }
    }
  });
}

function hasAllowedOrgRole(membership: Awaited<ReturnType<typeof getOrgMembership>>, allowedRoles: OrgRole[]) {
  return Boolean(membership && allowedRoles.includes(membership.role));
}

export async function requirePlatformAdmin() {
  const userId = await requireDashboardUser();
  const user = await getPlatformUser(userId);

  if (!user || user.platformRole !== "PLATFORM_ADMIN") {
    throw new Error("You do not have permission to manage platform settings.");
  }

  return user;
}

export async function requirePlatformAdminPage() {
  const userId = await requireDashboardUser();
  const user = await getPlatformUser(userId);

  if (!user || user.platformRole !== "PLATFORM_ADMIN") {
    notFound();
  }

  return user;
}

export async function requireOrgAccess(orgId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const membership = await getOrgMembership(userId, orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this organization.");
  }

  return {
    userId,
    membership
  };
}

export async function requireOrgPageAccess(orgId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const membership = await getOrgMembership(userId, orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    notFound();
  }

  return {
    userId,
    membership
  };
}

export async function requireEventAccess(eventId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const event = await getEventTenant(eventId);

  if (!event) {
    throw new Error("Event not found.");
  }

  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this event.");
  }

  return {
    userId,
    membership,
    event
  };
}

export async function requireRegistrationTypeAccess(typeId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const registrationType = await getRegistrationTypeTenant(typeId);

  if (!registrationType) {
    throw new Error("Registration type not found.");
  }

  const membership = await getOrgMembership(userId, registrationType.event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this registration type.");
  }

  return {
    userId,
    membership,
    registrationType,
    event: registrationType.event
  };
}

export async function requireAddOnDefinitionAccess(addOnId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const addOnDefinition = await getAddOnDefinitionTenant(addOnId);

  if (!addOnDefinition) {
    throw new Error("Add-on not found.");
  }

  const event = addOnDefinition.registrationType.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this add-on.");
  }

  return {
    userId,
    membership,
    addOnDefinition,
    event
  };
}

export async function requireEventPageAccess(eventId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const event = await getEventTenant(eventId);

  if (!event) {
    notFound();
  }

  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    notFound();
  }

  return {
    userId,
    membership,
    event
  };
}
