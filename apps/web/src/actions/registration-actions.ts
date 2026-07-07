"use server";

import { auth } from "@/lib/auth";
import { sendOrgEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/fulfillment";
import { REGISTRATION_PLATFORM_FEE_CENTS, getBaseUrl, getConnectedStripeAccount, getStripe } from "@/lib/payments/stripe";
import { applyVoucherDiscount, getScheduledPrice } from "@/lib/registration/pricing";
import { queueWebhookEvent } from "@/lib/webhooks";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
    throw new Error("You do not have permission to manage registrations for this event.");
  }

  return session.user.id;
}

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

async function getValidVoucher(eventId: string, code: string | null, typeId: string) {
  if (!code) {
    return null;
  }

  const voucher = await prisma.voucher.findUnique({
    where: {
      eventId_code: {
        eventId,
        code: code.trim().toUpperCase()
      }
    }
  });

  if (!voucher) {
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
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      typeId: z.string().uuid(),
      attendeeName: z.string().trim().min(1),
      attendeeEmail: z.string().email(),
      voucherCode: z.string().trim().optional(),
      checkoutMode: z.enum(["stripe", "cart"]).optional()
    })
    .safeParse({
      orgId: formData.get("orgId"),
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
      orgId: parsed.data.orgId,
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

  const type = event.registrationTypes.find((registrationType) => registrationType.id === parsed.data.typeId);

  if (!type) {
    throw new Error("Registration tier is not available.");
  }

  if (type.maxCapacity != null && type.registrations.filter((registration) => registration.status !== "CANCELLED").length >= type.maxCapacity) {
    throw new Error("That registration tier is sold out.");
  }

  const attendee = await findOrCreateAttendee(parsed.data.attendeeEmail, parsed.data.attendeeName);
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
  const voucher = await getValidVoucher(event.id, parsed.data.voucherCode ?? null, type.id);
  const { discount, total } = applyVoucherDiscount(subtotal, voucher);
  const platformFee = total > 0 ? REGISTRATION_PLATFORM_FEE_CENTS : 0;

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

    revalidatePath(`/${event.org.subdomain}/store`);
    redirect(`/${event.org.subdomain}/store`);
  }

  const order = await prisma.order.create({
    data: {
      orgId: event.orgId,
      userId: attendee.id,
      eventId: event.id,
      total,
      platformFee,
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
    redirect(`/${event.org.subdomain}/register?success=${registration.id}`);
  }

  const connectedAccountId = await getConnectedStripeAccount(event.orgId);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: attendee.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${event.name} registration`
          },
          unit_amount: total
        },
        quantity: 1
      }
    ],
    payment_intent_data: {
      application_fee_amount: platformFee,
      transfer_data: {
        destination: connectedAccountId
      },
      metadata: {
        orderId: order.id,
        registrationId: registration.id,
        eventId: event.id,
        orgId: event.orgId
      }
    },
    metadata: {
      orderId: order.id,
      registrationId: registration.id,
      eventId: event.id,
      orgId: event.orgId
    },
    success_url: `${getBaseUrl()}/${event.org.subdomain}/register?success=${registration.id}`,
    cancel_url: `${getBaseUrl()}/${event.org.subdomain}/register?cancelled=1`
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  redirect(session.url);
}

export async function confirmRegistration(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));

  await requireEventAccess(orgId);

  await prisma.registration.update({
    where: {
      id: registrationId
    },
    data: {
      status: "CONFIRMED"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations`);
  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function cancelRegistration(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));

  await requireEventAccess(orgId);

  await prisma.registration.update({
    where: {
      id: registrationId
    },
    data: {
      status: "CANCELLED"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations`);
  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function bulkUpdateRegistrations(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const action = z.enum(["CONFIRMED", "CANCELLED"]).parse(formData.get("action"));
  const registrationIds = z
    .string()
    .parse(formData.get("registrationIds"))
    .split(",")
    .filter(Boolean);

  await requireEventAccess(orgId);

  if (registrationIds.length === 0) {
    return;
  }

  await prisma.registration.updateMany({
    where: {
      id: {
        in: registrationIds
      },
      eventId,
      orgId
    },
    data: {
      status: action
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations`);
}

export async function refundRegistration(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));

  await requireEventAccess(orgId);

  const orderItem = await prisma.orderItem.findFirst({
    where: {
      registrationId
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
        id: registrationId
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

  revalidatePath(`/dashboard/events/${eventId}/registrations`);
  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function resendRegistrationEmail(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));

  await requireEventAccess(orgId);

  const registration = await prisma.registration.findUniqueOrThrow({
    where: {
      id: registrationId
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

  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function upgradeTier(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const typeId = z.string().uuid().parse(formData.get("typeId"));

  await requireEventAccess(orgId);

  await prisma.registration.update({
    where: {
      id: registrationId
    },
    data: {
      typeId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function transferRegistration(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const attendeeName = z.string().trim().min(1).parse(formData.get("attendeeName"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));

  await requireEventAccess(orgId);

  const source = await prisma.registration.findUniqueOrThrow({
    where: {
      id: registrationId
    }
  });
  const attendee = await findOrCreateAttendee(attendeeEmail, attendeeName);

  await prisma.$transaction([
    prisma.registration.update({
      where: {
        id: registrationId
      },
      data: {
        status: "TRANSFERRED"
      }
    }),
    prisma.registration.create({
      data: {
        orgId,
        eventId,
        userId: attendee.id,
        typeId: source.typeId,
        status: "CONFIRMED",
        transferredFromId: registrationId
      }
    })
  ]);

  revalidatePath(`/dashboard/events/${eventId}/registrations`);
}

export async function createAttendeeNote(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const content = z.string().trim().min(1).parse(formData.get("content"));
  const authorId = await requireEventAccess(orgId);

  await prisma.attendeeNote.create({
    data: {
      orgId,
      registrationId,
      authorId,
      content
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}

export async function deleteAttendeeNote(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const noteId = z.string().uuid().parse(formData.get("noteId"));

  await requireEventAccess(orgId);

  await prisma.attendeeNote.delete({
    where: {
      id: noteId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/${registrationId}`);
}
