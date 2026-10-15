import { auth } from "@/lib/auth";
import { prisma, type OrgRole } from "@vfurst/db";
import { notFound, redirect } from "next/navigation";

export async function requireDashboardSession() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session;
}

export async function requireDashboardUser() {
  const session = await requireDashboardSession();
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
    },
    include: {
      org: {
        select: {
          status: true
        }
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
      orgId: true,
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

async function getRegistrationTenant(registrationId: string) {
  return prisma.registration.findUnique({
    where: {
      id: registrationId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      typeId: true,
      portalAccountId: true,
      status: true,
      approvalStatus: true,
      type: {
        select: {
          id: true,
          orgId: true,
          eventId: true
        }
      },
      event: {
        select: {
          id: true,
          orgId: true,
          currency: true,
          settings: true
        }
      }
    }
  });
}

async function getBadgeTemplateTenant(templateId: string) {
  return prisma.badgeTemplate.findUnique({
    where: {
      id: templateId
    },
    select: {
      id: true,
      orgId: true,
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

async function getBadgeTenant(badgeId: string) {
  return prisma.badge.findUnique({
    where: {
      id: badgeId
    },
    select: {
      id: true,
      orgId: true,
      registrationId: true,
      templateId: true,
      pdfUrl: true,
      zplData: true,
      generatedAt: true,
      printedAt: true,
      registration: {
        select: {
          id: true,
          orgId: true,
          eventId: true,
          event: {
            select: {
              id: true,
              orgId: true,
              currency: true
            }
          }
        }
      },
      template: {
        select: {
          id: true,
          orgId: true,
          eventId: true
        }
      }
    }
  });
}

async function getRaffleTenant(raffleId: string) {
  return prisma.raffle.findUnique({
    where: {
      id: raffleId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      name: true,
      prizes: true,
      drawDate: true,
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

async function getApiKeyTenant(apiKeyId: string) {
  return prisma.apiKey.findUnique({
    where: {
      id: apiKeyId
    },
    select: {
      id: true,
      orgId: true,
      name: true,
      scopes: true
    }
  });
}

async function getWebhookEndpointTenant(endpointId: string) {
  return prisma.webhookEndpoint.findUnique({
    where: {
      id: endpointId
    },
    select: {
      id: true,
      orgId: true,
      url: true,
      events: true,
      active: true
    }
  });
}

async function getAttendeeNoteTenant(noteId: string) {
  return prisma.attendeeNote.findUnique({
    where: {
      id: noteId
    },
    select: {
      id: true,
      registrationId: true,
      registration: {
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
      }
    }
  });
}

async function getStoreProductTenant(productId: string) {
  return prisma.storeProduct.findUnique({
    where: {
      id: productId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      images: true,
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

async function getOrderTenant(orderId: string) {
  return prisma.order.findUnique({
    where: {
      id: orderId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      total: true,
      currency: true,
      status: true,
      stripePaymentIntentId: true,
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

async function getHotelBlockTenant(blockId: string) {
  return prisma.hotelBlock.findUnique({
    where: {
      id: blockId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      hotelName: true,
      roomTypes: true,
      cutoffDate: true,
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

async function getHotelBookingTenant(bookingId: string) {
  return prisma.hotelBooking.findUnique({
    where: {
      id: bookingId
    },
    select: {
      id: true,
      orgId: true,
      blockId: true,
      block: {
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
      }
    }
  });
}

async function getDepartmentTenant(departmentId: string) {
  return prisma.department.findUnique({
    where: {
      id: departmentId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      formSchema: true,
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

async function getStaffRoleTenant(roleId: string) {
  return prisma.staffRole.findUnique({
    where: {
      id: roleId
    },
    select: {
      id: true,
      orgId: true,
      departmentId: true,
      roleName: true,
      department: {
        select: {
          id: true,
          orgId: true,
          eventId: true,
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

async function getVolunteerApplicationTenant(applicationId: string) {
  return prisma.volunteerApplication.findUnique({
    where: {
      id: applicationId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      departmentId: true,
      portalAccountId: true,
      status: true,
      department: {
        select: {
          id: true,
          orgId: true,
          eventId: true,
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

async function getStaffAssignmentTenant(assignmentId: string) {
  return prisma.staffAssignment.findUnique({
    where: {
      id: assignmentId
    },
    select: {
      id: true,
      orgId: true,
      roleId: true,
      portalAccountId: true,
      volunteerApplicationId: true,
      status: true,
      role: {
        select: {
          id: true,
          orgId: true,
          department: {
            select: {
              id: true,
              orgId: true,
              eventId: true,
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
      }
    }
  });
}

async function getVendorApplicationTenant(applicationId: string) {
  return prisma.vendorApplication.findUnique({
    where: {
      id: applicationId
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      portalAccountId: true,
      status: true,
      boothPrice: true,
      boothAssignment: true,
      boothPaidAt: true,
      paymentOrderId: true,
      assistants: true,
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

type OrganizationAccessOptions = {
  allowInactive?: boolean;
};

function hasAllowedOrgRole(
  membership: Awaited<ReturnType<typeof getOrgMembership>>,
  allowedRoles: OrgRole[],
  options: OrganizationAccessOptions = {}
) {
  return Boolean(
    membership &&
      allowedRoles.includes(membership.role) &&
      (options.allowInactive || membership.org.status === "ACTIVE")
  );
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

export async function requireOrgAccess(
  orgId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: OrganizationAccessOptions = {}
) {
  const userId = await requireDashboardUser();
  const membership = await getOrgMembership(userId, orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles, options)) {
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

  if (!hasAllowedOrgRole(membership, allowedRoles, { allowInactive: true })) {
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

  if (
    !registrationType ||
    registrationType.orgId !== registrationType.event.orgId ||
    registrationType.eventId !== registrationType.event.id
  ) {
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

export async function requireRegistrationAccess(
  registrationId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: OrganizationAccessOptions = {}
) {
  const userId = await requireDashboardUser();
  const registration = await getRegistrationTenant(registrationId);

  if (
    !registration ||
    registration.orgId !== registration.event.orgId ||
    registration.eventId !== registration.event.id ||
    registration.type.orgId !== registration.event.orgId ||
    registration.type.eventId !== registration.event.id ||
    registration.typeId !== registration.type.id
  ) {
    throw new Error("Registration not found.");
  }

  const membership = await getOrgMembership(userId, registration.event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles, options)) {
    throw new Error("You do not have permission to manage this registration.");
  }

  return {
    userId,
    membership,
    registration,
    event: registration.event
  };
}

export async function requireBadgeTemplateAccess(templateId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const badgeTemplate = await getBadgeTemplateTenant(templateId);

  if (
    !badgeTemplate ||
    badgeTemplate.orgId !== badgeTemplate.event.orgId ||
    badgeTemplate.eventId !== badgeTemplate.event.id
  ) {
    throw new Error("Badge template not found.");
  }

  const event = badgeTemplate.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this badge template.");
  }

  return {
    userId,
    membership,
    badgeTemplate,
    event
  };
}

export async function requireBadgeAccess(badgeId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const badge = await getBadgeTenant(badgeId);

  if (
    !badge ||
    badge.orgId !== badge.registration.orgId ||
    badge.orgId !== badge.template.orgId ||
    badge.registration.orgId !== badge.registration.event.orgId ||
    badge.registration.eventId !== badge.registration.event.id ||
    badge.template.eventId !== badge.registration.event.id
  ) {
    throw new Error("Badge not found.");
  }

  const event = badge.registration.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this badge.");
  }

  return {
    userId,
    membership,
    badge,
    registration: badge.registration,
    badgeTemplate: badge.template,
    event
  };
}

export async function requireRaffleAccess(raffleId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const raffle = await getRaffleTenant(raffleId);

  if (!raffle || raffle.orgId !== raffle.event.orgId || raffle.eventId !== raffle.event.id) {
    throw new Error("Raffle not found.");
  }

  const event = raffle.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this raffle.");
  }

  return {
    userId,
    membership,
    raffle,
    event
  };
}

export async function requireApiKeyAccess(
  apiKeyId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: OrganizationAccessOptions = {}
) {
  const userId = await requireDashboardUser();
  const apiKey = await getApiKeyTenant(apiKeyId);

  if (!apiKey) {
    throw new Error("API key not found.");
  }

  const membership = await getOrgMembership(userId, apiKey.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles, options)) {
    throw new Error("You do not have permission to manage this API key.");
  }

  return {
    userId,
    membership,
    apiKey
  };
}

export async function requireWebhookEndpointAccess(
  endpointId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: OrganizationAccessOptions = {}
) {
  const userId = await requireDashboardUser();
  const webhookEndpoint = await getWebhookEndpointTenant(endpointId);

  if (!webhookEndpoint) {
    throw new Error("Webhook endpoint not found.");
  }

  const membership = await getOrgMembership(userId, webhookEndpoint.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles, options)) {
    throw new Error("You do not have permission to manage this webhook endpoint.");
  }

  return {
    userId,
    membership,
    webhookEndpoint
  };
}

export async function requireAttendeeNoteAccess(noteId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const attendeeNote = await getAttendeeNoteTenant(noteId);

  if (!attendeeNote) {
    throw new Error("Attendee note not found.");
  }

  const event = attendeeNote.registration.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this attendee note.");
  }

  return {
    userId,
    membership,
    attendeeNote,
    registration: attendeeNote.registration,
    event
  };
}

export async function requireStoreProductAccess(productId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const storeProduct = await getStoreProductTenant(productId);

  if (!storeProduct) {
    throw new Error("Store product not found.");
  }

  const event = storeProduct.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this store product.");
  }

  return {
    userId,
    membership,
    storeProduct,
    event
  };
}

export async function requireOrderAccess(
  orderId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: OrganizationAccessOptions = {}
) {
  const userId = await requireDashboardUser();
  const order = await getOrderTenant(orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  const event = order.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles, options)) {
    throw new Error("You do not have permission to manage this order.");
  }

  return {
    userId,
    membership,
    order,
    event
  };
}

export async function requireHotelBlockAccess(blockId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const hotelBlock = await getHotelBlockTenant(blockId);

  if (!hotelBlock) {
    throw new Error("Hotel block not found.");
  }

  const event = hotelBlock.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this hotel block.");
  }

  return {
    userId,
    membership,
    hotelBlock,
    event
  };
}

export async function requireHotelBookingAccess(bookingId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const hotelBooking = await getHotelBookingTenant(bookingId);

  if (!hotelBooking) {
    throw new Error("Hotel booking not found.");
  }

  const event = hotelBooking.block.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this hotel booking.");
  }

  return {
    userId,
    membership,
    hotelBooking,
    event
  };
}

export async function requireDepartmentAccess(departmentId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const department = await getDepartmentTenant(departmentId);

  if (!department || department.orgId !== department.event.orgId || department.eventId !== department.event.id) {
    throw new Error("Department not found.");
  }

  const event = department.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this department.");
  }

  return {
    userId,
    membership,
    department,
    event
  };
}

export async function requireStaffRoleAccess(roleId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireDashboardUser();
  const staffRole = await getStaffRoleTenant(roleId);

  if (
    !staffRole ||
    staffRole.orgId !== staffRole.department.orgId ||
    staffRole.department.orgId !== staffRole.department.event.orgId ||
    staffRole.department.eventId !== staffRole.department.event.id
  ) {
    throw new Error("Staff role not found.");
  }

  const event = staffRole.department.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this staff role.");
  }

  return {
    userId,
    membership,
    staffRole,
    department: staffRole.department,
    event
  };
}

export async function requireVolunteerApplicationAccess(
  applicationId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]
) {
  const userId = await requireDashboardUser();
  const volunteerApplication = await getVolunteerApplicationTenant(applicationId);

  if (
    !volunteerApplication ||
    volunteerApplication.orgId !== volunteerApplication.department.orgId ||
    volunteerApplication.eventId !== volunteerApplication.department.eventId ||
    volunteerApplication.department.orgId !== volunteerApplication.department.event.orgId ||
    volunteerApplication.department.eventId !== volunteerApplication.department.event.id
  ) {
    throw new Error("Volunteer application not found.");
  }

  const event = volunteerApplication.department.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this volunteer application.");
  }

  return {
    userId,
    membership,
    volunteerApplication,
    department: volunteerApplication.department,
    event
  };
}

export async function requireStaffAssignmentAccess(
  assignmentId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]
) {
  const userId = await requireDashboardUser();
  const staffAssignment = await getStaffAssignmentTenant(assignmentId);

  if (
    !staffAssignment ||
    staffAssignment.orgId !== staffAssignment.role.orgId ||
    staffAssignment.role.orgId !== staffAssignment.role.department.orgId ||
    staffAssignment.role.department.orgId !== staffAssignment.role.department.event.orgId ||
    staffAssignment.role.department.eventId !== staffAssignment.role.department.event.id
  ) {
    throw new Error("Staff assignment not found.");
  }

  const event = staffAssignment.role.department.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this staff assignment.");
  }

  return {
    userId,
    membership,
    staffAssignment,
    staffRole: staffAssignment.role,
    department: staffAssignment.role.department,
    event
  };
}

export async function requireVendorApplicationAccess(
  applicationId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]
) {
  const userId = await requireDashboardUser();
  const vendorApplication = await getVendorApplicationTenant(applicationId);

  if (
    !vendorApplication ||
    vendorApplication.orgId !== vendorApplication.event.orgId ||
    vendorApplication.eventId !== vendorApplication.event.id
  ) {
    throw new Error("Vendor application not found.");
  }

  const event = vendorApplication.event;
  const membership = await getOrgMembership(userId, event.orgId);

  if (!hasAllowedOrgRole(membership, allowedRoles)) {
    throw new Error("You do not have permission to manage this vendor application.");
  }

  return {
    userId,
    membership,
    vendorApplication,
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
