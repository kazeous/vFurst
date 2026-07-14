"use server";

import { auth } from "@/lib/auth";
import {
  requireAttendeeNoteAccess,
  requireEventAccess,
  requireRegistrationAccess
} from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/fulfillment";
import { getConventionPortalRootForRequest } from "@/lib/convention";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable, getSePaySettings } from "@/lib/payments/platform";
import { REGISTRATION_PLATFORM_FEE_CENTS, getBaseUrl, getStripe } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { applyVoucherDiscount, getScheduledPrice } from "@/lib/registration/pricing";
import { queueWebhookEvent } from "@/lib/webhooks";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function findOrCreateAttendee(email: string, name: string) {
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

async function requireCartUserId() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

function getVoucherRestrictions(value: unknown) {
  if (!value || typeof value !== "object") {
    return { tierIds: [] as string[], compedRegistration: false };
  }

  const restrictions = value as { tierIds?: unknown; compedRegistration?: unknown };

  return {
    tierIds: Array.isArray(restrictions.tierIds) ? restrictions.tierIds.filter((tierId): tierId is string => typeof tierId === "string") : [],
    compedRegistration: restrictions.compedRegistration === true
  };
}

async function getValidVoucher(event: { id: string; orgId: string }, code: string | null, typeId: string) {
  if (!code) {
    return null;
  }

  const voucher = await prisma.voucher.findUnique({
    where: {
      eventId_code: {
        eventId: event.id,
        code: code.trim().toUpperCase()
      }
    }
  });

  if (!voucher || voucher.orgId !== event.orgId || voucher.eventId !== event.id) {
    throw new Error("Voucher code was not found.");
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new Error("Voucher code has expired.");
  }

  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    throw new Error("Voucher code has reached its usage limit.");
  }

  const restrictions = getVoucherRestrictions(voucher.restrictions);

  if (restrictions.tierIds.length > 0 && !restrictions.tierIds.includes(typeId)) {
    throw new Error("Voucher code is not valid for the selected registration tier.");
  }

  return voucher;
}

export async function createRegistration(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      typeId: z.string().uuid(),
      attendeeName: z.string().trim().min(1),
      attendeeEmail: z.string().email(),
      voucherCode: z.string().trim().optional(),
      checkoutMode: z.enum(["stripe", "cart"]).optional()
    })
    .safeParse({
      eventId: formData.get("eventId"),
      typeId: formData.get("typeId"),
      attendeeName: formData.get("attendeeName"),
      attendeeEmail: formData.get("attendeeEmail"),
      voucherCode: formData.get("voucherCode") || undefined,
      checkoutMode: formData.get("checkoutMode") || "stripe"
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration.");
  }

  await assertActionRateLimit("payment:registration", `${parsed.data.eventId}:${parsed.data.attendeeEmail.toLowerCase()}`);

  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: parsed.data.eventId,
      status: "PUBLISHED"
    },
    include: {
      org: true,
      registrationTypes: {
        include: {
          addOns: {
            orderBy: {
              sortOrder: "asc"
            }
          },
          registrations: true
        }
      }
    }
  });

  assertOrganizationActive(event.org.status);
  const portalRoot = await getConventionPortalRootForRequest(event.org);

  const type = event.registrationTypes.find((registrationType) => registrationType.id === parsed.data.typeId);

  if (!type) {
    throw new Error("Registration tier is not available.");
  }

  if (type.maxCapacity != null && type.registrations.filter((registration) => registration.status !== "CANCELLED").length >= type.maxCapacity) {
    throw new Error("That registration tier is sold out.");
  }

  const selectedAddOns = type.addOns
    .map((addOn) => {
      const quantityValue = formData.get(`addon-${addOn.id}`);
      const quantity = typeof quantityValue === "string" && quantityValue !== "" ? Number(quantityValue) : 0;

      return {
        ...addOn,
        quantity: Math.max(0, Math.min(Number.isFinite(quantity) ? quantity : 0, addOn.maxQuantity))
      };
    })
    .filter((addOn) => addOn.quantity > 0);

  const registrationPrice = getScheduledPrice(type.price, type.scheduledPricing);
  const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + (addOn.isComplimentary ? 0 : addOn.price) * addOn.quantity, 0);
  const subtotal = registrationPrice + addOnTotal;
  const voucher = await getValidVoucher(event, parsed.data.voucherCode ?? null, type.id);
  const { discount, total } = applyVoucherDiscount(subtotal, voucher);
  const platformFee = total > 0 ? (event.currency === "VND" ? (await getSePaySettings()).registrationFeeVnd : REGISTRATION_PLATFORM_FEE_CENTS) : 0;

  if (parsed.data.checkoutMode !== "cart" && total > 0) {
    await assertPaidCheckoutAvailable(event.orgId, event.currency);
  }

  const attendee = await findOrCreateAttendee(parsed.data.attendeeEmail, parsed.data.attendeeName);

  const registration = await prisma.registration.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      userId: attendee.id,
      typeId: type.id,
      status: "PENDING",
      addOns: {
        create: selectedAddOns.map((addOn) => ({
          orgId: event.orgId,
          addOnDefinitionId: addOn.id,
          price: addOn.isComplimentary ? 0 : addOn.price,
          quantity: addOn.quantity
        }))
      }
    }
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.created",
    data: {
      registrationId: registration.id,
      userId: attendee.id,
      typeId: type.id,
      status: registration.status
    }
  });

  if (parsed.data.checkoutMode === "cart") {
    const buyerId = await requireCartUserId();
    const restrictions = voucher ? getVoucherRestrictions(voucher.restrictions) : null;

    if (restrictions?.compedRegistration) {
      throw new Error("Comped registration vouchers can only be used with direct registration checkout.");
    }

    await prisma.cart.upsert({
      where: {
        userId_eventId: {
          userId: buyerId,
          eventId: event.id
        }
      },
      update: {
        voucherId: voucher?.id,
        items: {
          create: [
            {
              orgId: event.orgId,
              itemType: "REGISTRATION",
              refId: registration.id,
              unitPrice: registrationPrice,
              quantity: 1,
              metadata: {
                attendeeName: attendee.name,
                attendeeEmail: attendee.email,
                registrationType: type.name
              }
            },
            ...selectedAddOns.map((addOn) => ({
              orgId: event.orgId,
              itemType: "ADDON" as const,
              refId: addOn.id,
              unitPrice: addOn.isComplimentary ? 0 : addOn.price,
              quantity: addOn.quantity,
              metadata: {
                registrationId: registration.id,
                addOnName: addOn.name
              }
            }))
          ]
        }
      },
      create: {
        orgId: event.orgId,
        eventId: event.id,
        userId: buyerId,
        voucherId: voucher?.id,
        items: {
          create: [
            {
              orgId: event.orgId,
              itemType: "REGISTRATION",
              refId: registration.id,
              unitPrice: registrationPrice,
              quantity: 1,
              metadata: {
                attendeeName: attendee.name,
                attendeeEmail: attendee.email,
                registrationType: type.name
              }
            },
            ...selectedAddOns.map((addOn) => ({
              orgId: event.orgId,
              itemType: "ADDON" as const,
              refId: addOn.id,
              unitPrice: addOn.isComplimentary ? 0 : addOn.price,
              quantity: addOn.quantity,
              metadata: {
                registrationId: registration.id,
                addOnName: addOn.name
              }
            }))
          ]
        }
      }
    });

    revalidatePath(`${portalRoot}/store`);
    redirect(`${portalRoot}/store`);
  }

  const order = await prisma.order.create({
    data: {
      orgId: event.orgId,
      userId: attendee.id,
      eventId: event.id,
      total,
      platformFee,
      currency: event.currency,
      voucherId: voucher?.id,
      items: {
        create: [
          {
            orgId: event.orgId,
            itemType: "REGISTRATION",
            refId: registration.id,
            registrationId: registration.id,
            unitPrice: Math.max(registrationPrice - discount, 0),
            quantity: 1
          },
          ...selectedAddOns.map((addOn) => ({
            orgId: event.orgId,
            itemType: "ADDON" as const,
            refId: addOn.id,
            unitPrice: addOn.isComplimentary ? 0 : addOn.price,
            quantity: addOn.quantity,
            registrationId: registration.id
          }))
        ]
      }
    }
  });

  if (total === 0) {
    await markOrderPaid(order.id);
    redirect(`${portalRoot}/register?success=${registration.id}`);
  }

  const checkout = await prepareOrderCheckout(
    order.id,
    `/${event.org.subdomain}/register?success=${registration.id}`,
    `/${event.org.subdomain}/register?cancelled=1`
  );
  redirect(`${getBaseUrl()}${checkout.checkoutPath}`);
}

export async function confirmRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const { registration, event } = await requireRegistrationAccess(registrationId);

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      status: "CONFIRMED"
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

export async function cancelRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const { registration, event } = await requireRegistrationAccess(registrationId);

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      status: "CANCELLED"
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

const registrationIdListSchema = z
  .array(z.string().uuid())
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, "Registration IDs must be unique.");

export async function bulkUpdateRegistrations(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const action = z.enum(["CONFIRMED", "CANCELLED"]).parse(formData.get("action"));
  const registrationIds = registrationIdListSchema.parse(
    z.string().parse(formData.get("registrationIds")).split(",").filter(Boolean)
  );
  const { event } = await requireEventAccess(eventId);

  if (registrationIds.length === 0) {
    return;
  }

  const registrationCount = await prisma.registration.count({
    where: {
      id: {
        in: registrationIds
      },
      eventId: event.id
    }
  });

  if (registrationCount !== registrationIds.length) {
    throw new Error("One or more registrations do not belong to this event.");
  }

  await prisma.registration.updateMany({
    where: {
      id: {
        in: registrationIds
      },
      eventId: event.id,
      orgId: event.orgId
    },
    data: {
      status: action
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
}

export async function refundRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const { userId, registration, event } = await requireRegistrationAccess(
    registrationId,
    ["OWNER", "ADMIN"],
    { allowInactive: true }
  );
  await assertActionRateLimit("payment:registration-refund", `${userId}:${registration.id}`);

  const orderItem = await prisma.orderItem.findFirst({
    where: {
      registrationId: registration.id,
      order: {
        eventId: event.id,
        orgId: event.orgId
      }
    },
    include: {
      order: true
    }
  });

  if (orderItem?.order.stripePaymentIntentId && orderItem.order.total > 0) {
    await getStripe().refunds.create({
      payment_intent: orderItem.order.stripePaymentIntentId
    });
  }

  await prisma.$transaction([
    prisma.registration.update({
      where: {
        id: registration.id
      },
      data: {
        status: "CANCELLED"
      }
    }),
    ...(orderItem
      ? [
          prisma.order.update({
            where: {
              id: orderItem.orderId
            },
            data: {
              status: "REFUNDED"
            }
          })
        ]
      : [])
  ]);

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

export async function resendRegistrationEmail(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const { registration: authorizedRegistration, event } = await requireRegistrationAccess(registrationId);

  const registration = await prisma.registration.findUniqueOrThrow({
    where: {
      id: authorizedRegistration.id
    },
    include: {
      event: true,
      org: true,
      user: true
    }
  });

  await sendOrgEmail(registration.org, registration.user.email, "registration-confirmation", {
    eventName: registration.event.name,
    attendeeName: registration.user.name
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/${authorizedRegistration.id}`);
}

export async function upgradeTier(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const typeId = z.string().uuid().parse(formData.get("typeId"));
  const { registration, event } = await requireRegistrationAccess(registrationId);
  const targetType = await prisma.registrationType.findFirst({
    where: {
      id: typeId,
      eventId: event.id
    },
    select: {
      id: true
    }
  });

  if (!targetType) {
    throw new Error("Registration tier does not belong to this event.");
  }

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      typeId: targetType.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

export async function transferRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const attendeeName = z.string().trim().min(1).parse(formData.get("attendeeName"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const { registration: source, event } = await requireRegistrationAccess(registrationId);
  const attendee = await findOrCreateAttendee(attendeeEmail, attendeeName);

  await prisma.$transaction([
    prisma.registration.update({
      where: {
        id: source.id
      },
      data: {
        status: "TRANSFERRED"
      }
    }),
    prisma.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: attendee.id,
        typeId: source.typeId,
        status: "CONFIRMED",
        transferredFromId: source.id
      }
    })
  ]);

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
}

export async function createAttendeeNote(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const content = z.string().trim().min(1).parse(formData.get("content"));
  const { userId: authorId, registration, event } = await requireRegistrationAccess(registrationId);

  await prisma.attendeeNote.create({
    data: {
      orgId: event.orgId,
      registrationId: registration.id,
      authorId,
      content
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

export async function deleteAttendeeNote(formData: FormData) {
  const noteId = z.string().uuid().parse(formData.get("noteId"));
  const { attendeeNote, registration, event } = await requireAttendeeNoteAccess(noteId);

  await prisma.attendeeNote.delete({
    where: {
      id: attendeeNote.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}
