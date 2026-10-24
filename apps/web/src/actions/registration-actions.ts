"use server";

import { requireStaffAssurance } from "@/lib/staff-verification";

import {
  requireAttendeeNoteAccess,
  requireEventAccess,
  requireRegistrationAccess
} from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { createRegistrationTransferRequest } from "@/actions/registration-transfer-actions";
import { markOrderPaid } from "@/lib/fulfillment";
import { assertPortalResourceOrg, getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable, getSePaySettings } from "@/lib/payments/platform";
import { REGISTRATION_PLATFORM_FEE_CENTS, getStripe } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { saveProfileEmergencyContacts } from "@/lib/attendee-profiles";
import { getRegistrationForm, readRegistrationDetails } from "@/lib/registration-form";
import { REGISTRATION_FORM_CHANGED_MESSAGE, registrationFormFingerprint } from "@/lib/public-registration";
import { assertAttendeeAgreements, getCurrentPolicySummaries, PolicyChangedError, writeAgreements } from "@/lib/policy-documents";
import { applyVoucherDiscount, getScheduledPrice } from "@/lib/registration/pricing";
import { queueWebhookEvent } from "@/lib/webhooks";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import {
  assertRegistrationCapacity,
  getRegistrationApprovalStatus,
  registrationReservationStatuses,
  runRegistrationPolicyTransaction
} from "@/lib/registration-policy";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

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
    throw new PublicActionError("Voucher code was not found.");
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new PublicActionError("Voucher code has expired.");
  }

  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    throw new PublicActionError("Voucher code has reached its usage limit.");
  }

  const restrictions = getVoucherRestrictions(voucher.restrictions);

  if (restrictions.tierIds.length > 0 && !restrictions.tierIds.includes(typeId)) {
    throw new PublicActionError("Voucher code is not valid for the selected registration tier.");
  }

  return voucher;
}

export async function createRegistration(_previousState: PublicFormState, formData: FormData): Promise<PublicFormState> {
  try {
    return await createRegistrationInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof PolicyChangedError) {
      return { error: error.message, policiesChanged: true };
    }
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function createRegistrationInner(formData: FormData): Promise<PublicFormState> {
  const context = await getPortalActionContext("/register");
  if (isPortalRedirect(context)) return context;

  const parsed = z
    .object({
      eventId: z.string().uuid(),
      typeId: z.string().uuid(),
      attendeeProfileId: z.string({ error: "Choose who will attend." }).uuid("Choose who will attend."),
      voucherCode: z.string().trim().optional(),
      checkoutMode: z.enum(["stripe", "cart"]).optional()
    })
    .safeParse({
      eventId: formData.get("eventId"),
      typeId: formData.get("typeId"),
      attendeeProfileId: formData.get("attendeeProfileId"),
      voucherCode: formData.get("voucherCode") || undefined,
      checkoutMode: formData.get("checkoutMode") || "stripe"
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration." };
  }

  const event = await prisma.event.findFirst({
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

  if (!event) return { error: "Registration is not available for this event." };
  assertPortalResourceOrg(event.orgId, context.org);
  assertOrganizationActive(event.org.status);
  const account = context.account;
  const profile = await prisma.attendeeProfile.findFirst({
    where: { id: parsed.data.attendeeProfileId, orgId: context.org.id, portalAccountId: account.id }
  });
  if (!profile) return { error: "That attendee is not available." };

  await assertActionRateLimit("payment:registration", `${parsed.data.eventId}:${account.id}`);

  const registrationForm = getRegistrationForm(event.registrationForm);
  const shownFormVersion = formData.get("registrationFormVersion");
  if (typeof shownFormVersion === "string" && shownFormVersion !== registrationFormFingerprint(registrationForm)) {
    return { error: REGISTRATION_FORM_CHANGED_MESSAGE, policiesChanged: true };
  }
  const detailsResult = readRegistrationDetails(registrationForm, formData);
  if (!detailsResult.ok) return { error: detailsResult.error };
  const { details } = detailsResult;

  const type = event.registrationTypes.find((registrationType) => registrationType.id === parsed.data.typeId);

  if (!type) {
    throw new PublicActionError("Registration tier is not available.");
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
  if (voucher) assertPortalResourceOrg(voucher.orgId, context.org);
  const { discount, total } = applyVoucherDiscount(subtotal, voucher);
  const platformFee = total > 0 ? (event.currency === "VND" ? (await getSePaySettings()).registrationFeeVnd : REGISTRATION_PLATFORM_FEE_CENTS) : 0;

  if (parsed.data.checkoutMode !== "cart" && total > 0) {
    await assertPaidCheckoutAvailable(event.orgId, event.currency);
  }

  const restrictions = voucher ? getVoucherRestrictions(voucher.restrictions) : null;

  if (parsed.data.checkoutMode === "cart" && restrictions?.compedRegistration) {
    throw new PublicActionError("Comped registration vouchers can only be used with direct registration checkout.");
  }

  const registration = await runRegistrationPolicyTransaction(async (tx) => {
    await assertRegistrationCapacity(tx, {
      eventId: event.id,
      portalAccountId: account.id,
      attendeeProfileId: profile.id,
      typeId: type.id
    });

    const current = await getCurrentPolicySummaries(tx, { orgId: context.org.id, eventId: event.id });
    assertAttendeeAgreements(current, formData);

    const created = await tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        portalAccountId: account.id,
        attendeeProfileId: profile.id,
        typeId: type.id,
        status: "PENDING",
        approvalStatus: getRegistrationApprovalStatus(event.settings),
        ...(details.responses === null ? {} : { formResponses: details.responses }),
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
    await writeAgreements(tx, {
      orgId: context.org.id, eventId: event.id, registrationId: created.id, current,
      actor: { source: "ATTENDEE", portalAccountId: account.id }
    });
    if (details.contacts !== null) {
      await saveProfileEmergencyContacts(tx, {
        orgId: context.org.id, portalAccountId: account.id, profileId: profile.id,
        submitted: details.contacts, count: registrationForm.contacts.count
      });
    }
    return created;
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.created",
    data: {
      registrationId: registration.id,
      userId: account.id,
      attendeeProfileId: profile.id,
      typeId: type.id,
      status: registration.status
    }
  });

  if (parsed.data.checkoutMode === "cart") {
    const buyerId = account.id;

    const cart = await prisma.cart.upsert({
      where: {
        orgId: context.org.id,
        portalAccountId_eventId: {
          portalAccountId: buyerId,
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
                attendeeName: profile.fullName,
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
        portalAccountId: buyerId,
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
                attendeeName: profile.fullName,
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

    assertPortalResourceOrg(cart.orgId, context.org);
    return { redirectTo: "/store" };
  }

  const order = await prisma.order.create({
    data: {
      orgId: event.orgId,
      portalAccountId: account.id,
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
    return { redirectTo: `/register?success=${registration.id}` };
  }

  const checkout = await prepareOrderCheckout(
    order.id,
    `/register?success=${registration.id}`,
    "/register?cancelled=1"
  );
  return { redirectTo: checkout.checkoutPath };
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
  await requireStaffAssurance();
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
      attendeeProfile: { select: { fullName: true } },
      portalAccount: { select: { id: true, email: true, name: true } }
    }
  });

  await sendOrgEmail(registration.org, registration.portalAccount.email, "registration-confirmation", {
    eventName: registration.event.name,
    attendeeName: registration.attendeeProfile.fullName
  }, registration.event.id);

  revalidatePath(`/dashboard/events/${event.id}/registrations/${authorizedRegistration.id}`);
}

export async function upgradeTier(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const typeId = z.string().uuid().parse(formData.get("typeId"));
  const { registration, event } = await requireRegistrationAccess(registrationId);
  await runRegistrationPolicyTransaction(async (tx) => {
    const current = await tx.registration.findUnique({
      where: { id: registration.id },
      select: { id: true, eventId: true, orgId: true, portalAccountId: true, attendeeProfileId: true, status: true }
    });

    if (!current || current.eventId !== event.id || current.orgId !== event.orgId || ["CANCELLED", "TRANSFERRED"].includes(current.status)) {
      throw new Error("This registration cannot be upgraded.");
    }

    const targetType = await assertRegistrationCapacity(tx, {
      eventId: event.id,
      portalAccountId: current.portalAccountId,
      attendeeProfileId: current.attendeeProfileId,
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
  await createRegistrationTransferRequest(formData);
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
