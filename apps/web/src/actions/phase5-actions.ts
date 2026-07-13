"use server";

import { auth } from "@/lib/auth";
import { badgeQueue } from "@/lib/badge-queue";
import {
  requireBadgeAccess,
  requireBadgeTemplateAccess,
  requireEventAccess as requireStoredEventAccess,
  requireRegistrationAccess,
  requireRegistrationTypeAccess
} from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { getSePaySettings } from "@/lib/payments/platform";
import { REGISTRATION_PLATFORM_FEE_CENTS } from "@/lib/payments/stripe";
import { parseMoney } from "@/lib/registration/pricing";
import { queueWebhookEvent } from "@/lib/webhooks";
import { prisma, type Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const badgeElementSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["text", "image", "barcode", "qr"]),
  x: z.coerce.number(),
  y: z.coerce.number(),
  w: z.coerce.number().positive(),
  h: z.coerce.number().positive(),
  field: z.string().trim().optional(),
  value: z.string().trim().optional()
});

const badgeLayoutSchema = z.object({
  width: z.coerce.number().positive(),
  height: z.coerce.number().positive(),
  elements: z.array(badgeElementSchema)
});

const emailTemplateSchema = z.object({
  subject: z.string().trim().min(1),
  html: z.string().trim().min(1),
  text: z.string().trim().min(1)
});

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
    throw new Error("You do not have permission to manage this event.");
  }

  return session.user.id;
}

async function findOrCreateUser(
  email: string,
  name: string,
  client: Pick<Prisma.TransactionClient, "user"> = prisma
) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await client.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  if (existing) {
    if (!existing.name && name) {
      return client.user.update({
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

  return client.user.create({
    data: {
      email: normalizedEmail,
      name
    }
  });
}

function parseEventSettings(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseEmailTemplates(value: unknown) {
  const settings = parseEventSettings(value);
  const rawTemplates = settings.emailTemplates;

  if (!rawTemplates || typeof rawTemplates !== "object" || Array.isArray(rawTemplates)) {
    return {};
  }

  return rawTemplates as Record<string, z.infer<typeof emailTemplateSchema>>;
}

function badgeBarcode(registrationId: string) {
  return `VF-${registrationId.slice(0, 8).toUpperCase()}`;
}

export async function saveBadgeTemplate(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
      name: z.string().trim().min(1),
      layout: badgeLayoutSchema,
      defaultTypeIds: z.array(z.string().uuid())
    })
    .safeParse({
      eventId: formData.get("eventId"),
      templateId: formData.get("templateId") || undefined,
      name: formData.get("name"),
      layout: JSON.parse(String(formData.get("layout") ?? "{}")),
      defaultTypeIds: formData
        .getAll("defaultTypeIds")
        .map(String)
        .filter(Boolean)
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid badge template.");
  }

  const authorized = parsed.data.templateId
    ? await requireBadgeTemplateAccess(parsed.data.templateId)
    : await requireStoredEventAccess(parsed.data.eventId);
  const event = authorized.event;
  const defaultTypeIds = [...new Set(parsed.data.defaultTypeIds)];
  const validDefaultTypes = await prisma.registrationType.count({
    where: {
      id: {
        in: defaultTypeIds
      },
      orgId: event.orgId,
      eventId: event.id
    }
  });

  if (validDefaultTypes !== defaultTypeIds.length) {
    throw new Error("One or more badge defaults do not belong to this event.");
  }

  const dimensions = {
    width: parsed.data.layout.width,
    height: parsed.data.layout.height,
    units: "pt"
  };

  await prisma.$transaction(async (tx) => {
    const template = parsed.data.templateId
      ? await tx.badgeTemplate.update({
          where: {
            id: parsed.data.templateId
          },
          data: {
            name: parsed.data.name,
            layout: parsed.data.layout as Prisma.InputJsonValue,
            dimensions
          }
        })
      : await tx.badgeTemplate.create({
          data: {
            orgId: event.orgId,
            eventId: event.id,
            name: parsed.data.name,
            layout: parsed.data.layout as Prisma.InputJsonValue,
            dimensions
          }
        });

    const storedEvent = await tx.event.findUniqueOrThrow({
      where: {
        id: event.id
      }
    });
    const settings = parseEventSettings(storedEvent.settings);
    const badgeDefaults = {
      ...(typeof settings.badgeDefaults === "object" && settings.badgeDefaults && !Array.isArray(settings.badgeDefaults)
        ? (settings.badgeDefaults as Record<string, string>)
        : {})
    };

    for (const typeId of defaultTypeIds) {
      badgeDefaults[typeId] = template.id;
    }

    await tx.event.update({
      where: {
        id: event.id
      },
      data: {
        settings: {
          ...settings,
          defaultBadgeTemplateId: template.id,
          badgeDefaults
        } as Prisma.InputJsonValue
      }
    });
  });

  revalidatePath(`/dashboard/events/${event.id}/badges`);
  revalidatePath(`/dashboard/events/${event.id}/badges/designer`);
}

export async function generateBadgesForEvent(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const templateId = z.string().uuid().parse(formData.get("templateId"));
  const [{ event }, { badgeTemplate }] = await Promise.all([
    requireStoredEventAccess(eventId),
    requireBadgeTemplateAccess(templateId)
  ]);

  if (badgeTemplate.eventId !== event.id || badgeTemplate.orgId !== event.orgId) {
    throw new Error("Badge template does not belong to this event.");
  }

  const registrations = await prisma.registration.findMany({
    where: {
      orgId: event.orgId,
      eventId: event.id,
      status: {
        in: ["CONFIRMED", "CHECKED_IN"]
      }
    },
    include: {
      badges: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  await prisma.$transaction(
    registrations
      .filter((registration) => registration.badges.length === 0)
      .map((registration) =>
        prisma.badge.create({
          data: {
            orgId: event.orgId,
            registrationId: registration.id,
            templateId: badgeTemplate.id,
            barcodeData: badgeBarcode(registration.id)
          }
        })
      )
  );

  const badges = await prisma.badge.findMany({
    where: {
      orgId: event.orgId,
      templateId: badgeTemplate.id,
      registration: {
        eventId: event.id
      }
    },
    select: {
      id: true
    }
  });

  try {
    await badgeQueue.add("generate-badges", {
      orgId: event.orgId,
      eventId: event.id,
      templateId: badgeTemplate.id,
      badgeIds: badges.map((badge) => badge.id)
    });
  } catch {
    // Badge rows are created synchronously; the worker render job can be retried from the queue once Redis is available.
  }

  revalidatePath(`/dashboard/events/${event.id}/badges`);
}

export async function queueBadgeRender(formData: FormData) {
  const badgeId = z.string().uuid().parse(formData.get("badgeId"));
  const { badge, event } = await requireBadgeAccess(badgeId);

  try {
    await badgeQueue.add("generate-badges", {
      orgId: event.orgId,
      eventId: event.id,
      templateId: badge.templateId,
      badgeIds: [badge.id]
    });
  } catch {
    // The stored badge remains unmodified so operators can safely retry when Redis is available.
  }

  revalidatePath(`/dashboard/events/${event.id}/badges`);
  revalidatePath(`/dashboard/events/${event.id}/check-in`);
}

export async function confirmBadgePrinted(formData: FormData) {
  const badgeId = z.string().uuid().parse(formData.get("badgeId"));
  const { badge, event } = await requireBadgeAccess(badgeId);

  if (!badge.generatedAt || (!badge.pdfUrl && !badge.zplData)) {
    throw new Error("Generate badge output before confirming a print.");
  }

  await prisma.badge.update({
    where: {
      id: badge.id
    },
    data: {
      printedAt: new Date()
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/badges`);
  revalidatePath(`/dashboard/events/${event.id}/check-in`);
  revalidatePath(`/dashboard/events/${event.id}/check-in/express`);
}

export async function checkInRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const { registration, event } = await requireRegistrationAccess(registrationId);

  if (registration.status === "CANCELLED" || registration.status === "TRANSFERRED") {
    throw new Error("This registration is not eligible for check-in.");
  }

  if (registration.status === "CHECKED_IN") {
    return;
  }

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      status: "CHECKED_IN",
      checkedInAt: new Date()
    }
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.checked_in",
    data: {
      registrationId: registration.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/check-in`);
  revalidatePath(`/dashboard/events/${event.id}/check-in/express`);
  revalidatePath(`/dashboard/events/${event.id}/registrations`);
}

export async function createWalkInRegistration(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      typeId: z.string().uuid(),
      attendeeName: z.string().trim().min(1),
      attendeeEmail: z.string().email(),
      paymentMode: z.enum(["cash", "card"])
    })
    .safeParse({
      eventId: formData.get("eventId"),
      typeId: formData.get("typeId"),
      attendeeName: formData.get("attendeeName"),
      attendeeEmail: formData.get("attendeeEmail"),
      paymentMode: formData.get("paymentMode")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid walk-in registration.");
  }

  const [{ event: authorizedEvent }, { registrationType }] = await Promise.all([
    requireStoredEventAccess(parsed.data.eventId),
    requireRegistrationTypeAccess(parsed.data.typeId)
  ]);

  if (registrationType.eventId !== authorizedEvent.id || registrationType.event.orgId !== authorizedEvent.orgId) {
    throw new Error("Registration type does not belong to this event.");
  }

  const amount = parseMoney(formData.get("amount"), authorizedEvent.currency);
  const platformFee =
    amount > 0
      ? authorizedEvent.currency === "VND"
        ? (await getSePaySettings()).registrationFeeVnd
        : REGISTRATION_PLATFORM_FEE_CENTS
      : 0;
  const event = await prisma.event.findUniqueOrThrow({
    where: {
      id: authorizedEvent.id
    },
    include: {
      badgeTemplates: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });
  const settings = parseEventSettings(event.settings);
  const badgeDefaults =
    typeof settings.badgeDefaults === "object" && settings.badgeDefaults && !Array.isArray(settings.badgeDefaults)
      ? (settings.badgeDefaults as Record<string, string>)
      : {};
  const preferredTemplateId = badgeDefaults[registrationType.id] ??
    (typeof settings.defaultBadgeTemplateId === "string" ? settings.defaultBadgeTemplateId : undefined);
  const template = event.badgeTemplates.find((candidate) => candidate.id === preferredTemplateId) ?? event.badgeTemplates[0];
  const checkedInAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const attendee = await findOrCreateUser(parsed.data.attendeeEmail, parsed.data.attendeeName, tx);
    const registration = await tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: attendee.id,
        typeId: registrationType.id,
        status: "CHECKED_IN",
        checkedInAt
      }
    });

    const order = await tx.order.create({
      data: {
        orgId: event.orgId,
        userId: attendee.id,
        eventId: event.id,
        total: amount,
        platformFee,
        currency: event.currency,
        status: "PAID",
        items: {
          create: {
            orgId: event.orgId,
            itemType: "REGISTRATION",
            refId: registration.id,
            registrationId: registration.id,
            unitPrice: amount,
            quantity: 1,
            metadata: {
              paymentMode: parsed.data.paymentMode,
              paymentConfirmedAt: checkedInAt.toISOString(),
              source: "cashier"
            }
          }
        }
      }
    });

    const badge = template
      ? await tx.badge.create({
          data: {
            orgId: event.orgId,
            registrationId: registration.id,
            templateId: template.id,
            barcodeData: badgeBarcode(registration.id)
          }
        })
      : null;

    return { attendee, badge, order, registration };
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.created",
    data: {
      registrationId: result.registration.id,
      userId: result.attendee.id,
      typeId: registrationType.id,
      status: result.registration.status,
      source: "cashier"
    }
  });

  await queueWebhookEvent({
    orgId: event.orgId,
    eventId: event.id,
    type: "registration.checked_in",
    data: {
      registrationId: result.registration.id,
      source: "cashier"
    }
  });

  if (result.badge) {
    try {
      await badgeQueue.add("generate-badges", {
        orgId: event.orgId,
        eventId: event.id,
        templateId: result.badge.templateId,
        badgeIds: [result.badge.id]
      });
    } catch {
      // Registration and payment stay committed; staff can retry rendering from the badge queue.
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/badges`);
  revalidatePath(`/dashboard/events/${event.id}/check-in`);
  revalidatePath(`/dashboard/events/${event.id}/check-in/cashier`);
}

export async function requestRegistrationTransfer(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const recipientEmail = z.string().email().parse(formData.get("recipientEmail"));
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

  await sendOrgEmail(registration.org, recipientEmail, "staff-message", {
    eventName: registration.event.name,
    subject: "Registration transfer request",
    message: `${registration.user.name ?? registration.user.email} requested to transfer a registration to ${recipientEmail}. Staff can complete the transfer from the dashboard.`
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations/transfers`);
}

export async function adminTransferRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const attendeeName = z.string().trim().min(1).parse(formData.get("attendeeName"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const { registration: source, event } = await requireRegistrationAccess(registrationId);
  const attendee = await findOrCreateUser(attendeeEmail, attendeeName);

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

  revalidatePath(`/dashboard/events/${event.id}/registrations/transfers`);
  revalidatePath(`/dashboard/events/${event.id}/registrations`);
}

export async function createRaffle(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      name: z.string().trim().min(1),
      drawDate: z.coerce.date(),
      prizes: z.array(
        z.object({
          name: z.string().trim().min(1),
          description: z.string().trim().optional(),
          quantity: z.coerce.number().int().min(1)
        })
      )
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      name: formData.get("name"),
      drawDate: formData.get("drawDate"),
      prizes: String(formData.get("prizes") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name = "", quantity = "1", description = ""] = line.split("|").map((part) => part.trim());
          return {
            name,
            quantity: Number(quantity) || 1,
            description
          };
        })
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid raffle.");
  }

  await requireEventAccess(parsed.data.orgId);

  await prisma.raffle.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      name: parsed.data.name,
      drawDate: parsed.data.drawDate,
      prizes: parsed.data.prizes as Prisma.InputJsonValue
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/raffle`);
}

export async function addRaffleEntry(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const attendeeName = z.string().trim().optional().parse(formData.get("attendeeName") || undefined);

  await requireEventAccess(orgId);
  const user = await findOrCreateUser(attendeeEmail, attendeeName ?? attendeeEmail);

  await prisma.raffleEntry.upsert({
    where: {
      raffleId_userId: {
        raffleId,
        userId: user.id
      }
    },
    update: {
      entryMethod: "MANUAL"
    },
    create: {
      orgId,
      raffleId,
      userId: user.id,
      entryMethod: "MANUAL"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/raffle`);
}

export async function autoEnterConfirmedRegistrations(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));

  await requireEventAccess(orgId);

  const registrations = await prisma.registration.findMany({
    where: {
      orgId,
      eventId,
      status: {
        in: ["CONFIRMED", "CHECKED_IN"]
      }
    },
    select: {
      userId: true
    }
  });

  for (const registration of registrations) {
    await prisma.raffleEntry.upsert({
      where: {
        raffleId_userId: {
          raffleId,
          userId: registration.userId
        }
      },
      update: {},
      create: {
        orgId,
        raffleId,
        userId: registration.userId,
        entryMethod: "AUTO"
      }
    });
  }

  revalidatePath(`/dashboard/events/${eventId}/raffle`);
}

export async function drawRaffleWinner(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));
  const prizeName = z.string().trim().min(1).parse(formData.get("prizeName"));

  await requireEventAccess(orgId);

  const raffle = await prisma.raffle.findUniqueOrThrow({
    where: {
      id: raffleId
    },
    include: {
      entries: {
        include: {
          user: true
        }
      },
      org: true,
      event: true
    }
  });

  if (raffle.entries.length === 0) {
    throw new Error("This raffle does not have any entries yet.");
  }

  const settings = parseEventSettings(raffle.event.settings);
  const raffleHistory = Array.isArray(settings.raffleHistory) ? settings.raffleHistory : [];
  const winner = raffle.entries[Math.floor(Math.random() * raffle.entries.length)]!;
  const nextHistory = [
    ...raffleHistory,
    {
      raffleId,
      raffleName: raffle.name,
      prizeName,
      winnerUserId: winner.userId,
      winnerName: winner.user.name ?? winner.user.email,
      winnerEmail: winner.user.email,
      drawnAt: new Date().toISOString()
    }
  ];

  await prisma.event.update({
    where: {
      id: eventId
    },
    data: {
      settings: {
        ...settings,
        raffleHistory: nextHistory
      } as Prisma.InputJsonValue
    }
  });

  await sendOrgEmail(raffle.org, winner.user.email, "staff-message", {
    eventName: raffle.event.name,
    subject: `You won ${prizeName}`,
    message: `Congratulations! You were drawn as a winner for ${prizeName} in ${raffle.name}.`
  });

  revalidatePath(`/dashboard/events/${eventId}/raffle`);
}

export async function saveEmailTemplate(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const templateKey = z
    .enum(["registration-confirmation", "payment-receipt", "volunteer-approval", "vendor-status", "transfer-request"])
    .parse(formData.get("templateKey"));
  const template = emailTemplateSchema.parse({
    subject: formData.get("subject"),
    html: formData.get("html"),
    text: formData.get("text")
  });

  await requireEventAccess(orgId);

  const event = await prisma.event.findUniqueOrThrow({
    where: {
      id: eventId
    }
  });
  const settings = parseEventSettings(event.settings);
  const emailTemplates = parseEmailTemplates(event.settings);

  await prisma.event.update({
    where: {
      id: eventId
    },
    data: {
      settings: {
        ...settings,
        emailTemplates: {
          ...emailTemplates,
          [templateKey]: template
        }
      } as Prisma.InputJsonValue
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/settings/emails`);
}
