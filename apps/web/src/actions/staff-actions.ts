"use server";

import { getConventionOrg } from "@/lib/convention";
import { assertPortalResourceOrg, getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import {
  requireDepartmentAccess,
  requireEventAccess,
  requireStaffAssignmentAccess,
  requireStaffRoleAccess,
  requireVolunteerApplicationAccess
} from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import { prisma, type Prisma } from "@vfurst/db";
import { assertPortalAccountEmail, syncPortalAccountName } from "@/lib/portal-account";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

const formFieldSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["text", "select", "checkbox", "textarea"]),
  label: z.string().trim().min(1),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1)).optional()
});

const availabilitySchema = z.object({
  date: z.string().trim().min(1),
  slots: z.array(z.string().trim().min(1))
});

const shiftSlotSchema = z.object({
  date: z.string().trim().min(1),
  startTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  label: z.string().trim().min(1)
});

type ShiftSlot = z.infer<typeof shiftSlotSchema>;

async function assertLeadBelongsToOrg(leadUserId: string | undefined, orgId: string) {
  if (!leadUserId) {
    return;
  }

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId: leadUserId,
        orgId
      }
    },
    select: {
      userId: true
    }
  });

  if (!membership) {
    throw new Error("Department leads must belong to the event organization.");
  }
}

function parseFormSchema(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  const parsed = z.array(formFieldSchema).parse(JSON.parse(raw));
  return parsed.map((field) => ({
    ...field,
    options: field.type === "select" ? field.options ?? [] : undefined
  }));
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value == null ? {} : (value as Prisma.InputJsonValue);
}

function availabilityFromForm(formData: FormData) {
  const dates = formData.getAll("availabilityDate");
  const slots = formData.getAll("availabilitySlots");

  return dates
    .map((date, index) => ({
      date: String(date).trim(),
      slots: String(slots[index] ?? "")
        .split(",")
        .map((slot) => slot.trim())
        .filter(Boolean)
    }))
    .filter((entry) => entry.date.length > 0 && entry.slots.length > 0)
    .map((entry) => availabilitySchema.parse(entry));
}

function shiftFromForm(formData: FormData): ShiftSlot {
  return shiftSlotSchema.parse({
    date: formData.get("shiftDate"),
    startTime: formData.get("shiftStart"),
    endTime: formData.get("shiftEnd"),
    label: formData.get("shiftLabel")
  });
}

function shiftsFromForm(formData: FormData) {
  const dates = formData.getAll("shiftDate");
  const starts = formData.getAll("shiftStart");
  const ends = formData.getAll("shiftEnd");
  const labels = formData.getAll("shiftLabel");

  return dates
    .map((date, index) => ({
      date: String(date).trim(),
      startTime: String(starts[index] ?? "").trim(),
      endTime: String(ends[index] ?? "").trim(),
      label: String(labels[index] ?? "").trim()
    }))
    .filter((shift) => shift.date.length > 0 && shift.startTime.length > 0 && shift.endTime.length > 0)
    .map((shift) => shiftSlotSchema.parse({ ...shift, label: shift.label || `${shift.startTime}-${shift.endTime}` }));
}

function shiftLabel(shift: ShiftSlot) {
  return `${shift.label} on ${shift.date}, ${shift.startTime}-${shift.endTime}`;
}

function parseShift(value: unknown): ShiftSlot | null {
  const parsed = shiftSlotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function shiftsConflict(left: ShiftSlot, right: ShiftSlot) {
  if (left.date !== right.date) {
    return false;
  }

  return left.startTime < right.endTime && right.startTime < left.endTime;
}

async function assertNoShiftConflict(userId: string, shift: ShiftSlot, ignoreAssignmentId?: string) {
  const assignments = await prisma.staffAssignment.findMany({
    where: {
      userId,
      id: ignoreAssignmentId
        ? {
            not: ignoreAssignmentId
          }
        : undefined,
      status: {
        not: "CANCELLED"
      }
    }
  });

  const conflict = assignments.find((assignment) => {
    const existing = parseShift(assignment.shiftSlot);
    return existing ? shiftsConflict(existing, shift) : false;
  });

  if (conflict) {
    throw new Error("That volunteer is already assigned to an overlapping shift.");
  }
}

async function createAssignment(applicationId: string, roleId: string, shift: ShiftSlot) {
  const [{ volunteerApplication, event }, { staffRole, department }] = await Promise.all([
    requireVolunteerApplicationAccess(applicationId),
    requireStaffRoleAccess(roleId)
  ]);

  if (event.id !== department.eventId || volunteerApplication.departmentId !== department.id) {
    throw new Error("The staff role must belong to the volunteer application's department and event.");
  }

  const application = await prisma.volunteerApplication.findUniqueOrThrow({
    where: {
      id: volunteerApplication.id
    },
    include: {
      department: true,
      event: true,
      org: true,
      user: true
    }
  });

  await assertNoShiftConflict(application.userId, shift);

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.volunteerApplication.update({
      where: {
        id: application.id
      },
      data: {
        status: "APPROVED",
        reviewedAt: new Date()
      }
    });

    return tx.staffAssignment.create({
      data: {
        orgId: application.orgId,
        userId: application.userId,
        roleId: staffRole.id,
        volunteerApplicationId: application.id,
        shiftSlot: jsonInput(shift),
        status: "ASSIGNED"
      }
    });
  });

  await sendOrgEmail(application.org, application.user.email, "volunteer-shift-assignment", {
    eventName: application.event.name,
    volunteerName: application.user.name,
    roleName: staffRole.roleName,
    shiftLabel: shiftLabel(shift)
  }, application.event.id);

  return { application, assignment, event };
}

export async function createDepartment(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      name: z.string().trim().min(2),
      leadUserId: z.string().uuid().optional()
    })
    .safeParse({
      eventId: formData.get("eventId"),
      name: formData.get("name"),
      leadUserId: formData.get("leadUserId") || undefined
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid department.");
  }

  const { event } = await requireEventAccess(parsed.data.eventId);
  await assertLeadBelongsToOrg(parsed.data.leadUserId, event.orgId);

  await prisma.department.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      name: parsed.data.name,
      leadUserId: parsed.data.leadUserId,
      formSchema: parseFormSchema(formData.get("formSchema"))
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/departments`);
}

export async function updateDepartmentForm(formData: FormData) {
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));
  const name = z.string().trim().min(2).parse(formData.get("name"));
  const leadUserId = z.string().uuid().optional().parse(formData.get("leadUserId") || undefined);
  const { department, event } = await requireDepartmentAccess(departmentId);
  await assertLeadBelongsToOrg(leadUserId, event.orgId);

  await prisma.department.update({
    where: {
      id: department.id
    },
    data: {
      name,
      leadUserId,
      formSchema: parseFormSchema(formData.get("formSchema"))
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/departments`);
}

export async function deleteDepartment(formData: FormData) {
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));
  const { department, event } = await requireDepartmentAccess(departmentId);

  await prisma.department.delete({
    where: {
      id: department.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/departments`);
}

export async function createStaffRole(formData: FormData) {
  const parsed = z
    .object({
      departmentId: z.string().uuid(),
      roleName: z.string().trim().min(2),
      maxVolunteers: z.coerce.number().int().min(1).optional()
    })
    .safeParse({
      departmentId: formData.get("departmentId"),
      roleName: formData.get("roleName"),
      maxVolunteers: formData.get("maxVolunteers") || undefined
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid staff role.");
  }

  const { department, event } = await requireDepartmentAccess(parsed.data.departmentId);
  const shifts = shiftsFromForm(formData);

  await prisma.staffRole.create({
    data: {
      orgId: event.orgId,
      departmentId: department.id,
      roleName: parsed.data.roleName,
      maxVolunteers: parsed.data.maxVolunteers,
      shifts
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function deleteStaffRole(formData: FormData) {
  const roleId = z.string().uuid().parse(formData.get("roleId"));
  const { staffRole, event } = await requireStaffRoleAccess(roleId);

  await prisma.staffRole.delete({
    where: {
      id: staffRole.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function submitVolunteerApplication(
  _previousState: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  try {
    return await submitVolunteerApplicationInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function submitVolunteerApplicationInner(formData: FormData): Promise<PublicFormState> {
  const context = await getPortalActionContext("/volunteer");
  if (isPortalRedirect(context)) return context;
  const parsed = z
    .object({
      orgSlug: z.string().trim().min(1),
      departmentId: z.string().uuid(),
      applicantName: z.string().trim().min(1),
      applicantEmail: z.string().email()
    })
    .safeParse({
      orgSlug: formData.get("orgSlug"),
      departmentId: formData.get("departmentId"),
      applicantName: formData.get("applicantName"),
      applicantEmail: formData.get("applicantEmail")
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid volunteer application." };
  }

  const org = await getConventionOrg(parsed.data.orgSlug);

  if (!org) {
    throw new PublicActionError("Organization not found.");
  }
  assertPortalResourceOrg(org.id, context.org);

  const event = await prisma.event.findFirstOrThrow({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    }
  });
  const department = await prisma.department.findFirstOrThrow({
    where: {
      id: parsed.data.departmentId,
      orgId: org.id,
      eventId: event.id
    }
  });
  assertPortalResourceOrg(event.orgId, context.org);
  assertPortalResourceOrg(department.orgId, context.org);
  const schema = z.array(formFieldSchema).parse(department.formSchema);
  const responses: Record<string, string | boolean> = {};

  for (const field of schema) {
    if (field.type === "checkbox") {
      responses[field.id] = formData.get(`field-${field.id}`) === "true";
    } else {
      const value = String(formData.get(`field-${field.id}`) ?? "").trim();

      if (field.required && value.length === 0) {
        throw new PublicActionError(`${field.label} is required.`);
      }

      responses[field.id] = value;
    }
  }

  responses.departmentPreferences = [
    department.name,
    String(formData.get("preference2") ?? "").trim(),
    String(formData.get("preference3") ?? "").trim()
  ]
    .filter(Boolean)
    .join(" > ");

  assertPortalAccountEmail(context.account, parsed.data.applicantEmail);
  const account = await syncPortalAccountName(context.account, parsed.data.applicantName);
  const application = await prisma.volunteerApplication.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      departmentId: department.id,
      portalAccountId: account.id,
      formResponses: responses,
      availability: availabilityFromForm(formData)
    }
  });

  return { redirectTo: `/volunteer?success=${application.id}` };
}

export async function approveApplication(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const roleId = z.string().uuid().parse(formData.get("roleId"));
  const { userId: reviewerId, volunteerApplication, event } = await requireVolunteerApplicationAccess(applicationId);
  const shift = shiftFromForm(formData);

  const { application } = await createAssignment(volunteerApplication.id, roleId, shift);
  await prisma.volunteerApplication.update({
    where: {
      id: volunteerApplication.id
    },
    data: {
      reviewedById: reviewerId
    }
  });

  await sendOrgEmail(application.org, application.user.email, "volunteer-application-decision", {
    eventName: application.event.name,
    applicantName: application.user.name,
    status: "APPROVED",
    reason: null
  }, application.event.id);

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/applications`);
  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function rejectApplication(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const reason = String(formData.get("reason") ?? "").trim();
  const { userId: reviewerId, volunteerApplication, event } = await requireVolunteerApplicationAccess(applicationId);

  const application = await prisma.volunteerApplication.update({
    where: {
      id: volunteerApplication.id
    },
    data: {
      status: "REJECTED",
      reviewedById: reviewerId,
      reviewedAt: new Date()
    },
    include: {
      event: true,
      org: true,
      user: true
    }
  });

  await sendOrgEmail(application.org, application.user.email, "volunteer-application-decision", {
    eventName: application.event.name,
    applicantName: application.user.name,
    status: "REJECTED",
    reason
  }, application.event.id);

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/applications`);
}

export async function bulkReviewApplications(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const action = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("action"));
  const explicitApplicationIds = formData
    .getAll("applicationId")
    .map((value) => String(value))
    .filter(Boolean);
  const rawApplicationIds =
    explicitApplicationIds.length > 0
      ? explicitApplicationIds
      : z
          .string()
          .parse(formData.get("applicationIds"))
          .split(",")
          .filter(Boolean);
  const applicationIds = [...new Set(z.array(z.string().uuid()).parse(rawApplicationIds))];
  const { userId: reviewerId, event } = await requireEventAccess(eventId);

  if (applicationIds.length === 0) {
    return;
  }

  const applications = await prisma.volunteerApplication.findMany({
    where: {
      id: {
        in: applicationIds
      },
      orgId: event.orgId,
      eventId: event.id
    },
    select: {
      id: true,
      departmentId: true,
      event: true,
      org: true,
      user: true
    }
  });

  if (applications.length !== applicationIds.length) {
    throw new Error("Every volunteer application must belong to this event.");
  }

  if (action === "APPROVED") {
    const roleId = z.string().uuid().parse(formData.get("roleId"));
    const shift = shiftFromForm(formData);
    const { staffRole, department, event: roleEvent } = await requireStaffRoleAccess(roleId);

    if (roleEvent.id !== event.id || applications.some((application) => application.departmentId !== department.id)) {
      throw new Error("The staff role must belong to every volunteer application's department and event.");
    }

    for (const applicationId of applicationIds) {
      const { application } = await createAssignment(applicationId, staffRole.id, shift);
      await prisma.volunteerApplication.update({
        where: {
          id: applicationId
        },
        data: {
          reviewedById: reviewerId
        }
      });
      await sendOrgEmail(application.org, application.user.email, "volunteer-application-decision", {
        eventName: application.event.name,
        applicantName: application.user.name,
        status: "APPROVED",
        reason: null
      }, application.event.id);
    }
  } else {
    await prisma.volunteerApplication.updateMany({
      where: {
        id: {
          in: applicationIds
        },
        orgId: event.orgId,
        eventId: event.id
      },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date()
      }
    });
    for (const application of applications) {
      await sendOrgEmail(application.org, application.user.email, "volunteer-application-decision", {
        eventName: application.event.name,
        applicantName: application.user.name,
        status: "REJECTED",
        reason: null
      }, application.event.id);
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/applications`);
  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function assignShift(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const roleId = z.string().uuid().parse(formData.get("roleId"));

  const { event } = await createAssignment(applicationId, roleId, shiftFromForm(formData));

  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function removeAssignment(formData: FormData) {
  const assignmentId = z.string().uuid().parse(formData.get("assignmentId"));
  const { staffAssignment, event } = await requireStaffAssignmentAccess(assignmentId);

  await prisma.staffAssignment.update({
    where: {
      id: staffAssignment.id
    },
    data: {
      status: "CANCELLED"
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/staff`);
  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}

export async function massEmailDepartment(formData: FormData) {
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));
  const subject = z.string().trim().min(1).parse(formData.get("subject"));
  const message = z.string().trim().min(1).parse(formData.get("message"));
  const { department: authorizedDepartment, event } = await requireDepartmentAccess(departmentId);

  const department = await prisma.department.findFirstOrThrow({
    where: {
      id: authorizedDepartment.id
    },
    include: {
      event: true,
      org: true,
      roles: {
        include: {
          assignments: {
            where: {
              status: {
                not: "CANCELLED"
              }
            },
            include: {
              user: true
            }
          }
        }
      }
    }
  });

  const recipients = new Map<string, { email: string; name: string | null }>();

  for (const role of department.roles) {
    for (const assignment of role.assignments) {
      recipients.set(assignment.userId, {
        email: assignment.user.email,
        name: assignment.user.name
      });
    }
  }

  for (const recipient of recipients.values()) {
    await sendOrgEmail(department.org, recipient.email, "staff-message", {
      eventName: department.event.name,
      subject,
      message
    }, department.event.id);
  }

  revalidatePath(`/dashboard/events/${event.id}/staff/schedule`);
}
