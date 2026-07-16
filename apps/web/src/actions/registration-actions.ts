"use server";

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
import { assertPublicAccountEmail, requirePublicAccount, syncPublicAccountName } from "@/lib/public-account";
import {
  assertRegistrationCapacity,
  assertTransfersAllowed,
  getRegistrationApprovalStatus,
  registrationReservationStatuses,
  runRegistrationPolicyTransaction
} from "@/lib/registration-policy";
import { prisma, type Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function findOrCreateTransferRecipient(
  email: string,
  name: string,
  client: Pick<Prisma.TransactionClient, "user"> = prisma
) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await client.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    if (!existing.name && name) {
      return client.user.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }

  return client.user.create({ data: { email: normalizedEmail, name } });
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
          }
        }
      }
    }
  });

  assertOrganizationActive(event.org.status);
  const portalRoot = await getConventionPortalRootForRequest(event.org);
  const attendee = await requirePublicAccount(`/${event.org.subdomain}/register`);
  assertPublicAccountEmail(attendee, parsed.data.attendeeEmail);
  const account = await syncPublicAccountName(attendee, parsed.data.attendeeName);

  await assertActionRateLimit("payment:registration", `${parsed.data.eventId}:${account.id}`);

  const type = event.registrationTypes.find((registrationType) => registrationType.id === parsed.data.typeId);

  if (!type) {
    throw new Error("Registration tier is not available.");
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

  const restrictions = voucher ? getVoucherRestrictions(voucher.restrictions) : null;

  if (parsed.data.checkoutMode === "cart" && restrictions?.compedRegistration) {
    throw new Error("Comped registration vouchers can only be used with direct registration checkout.");
  }

  const registration = await runRegistrationPolicyTransaction(async (tx) => {
    await assertRegistrationCapacity(tx, {
      eventId: event.id,
      userId: account.id,
      typeId: type.id
    });

    return tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: account.id,
        typeId: type.id,
        status: "PENDING",
        approvalStatus: getRegistrationApprovalStatus(event.settings),
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
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.created",
    data: {
      registrationId: registration.id,
      userId: account.id,
      typeId: type.id,
      status: registration.status
    }
  });

  if (parsed.data.checkoutMode === "cart") {
    const buyerId = account.id;

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
                attendeeName: account.name,
                attendeeEmail: account.email,
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
                attendeeName: account.name,
                attendeeEmail: account.email,
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
      userId: account.id,
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

  if (registration.status === "CANCELLED" || registration.status === "TRANSFERRED") {
    throw new Error("This registration cannot be approved.");
  }

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      approvalStatus: "APPROVED"
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
  const action = z.enum(["APPROVED", "CANCELLED"]).parse(formData.get("action"));
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

  if (action === "APPROVED") {
    await prisma.registration.updateMany({
      where: {
        id: { in: registrationIds },
        eventId: event.id,
        orgId: event.orgId,
        status: { in: [...registrationReservationStatuses] }
      },
      data: { approvalStatus: "APPROVED" }
    });
  } else {
    await prisma.registration.updateMany({
      where: {
        id: { in: registrationIds },
        eventId: event.id,
        orgId: event.orgId
      },
      data: { status: "CANCELLED" }
    });
  }

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
  await runRegistrationPolicyTransaction(async (tx) => {
    const current = await tx.registration.findUnique({
      where: { id: registration.id },
      select: { id: true, eventId: true, orgId: true, userId: true, status: true }
    });

    if (!current || current.eventId !== event.id || current.orgId !== event.orgId || ["CANCELLED", "TRANSFERRED"].includes(current.status)) {
      throw new Error("This registration cannot be upgraded.");
    }

    const targetType = await assertRegistrationCapacity(tx, {
      eventId: event.id,
      userId: current.userId,
      typeId,
      excludeRegistrationId: current.id,
      enforceUserLimit: false
    });

    await tx.registration.update({
      where: { id: current.id },
      data: { typeId: targetType.type.id }
    });
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/${registration.id}`);
}

export async function transferRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const attendeeName = z.string().trim().min(1).parse(formData.get("attendeeName"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const { registration: source, event } = await requireRegistrationAccess(registrationId);
  assertTransfersAllowed(event.settings);

  await runRegistrationPolicyTransaction(async (tx) => {
    const attendee = await findOrCreateTransferRecipient(attendeeEmail, attendeeName, tx);
    await assertRegistrationCapacity(tx, {
      eventId: event.id,
      userId: attendee.id,
      typeId: source.typeId
    });

    const moved = await tx.registration.updateMany({
      where: {
        id: source.id,
        eventId: event.id,
        orgId: event.orgId,
        status: { in: [...registrationReservationStatuses] }
      },
      data: { status: "TRANSFERRED" }
    });

    if (moved.count !== 1) {
      throw new Error("This registration is no longer eligible for transfer.");
    }

    await tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: attendee.id,
        typeId: source.typeId,
        status: "CONFIRMED",
        approvalStatus: getRegistrationApprovalStatus(event.settings, "TRANSFER"),
        transferredFromId: source.id
      }
    });
  });

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
