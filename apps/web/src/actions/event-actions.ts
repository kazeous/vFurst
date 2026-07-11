"use server";

import { auth } from "@/lib/auth";
import { requireEventAccess } from "@/lib/dashboard-access";
import { eventSettingsSchema, mergeCoreEventSettings } from "@/lib/event-settings";
import { dollarsToCents } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const eventSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  venue: z.string().trim().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  requireApproval: z.coerce.boolean().optional(),
  allowTransfers: z.coerce.boolean().optional(),
  maxRegistrationsPerUser: z.coerce.number().int().min(1).max(20).optional()
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
      description: parsed.data.description,
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
    description: formData.get("description"),
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
      description: parsed.data.description,
      venue: parsed.data.venue,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
}

export async function updateEventSettings(formData: FormData) {
  const parsed = eventSettingsSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    description: formData.get("description"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    requireApproval: formData.get("requireApproval") === "on",
    allowTransfers: formData.get("allowTransfers") === "on",
    maxRegistrationsPerUser: formData.get("maxRegistrationsPerUser")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid event settings.");
  }

  const { event: authorizedEvent } = await requireEventAccess(parsed.data.eventId);
  const event = await prisma.event.findUnique({
    where: {
      id: parsed.data.eventId
    },
    select: {
      settings: true
    }
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  await prisma.event.update({
    where: {
      id: parsed.data.eventId
    },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      slug: parsed.data.slug,
      venue: parsed.data.venue || null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      settings: mergeCoreEventSettings(event.settings, {
        requireApproval: parsed.data.requireApproval,
        allowTransfers: parsed.data.allowTransfers,
        maxRegistrationsPerUser: parsed.data.maxRegistrationsPerUser
      })
    }
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${parsed.data.eventId}`);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/settings`);
  revalidatePath(`/dashboard/organizations/${authorizedEvent.orgId}`);
  redirect(`/dashboard/events/${parsed.data.eventId}/settings?saved=1`);
}

export async function createEventWithRegistrationTypes(formData: FormData) {
  const parsed = eventSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    description: formData.get("description"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    requireApproval: formData.get("requireApproval") === "on",
    allowTransfers: formData.get("allowTransfers") !== "off",
    maxRegistrationsPerUser: formData.get("maxRegistrationsPerUser")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid event details.");
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    throw new Error("End date must be after the start date.");
  }

  await requireOrgAccess(parsed.data.orgId);

  const tierNames = formData.getAll("tierName").map((value) => String(value).trim());
  const tierPrices = formData.getAll("tierPrice");
  const tierCapacities = formData.getAll("tierCapacity");
  const publishNow = formData.get("publishNow") === "on";

  const tierInputs = tierNames
    .map((name, index) => ({
      name,
      price: dollarsToCents(tierPrices[index] ?? "0"),
      maxCapacity:
        typeof tierCapacities[index] === "string" && tierCapacities[index].trim() !== ""
          ? Number(tierCapacities[index])
          : null,
      sortOrder: index
    }))
    .filter((tier) => tier.name.length > 0);

  if (tierInputs.length === 0) {
    throw new Error("Create at least one registration tier.");
  }

  const event = await prisma.event.create({
    data: {
      orgId: parsed.data.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      slug: parsed.data.slug,
      venue: parsed.data.venue,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      status: publishNow ? "PUBLISHED" : "DRAFT",
      settings: {
        requireApproval: parsed.data.requireApproval ?? false,
        allowTransfers: parsed.data.allowTransfers ?? true,
        maxRegistrationsPerUser: parsed.data.maxRegistrationsPerUser ?? 1
      },
      registrationTypes: {
        create: tierInputs.map((tier) => ({
          orgId: parsed.data.orgId,
          name: tier.name,
          price: tier.price,
          maxCapacity: tier.maxCapacity,
          sortOrder: tier.sortOrder
        }))
      }
    }
  });

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${event.id}`);
  redirect(`/dashboard/events/${event.id}`);
}

const registrationTypeSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid(),
  typeId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  price: z.coerce.number().int().min(0),
  maxCapacity: z.coerce.number().int().min(1).optional().nullable(),
  scheduledPricing: z.array(
    z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      price: z.coerce.number().int().min(0)
    })
  )
});

function scheduledPricingFromForm(formData: FormData) {
  const starts = formData.getAll("scheduledStart");
  const ends = formData.getAll("scheduledEnd");
  const prices = formData.getAll("scheduledPrice");

  return starts
    .map((startDate, index) => ({
      startDate: String(startDate),
      endDate: String(ends[index] ?? ""),
      price: dollarsToCents(prices[index] ?? "0")
    }))
    .filter((price) => price.startDate && price.endDate);
}

export async function createRegistrationType(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  await requireOrgAccess(orgId);

  const count = await prisma.registrationType.count({
    where: {
      eventId
    }
  });

  const parsed = registrationTypeSchema.safeParse({
    orgId,
    eventId,
    name: formData.get("name"),
    price: dollarsToCents(formData.get("price")),
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    scheduledPricing: scheduledPricingFromForm(formData)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration type.");
  }

  await prisma.registrationType.create({
    data: {
      orgId,
      eventId,
      name: parsed.data.name,
      price: parsed.data.price,
      maxCapacity: parsed.data.maxCapacity,
      scheduledPricing: parsed.data.scheduledPricing,
      sortOrder: count
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/types`);
}

export async function updateRegistrationType(formData: FormData) {
  const parsed = registrationTypeSchema.required({ typeId: true }).safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    typeId: formData.get("typeId"),
    name: formData.get("name"),
    price: dollarsToCents(formData.get("price")),
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    scheduledPricing: scheduledPricingFromForm(formData)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration type.");
  }

  await requireOrgAccess(parsed.data.orgId);

  await prisma.registrationType.update({
    where: {
      id: parsed.data.typeId
    },
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      maxCapacity: parsed.data.maxCapacity,
      scheduledPricing: parsed.data.scheduledPricing
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/registrations/types`);
}

export async function deleteRegistrationType(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const typeId = z.string().uuid().parse(formData.get("typeId"));

  await requireOrgAccess(orgId);

  await prisma.registrationType.delete({
    where: {
      id: typeId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/types`);
}

export async function updateRegistrationTypeOrder(order: Array<{ id: string; sortOrder: number }>) {
  const ids = order.map((item) => item.id);
  const types = await prisma.registrationType.findMany({
    where: {
      id: {
        in: ids
      }
    },
    select: {
      id: true,
      orgId: true,
      eventId: true
    }
  });

  if (types.length === 0) {
    return;
  }

  await requireOrgAccess(types[0]!.orgId);

  await prisma.$transaction(
    order.map((item) =>
      prisma.registrationType.update({
        where: {
          id: item.id
        },
        data: {
          sortOrder: item.sortOrder
        }
      })
    )
  );

  revalidatePath(`/dashboard/events/${types[0]!.eventId}/registrations/types`);
}

const addOnSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid(),
  typeId: z.string().uuid(),
  addOnId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  price: z.coerce.number().int().min(0),
  isComplimentary: z.coerce.boolean(),
  maxQuantity: z.coerce.number().int().min(1).max(99)
});

export async function createAddOnDefinition(formData: FormData) {
  const parsed = addOnSchema.safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    typeId: formData.get("typeId"),
    name: formData.get("name"),
    price: dollarsToCents(formData.get("price")),
    isComplimentary: formData.get("isComplimentary") === "on",
    maxQuantity: formData.get("maxQuantity")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid add-on.");
  }

  await requireOrgAccess(parsed.data.orgId);

  const count = await prisma.addOnDefinition.count({
    where: {
      registrationTypeId: parsed.data.typeId
    }
  });

  await prisma.addOnDefinition.create({
    data: {
      orgId: parsed.data.orgId,
      registrationTypeId: parsed.data.typeId,
      name: parsed.data.name,
      price: parsed.data.price,
      isComplimentary: parsed.data.isComplimentary,
      maxQuantity: parsed.data.maxQuantity,
      sortOrder: count
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/registrations/types`);
}

export async function updateAddOnDefinition(formData: FormData) {
  const parsed = addOnSchema.required({ addOnId: true }).safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    typeId: formData.get("typeId"),
    addOnId: formData.get("addOnId"),
    name: formData.get("name"),
    price: dollarsToCents(formData.get("price")),
    isComplimentary: formData.get("isComplimentary") === "on",
    maxQuantity: formData.get("maxQuantity")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid add-on.");
  }

  await requireOrgAccess(parsed.data.orgId);

  await prisma.addOnDefinition.update({
    where: {
      id: parsed.data.addOnId
    },
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      isComplimentary: parsed.data.isComplimentary,
      maxQuantity: parsed.data.maxQuantity
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/registrations/types`);
}

export async function deleteAddOnDefinition(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const addOnId = z.string().uuid().parse(formData.get("addOnId"));

  await requireOrgAccess(orgId);

  await prisma.addOnDefinition.delete({
    where: {
      id: addOnId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/types`);
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
