"use server";

import { auth } from "@/lib/auth";
import { sendOrgEmail } from "@/lib/email";
import { prisma, type Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

async function requireEventAccess(orgId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const member = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId: session.user.id,
        orgId
      }
    }
  });

  if (!member || member.role === "MEMBER") {
    throw new Error("You do not have permission to manage staff for this event.");
  }

  return session.user.id;
}

async function findOrCreateUser(email: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  if (existing) {
    if (!existing.name && name) {
      return prisma.user.update({
        where: {
          id: existing.id
        },
        data: {
          name
        }
      });
    }

    return existing;
  }

  return prisma.user.create({
    data: {
      email: normalizedEmail,
      name
    }
  });
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
  const application = await prisma.volunteerApplication.findUniqueOrThrow({
    where: {
      id: applicationId
    },
    include: {
      department: true,
      event: true,
      org: true,
      user: true
    }
  });

  const role = await prisma.staffRole.findFirstOrThrow({
    where: {
      id: roleId,
      departmentId: application.departmentId,
      orgId: application.orgId
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
        roleId: role.id,
        volunteerApplicationId: application.id,
        shiftSlot: jsonInput(shift),
        status: "ASSIGNED"
      }
    });
  });

  await sendOrgEmail(application.org, application.user.email, "volunteer-shift-assignment", {
    eventName: application.event.name,
    volunteerName: application.user.name,
    roleName: role.roleName,
    shiftLabel: shiftLabel(shift)
  });

  return assignment;
}

export async function createDepartment(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      name: z.string().trim().min(2),
      leadUserId: z.string().uuid().optional()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      name: formData.get("name"),
      leadUserId: formData.get("leadUserId") || undefined
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid department.");
  }

  await requireEventAccess(parsed.data.orgId);

  await prisma.department.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      name: parsed.data.name,
      leadUserId: parsed.data.leadUserId,
      formSchema: parseFormSchema(formData.get("formSchema"))
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/staff`);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/staff/departments`);
}

export async function updateDepartmentForm(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));
  const name = z.string().trim().min(2).parse(formData.get("name"));
  const leadUserId = z.string().uuid().optional().parse(formData.get("leadUserId") || undefined);

  await requireEventAccess(orgId);

  await prisma.department.update({
    where: {
      id: departmentId
    },
    data: {
      name,
      leadUserId,
      formSchema: parseFormSchema(formData.get("formSchema"))
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/departments`);
}

export async function deleteDepartment(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));

  await requireEventAccess(orgId);

  await prisma.department.deleteMany({
    where: {
      id: departmentId,
      orgId,
      eventId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/departments`);
}

export async function createStaffRole(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      departmentId: z.string().uuid(),
      roleName: z.string().trim().min(2),
      maxVolunteers: z.coerce.number().int().min(1).optional()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      departmentId: formData.get("departmentId"),
      roleName: formData.get("roleName"),
      maxVolunteers: formData.get("maxVolunteers") || undefined
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid staff role.");
  }

  await requireEventAccess(parsed.data.orgId);
  const shifts = shiftsFromForm(formData);

  await prisma.staffRole.create({
    data: {
      orgId: parsed.data.orgId,
      departmentId: parsed.data.departmentId,
      roleName: parsed.data.roleName,
      maxVolunteers: parsed.data.maxVolunteers,
      shifts
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/staff/schedule`);
}

export async function deleteStaffRole(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const roleId = z.string().uuid().parse(formData.get("roleId"));

  await requireEventAccess(orgId);

  await prisma.staffRole.deleteMany({
    where: {
      id: roleId,
      orgId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}

export async function submitVolunteerApplication(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      departmentId: z.string().uuid(),
      applicantName: z.string().trim().min(1),
      applicantEmail: z.string().email()
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      departmentId: formData.get("departmentId"),
      applicantName: formData.get("applicantName"),
      applicantEmail: formData.get("applicantEmail")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid volunteer application.");
  }

  const department = await prisma.department.findFirstOrThrow({
    where: {
      id: parsed.data.departmentId,
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      event: {
        status: "PUBLISHED"
      }
    }
  });
  const schema = z.array(formFieldSchema).parse(department.formSchema);
  const responses: Record<string, string | boolean> = {};

  for (const field of schema) {
    if (field.type === "checkbox") {
      responses[field.id] = formData.get(`field-${field.id}`) === "true";
    } else {
      const value = String(formData.get(`field-${field.id}`) ?? "").trim();

      if (field.required && value.length === 0) {
        throw new Error(`${field.label} is required.`);
      }

      responses[field.id] = value;
    }
  }

  responses.departmentPreferences = [
    String(formData.get("preference1") ?? "").trim(),
    String(formData.get("preference2") ?? "").trim(),
    String(formData.get("preference3") ?? "").trim()
  ]
    .filter(Boolean)
    .join(" > ");

  const volunteer = await findOrCreateUser(parsed.data.applicantEmail, parsed.data.applicantName);
  const application = await prisma.volunteerApplication.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      departmentId: parsed.data.departmentId,
      userId: volunteer.id,
      formResponses: responses,
      availability: availabilityFromForm(formData)
    }
  });

  redirect(`/${formData.get("orgSlug")}/volunteer?success=${application.id}`);
}

export async function approveApplication(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const roleId = z.string().uuid().parse(formData.get("roleId"));
  const reviewerId = await requireEventAccess(orgId);
  const shift = shiftFromForm(formData);

  await createAssignment(applicationId, roleId, shift);
  await prisma.volunteerApplication.update({
    where: {
      id: applicationId
    },
    data: {
      reviewedById: reviewerId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/applications`);
  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}

export async function rejectApplication(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const reason = String(formData.get("reason") ?? "").trim();
  const reviewerId = await requireEventAccess(orgId);

  const application = await prisma.volunteerApplication.update({
    where: {
      id: applicationId
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
  });

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/applications`);
}

export async function bulkReviewApplications(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const action = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("action"));
  const explicitApplicationIds = formData
    .getAll("applicationId")
    .map((value) => String(value))
    .filter(Boolean);
  const applicationIds =
    explicitApplicationIds.length > 0
      ? explicitApplicationIds
      : z
          .string()
          .parse(formData.get("applicationIds"))
          .split(",")
          .filter(Boolean);
  const reviewerId = await requireEventAccess(orgId);

  if (applicationIds.length === 0) {
    return;
  }

  if (action === "APPROVED") {
    const roleId = z.string().uuid().parse(formData.get("roleId"));
    const shift = shiftFromForm(formData);

    for (const applicationId of applicationIds) {
      await createAssignment(applicationId, roleId, shift);
      await prisma.volunteerApplication.update({
        where: {
          id: applicationId
        },
        data: {
          reviewedById: reviewerId
        }
      });
    }
  } else {
    await prisma.volunteerApplication.updateMany({
      where: {
        id: {
          in: applicationIds
        },
        orgId,
        eventId
      },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date()
      }
    });
  }

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/applications`);
  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}

export async function assignShift(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const roleId = z.string().uuid().parse(formData.get("roleId"));

  await requireEventAccess(orgId);
  await createAssignment(applicationId, roleId, shiftFromForm(formData));

  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}

export async function removeAssignment(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const assignmentId = z.string().uuid().parse(formData.get("assignmentId"));

  await requireEventAccess(orgId);

  await prisma.staffAssignment.update({
    where: {
      id: assignmentId
    },
    data: {
      status: "CANCELLED"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/staff`);
  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}

export async function massEmailDepartment(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const departmentId = z.string().uuid().parse(formData.get("departmentId"));
  const subject = z.string().trim().min(1).parse(formData.get("subject"));
  const message = z.string().trim().min(1).parse(formData.get("message"));

  await requireEventAccess(orgId);

  const department = await prisma.department.findFirstOrThrow({
    where: {
      id: departmentId,
      orgId,
      eventId
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
    });
  }

  revalidatePath(`/dashboard/events/${eventId}/staff/schedule`);
}
