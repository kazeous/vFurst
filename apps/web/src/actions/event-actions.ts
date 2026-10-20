"use server";

import {
  requireAddOnDefinitionAccess,
  requireEventAccess,
  requireOrgAccess,
  requireRegistrationTypeAccess
} from "@/lib/dashboard-access";
import { eventSettingsSchema, mergeCoreEventSettings } from "@/lib/event-settings";
import type { ActionFormState } from "@/lib/action-form-state";
import { runActionWithState } from "@/lib/action-state";
import { ExpectedActionError } from "@/lib/public-action-error";
import { parseMoney } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const eventDetailsSchema = z.object({
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
  endDate: z.coerce.date()
});

const createEventSchema = eventDetailsSchema.extend({
  orgId: z.string().uuid(),
  currency: z.enum(["USD", "VND"]).default("USD"),
  requireApproval: z.coerce.boolean().optional(),
  allowTransfers: z.coerce.boolean().optional(),
  maxRegistrationsPerUser: z.coerce.number().int().min(1).max(20).optional()
});

export async function createEvent(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(() => createEventInner(formData));
}

async function createEventInner(formData: FormData) {
  const parsed = createEventSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    currency: formData.get("currency") || "USD"
  });

  if (!parsed.success) {
    throw new ExpectedActionError(parsed.error.issues[0]?.message ?? "Invalid event details.");
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    throw new ExpectedActionError("End date must be after the start date.");
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
      endDate: parsed.data.endDate,
      currency: parsed.data.currency
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
  redirect(`/dashboard/organizations/${parsed.data.orgId}?event=${event.id}`);
}

export async function updateEventSettings(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(() => updateEventSettingsInner(formData));
}

async function updateEventSettingsInner(formData: FormData) {
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
    throw new ExpectedActionError(parsed.error.issues[0]?.message ?? "Invalid event settings.");
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

export async function createEventWithRegistrationTypes(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(() => createEventWithRegistrationTypesInner(formData));
}

async function createEventWithRegistrationTypesInner(formData: FormData) {
  const parsed = createEventSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    description: formData.get("description"),
    slug: formData.get("slug"),
    venue: formData.get("venue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    currency: formData.get("currency") || "USD",
    requireApproval: formData.get("requireApproval") === "on",
    allowTransfers: formData.get("allowTransfers") !== "off",
    maxRegistrationsPerUser: formData.get("maxRegistrationsPerUser")
  });

  if (!parsed.success) {
    throw new ExpectedActionError(parsed.error.issues[0]?.message ?? "Invalid event details.");
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    throw new ExpectedActionError("End date must be after the start date.");
  }

  await requireOrgAccess(parsed.data.orgId);

  const tierNames = formData.getAll("tierName").map((value) => String(value).trim());
  const tierPrices = formData.getAll("tierPrice");
  const tierCapacities = formData.getAll("tierCapacity");
  const publishNow = formData.get("publishNow") === "on";

  const tierInputs = tierNames
    .map((name, index) => ({
      name,
      price: parseMoney(tierPrices[index] ?? "0", parsed.data.currency),
      maxCapacity:
        typeof tierCapacities[index] === "string" && tierCapacities[index].trim() !== ""
          ? Number(tierCapacities[index])
          : null,
      sortOrder: index
    }))
    .filter((tier) => tier.name.length > 0);

  if (tierInputs.length === 0) {
    throw new ExpectedActionError("Create at least one registration tier.");
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
      currency: parsed.data.currency,
      status: publishNow ? "PUBLISHED" : "DRAFT",
      settings: {
        requireApproval: parsed.data.requireApproval ?? false,
        allowTransfers: parsed.data.allowTransfers ?? true,
        maxRegistrationsPerUser: parsed.data.maxRegistrationsPerUser ?? 4
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

function scheduledPricingFromForm(formData: FormData, currency: "USD" | "VND") {
  const starts = formData.getAll("scheduledStart");
  const ends = formData.getAll("scheduledEnd");
  const prices = formData.getAll("scheduledPrice");

  return starts
    .map((startDate, index) => ({
      startDate: String(startDate),
      endDate: String(ends[index] ?? ""),
      price: parseMoney(prices[index] ?? "0", currency)
    }))
    .filter((price) => price.startDate && price.endDate);
}

export async function createRegistrationType(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event } = await requireEventAccess(eventId);

  const count = await prisma.registrationType.count({
    where: {
      eventId: event.id
    }
  });

  const parsed = registrationTypeSchema.safeParse({
    name: formData.get("name"),
    price: parseMoney(formData.get("price"), event.currency),
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    scheduledPricing: scheduledPricingFromForm(formData, event.currency)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration type.");
  }

  await prisma.registrationType.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      name: parsed.data.name,
      price: parsed.data.price,
      maxCapacity: parsed.data.maxCapacity,
      scheduledPricing: parsed.data.scheduledPricing,
      sortOrder: count
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

export async function updateRegistrationType(formData: FormData) {
  const typeId = z.string().uuid().parse(formData.get("typeId"));
  const { registrationType, event } = await requireRegistrationTypeAccess(typeId);
  const parsed = registrationTypeSchema.safeParse({
    name: formData.get("name"),
    price: parseMoney(formData.get("price"), event.currency),
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    scheduledPricing: scheduledPricingFromForm(formData, event.currency)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration type.");
  }

  await prisma.registrationType.update({
    where: {
      id: registrationType.id
    },
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      maxCapacity: parsed.data.maxCapacity,
      scheduledPricing: parsed.data.scheduledPricing
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

export async function deleteRegistrationType(formData: FormData) {
  const typeId = z.string().uuid().parse(formData.get("typeId"));
  const { registrationType, event } = await requireRegistrationTypeAccess(typeId);

  await prisma.registrationType.delete({
    where: {
      id: registrationType.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

const registrationTypeOrderSchema = z
  .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) }))
  .max(100)
  .refine((order) => new Set(order.map((item) => item.id)).size === order.length, "Registration tiers must be unique.");

export async function updateRegistrationTypeOrder(eventId: string, order: Array<{ id: string; sortOrder: number }>) {
  const authorizedEventId = z.string().uuid().parse(eventId);
  const parsedOrder = registrationTypeOrderSchema.parse(order);

  if (parsedOrder.length === 0) {
    return;
  }

  const { event } = await requireEventAccess(authorizedEventId);
  const ids = parsedOrder.map((item) => item.id);
  const typeCount = await prisma.registrationType.count({
    where: {
      eventId: event.id,
      id: {
        in: ids
      }
    }
  });

  if (typeCount !== ids.length) {
    throw new Error("One or more registration tiers do not belong to this event.");
  }

  await prisma.$transaction(
    parsedOrder.map((item) =>
      prisma.registrationType.updateMany({
        where: {
          id: item.id,
          eventId: event.id
        },
        data: {
          sortOrder: item.sortOrder
        }
      })
    )
  );

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

const addOnSchema = z.object({
  name: z.string().trim().min(1),
  price: z.coerce.number().int().min(0),
  isComplimentary: z.coerce.boolean(),
  maxQuantity: z.coerce.number().int().min(1).max(99)
});

export async function createAddOnDefinition(formData: FormData) {
  const typeId = z.string().uuid().parse(formData.get("typeId"));
  const { registrationType, event } = await requireRegistrationTypeAccess(typeId);
  const parsed = addOnSchema.safeParse({
    name: formData.get("name"),
    price: parseMoney(formData.get("price"), event.currency),
    isComplimentary: formData.get("isComplimentary") === "on",
    maxQuantity: formData.get("maxQuantity")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid add-on.");
  }

  const count = await prisma.addOnDefinition.count({
    where: {
      registrationTypeId: registrationType.id
    }
  });

  await prisma.addOnDefinition.create({
    data: {
      orgId: event.orgId,
      registrationTypeId: registrationType.id,
      name: parsed.data.name,
      price: parsed.data.price,
      isComplimentary: parsed.data.isComplimentary,
      maxQuantity: parsed.data.maxQuantity,
      sortOrder: count
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

export async function updateAddOnDefinition(formData: FormData) {
  const addOnId = z.string().uuid().parse(formData.get("addOnId"));
  const { addOnDefinition, event } = await requireAddOnDefinitionAccess(addOnId);
  const parsed = addOnSchema.safeParse({
    name: formData.get("name"),
    price: parseMoney(formData.get("price"), event.currency),
    isComplimentary: formData.get("isComplimentary") === "on",
    maxQuantity: formData.get("maxQuantity")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid add-on.");
  }

  await prisma.addOnDefinition.update({
    where: {
      id: addOnDefinition.id
    },
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      isComplimentary: parsed.data.isComplimentary,
      maxQuantity: parsed.data.maxQuantity
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

export async function deleteAddOnDefinition(formData: FormData) {
  const addOnId = z.string().uuid().parse(formData.get("addOnId"));
  const { addOnDefinition, event } = await requireAddOnDefinitionAccess(addOnId);

  await prisma.addOnDefinition.delete({
    where: {
      id: addOnDefinition.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/types`);
}

export async function publishEvent(formData: FormData) {
  await updateEventStatus(formData, "PUBLISHED");
}

export async function archiveEvent(formData: FormData) {
  await updateEventStatus(formData, "ARCHIVED");
}

export async function deleteEvent(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event } = await requireEventAccess(eventId);

  await prisma.event.delete({
    where: {
      id: event.id
    }
  });

  revalidatePath(`/dashboard/organizations/${event.orgId}`);
}

async function updateEventStatus(formData: FormData, status: "PUBLISHED" | "ARCHIVED") {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event } = await requireEventAccess(eventId);

  await prisma.event.update({
    where: {
      id: event.id
    },
    data: {
      status
    }
  });

  revalidatePath(`/dashboard/organizations/${event.orgId}`);
  revalidatePath(`/dashboard/events/${event.id}`);
}
