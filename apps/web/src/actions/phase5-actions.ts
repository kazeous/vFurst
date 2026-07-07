"use server";

import { auth } from "@/lib/auth";
import { badgeQueue } from "@/lib/badge-queue";
import { sendOrgEmail } from "@/lib/email";
import { REGISTRATION_PLATFORM_FEE_CENTS } from "@/lib/payments/stripe";
import { dollarsToCents } from "@/lib/registration/pricing";
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
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
      name: z.string().trim().min(1),
      layout: badgeLayoutSchema,
      defaultTypeIds: z.array(z.string().uuid())
    })
    .safeParse({
      orgId: formData.get("orgId"),
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

  await requireEventAccess(parsed.data.orgId);

  const dimensions = {
    width: parsed.data.layout.width,
    height: parsed.data.layout.height,
    units: "pt"
  };

  const template = parsed.data.templateId
    ? await prisma.badgeTemplate.update({
        where: {
          id: parsed.data.templateId
        },
        data: {
          name: parsed.data.name,
          layout: parsed.data.layout as Prisma.InputJsonValue,
          dimensions
        }
      })
    : await prisma.badgeTemplate.create({
        data: {
          orgId: parsed.data.orgId,
          eventId: parsed.data.eventId,
          name: parsed.data.name,
          layout: parsed.data.layout as Prisma.InputJsonValue,
          dimensions
        }
      });

  const event = await prisma.event.findUniqueOrThrow({
    where: {
      id: parsed.data.eventId
    }
  });
  const settings = parseEventSettings(event.settings);
  const badgeDefaults = {
    ...(typeof settings.badgeDefaults === "object" && settings.badgeDefaults && !Array.isArray(settings.badgeDefaults)
      ? (settings.badgeDefaults as Record<string, string>)
      : {})
  };

  for (const typeId of parsed.data.defaultTypeIds) {
    badgeDefaults[typeId] = template.id;
  }

  await prisma.event.update({
    where: {
      id: parsed.data.eventId
    },
    data: {
      settings: {
        ...settings,
        defaultBadgeTemplateId: template.id,
        badgeDefaults
      } as Prisma.InputJsonValue
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/badges`);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/badges/designer`);
}

export async function generateBadgesForEvent(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const templateId = z.string().uuid().parse(formData.get("templateId"));

  await requireEventAccess(orgId);

  const registrations = await prisma.registration.findMany({
    where: {
      orgId,
      eventId,
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

  for (const registration of registrations) {
    if (registration.badges.length > 0) {
      continue;
    }

    await prisma.badge.create({
      data: {
        orgId,
        registrationId: registration.id,
        templateId,
        barcodeData: badgeBarcode(registration.id)
      }
    });
  }

  try {
    await badgeQueue.add("generate-badges", {
      orgId,
      eventId,
      templateId
    });
  } catch {
    // Badge rows are created synchronously; the worker render job can be retried from the queue once Redis is available.
  }

  revalidatePath(`/dashboard/events/${eventId}/badges`);
}

export async function reprintBadge(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const badgeId = z.string().uuid().parse(formData.get("badgeId"));

  await requireEventAccess(orgId);

  await prisma.badge.update({
    where: {
      id: badgeId
    },
    data: {
      printedAt: new Date()
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/badges`);
  revalidatePath(`/dashboard/events/${eventId}/check-in`);
}

export async function checkInRegistration(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));

  await requireEventAccess(orgId);

  await prisma.registration.update({
    where: {
      id: registrationId
    },
    data: {
      status: "CHECKED_IN",
      checkedInAt: new Date()
    }
  });

  await queueWebhookEvent({
    orgId,
    eventId,
    type: "registration.checked_in",
    data: {
      registrationId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/check-in`);
  revalidatePath(`/dashboard/events/${eventId}/check-in/express`);
  revalidatePath(`/dashboard/events/${eventId}/registrations`);
}

export async function createWalkInRegistration(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      typeId: z.string().uuid(),
      attendeeName: z.string().trim().min(1),
      attendeeEmail: z.string().email(),
      paymentMode: z.enum(["cash", "card"]),
      amount: z.coerce.number().min(0)
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      typeId: formData.get("typeId"),
      attendeeName: formData.get("attendeeName"),
      attendeeEmail: formData.get("attendeeEmail"),
      paymentMode: formData.get("paymentMode"),
      amount: dollarsToCents(formData.get("amount"))
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid walk-in registration.");
  }

  await requireEventAccess(parsed.data.orgId);
  const attendee = await findOrCreateUser(parsed.data.attendeeEmail, parsed.data.attendeeName);
  const event = await prisma.event.findUniqueOrThrow({
    where: {
      id: parsed.data.eventId
    },
    include: {
      badgeTemplates: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });
  const template = event.badgeTemplates[0];

  const registration = await prisma.registration.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      userId: attendee.id,
      typeId: parsed.data.typeId,
      status: "CHECKED_IN",
      checkedInAt: new Date()
    }
  });

  await queueWebhookEvent({
    orgId: parsed.data.orgId,
    eventId: parsed.data.eventId,
    type: "registration.created",
    data: {
      registrationId: registration.id,
      userId: attendee.id,
      typeId: parsed.data.typeId,
      status: registration.status,
      source: "cashier"
    }
  });

  await queueWebhookEvent({
    orgId: parsed.data.orgId,
    eventId: parsed.data.eventId,
    type: "registration.checked_in",
    data: {
      registrationId: registration.id,
      source: "cashier"
    }
  });

  await prisma.order.create({
    data: {
      orgId: parsed.data.orgId,
      userId: attendee.id,
      eventId: parsed.data.eventId,
      total: parsed.data.amount,
      platformFee: parsed.data.amount > 0 ? REGISTRATION_PLATFORM_FEE_CENTS : 0,
      status: parsed.data.paymentMode === "cash" ? "PAID" : "PENDING",
      items: {
        create: {
          orgId: parsed.data.orgId,
          itemType: "REGISTRATION",
          refId: registration.id,
          registrationId: registration.id,
          unitPrice: parsed.data.amount,
          quantity: 1,
          metadata: {
            paymentMode: parsed.data.paymentMode,
            source: "cashier"
          }
        }
      }
    }
  });

  if (template) {
    await prisma.badge.create({
      data: {
        orgId: parsed.data.orgId,
        registrationId: registration.id,
        templateId: template.id,
        barcodeData: badgeBarcode(registration.id),
        printedAt: new Date()
      }
    });
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/check-in`);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/check-in/cashier`);
}

export async function requestRegistrationTransfer(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const recipientEmail = z.string().email().parse(formData.get("recipientEmail"));

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

  await sendOrgEmail(registration.org, recipientEmail, "staff-message", {
    eventName: registration.event.name,
    subject: "Registration transfer request",
    message: `${registration.user.name ?? registration.user.email} requested to transfer a registration to ${recipientEmail}. Staff can complete the transfer from the dashboard.`
  });

  revalidatePath(`/dashboard/events/${eventId}/registrations/transfers`);
}

export async function adminTransferRegistration(formData: FormData) {
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
  const attendee = await findOrCreateUser(attendeeEmail, attendeeName);

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

  revalidatePath(`/dashboard/events/${eventId}/registrations/transfers`);
  revalidatePath(`/dashboard/events/${eventId}/registrations`);
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
