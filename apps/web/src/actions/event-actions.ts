"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const eventSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  name: z.string().trim().min(2),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  venue: z.string().trim().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
});

async function requireOrgAccess(orgId: string) {
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
    throw new Error("You do not have permission to manage events for this organization.");
  }
}

export async function createEvent(formData: FormData) {
  const parsed = eventSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid event details.");
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    throw new Error("End date must be after the start date.");
  }

  await requireOrgAccess(parsed.data.orgId);

  const event = await prisma.event.create({
    data: {
      orgId: parsed.data.orgId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      venue: parsed.data.venue,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
  redirect(`/dashboard/organizations/${parsed.data.orgId}?event=${event.id}`);
}

export async function updateEvent(formData: FormData) {
  const parsed = eventSchema.required({ eventId: true }).safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid event details.");
  }

  await requireOrgAccess(parsed.data.orgId);

  await prisma.event.update({
    where: {
      id: parsed.data.eventId
    },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      venue: parsed.data.venue,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
}

export async function publishEvent(formData: FormData) {
  await updateEventStatus(formData, "PUBLISHED");
}

export async function archiveEvent(formData: FormData) {
  await updateEventStatus(formData, "ARCHIVED");
}

export async function deleteEvent(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));

  await requireOrgAccess(orgId);

  await prisma.event.delete({
    where: {
      id: eventId
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}`);
}

async function updateEventStatus(formData: FormData, status: "PUBLISHED" | "ARCHIVED") {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));

  await requireOrgAccess(orgId);

  await prisma.event.update({
    where: {
      id: eventId
    },
    data: {
      status
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}`);
}

