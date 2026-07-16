"use server";

import { badgeQueue } from "@/lib/badge-queue";
import { createRegistrationTransferRequest } from "@/actions/registration-transfer-actions";
import {
  requireBadgeAccess,
  requireBadgeTemplateAccess,
  requireEventAccess as requireStoredEventAccess,
  requireRaffleAccess,
  requireRegistrationAccess,
  requireRegistrationTypeAccess
} from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { getSePaySettings } from "@/lib/payments/platform";
import { REGISTRATION_PLATFORM_FEE_CENTS } from "@/lib/payments/stripe";
import { parseMoney } from "@/lib/registration/pricing";
import {
  assertRegistrationCapacity,
  assertTransfersAllowed,
  getRegistrationApprovalStatus,
  registrationReservationStatuses,
  runRegistrationPolicyTransaction
} from "@/lib/registration-policy";
import {
  assertDrawEligibility,
  assertRaffleEligibility,
  parseRafflePrizes,
  raffleEligibilitySchema,
  rafflePrizeSchema,
  runRaffleTransaction,
  validateRaffleEligibilityResources,
  weightedWinner,
  type RaffleEligibility
} from "@/lib/raffle-policy";
import { queueWebhookEvent } from "@/lib/webhooks";
import { prisma, type Prisma } from "@vfurst/db";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
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

function parseRaffleEligibilityForm(formData: FormData): RaffleEligibility {
  const kind = z
    .enum(["CONFIRMED_REGISTRATION", "CHECKED_IN", "REGISTRATION_TIER", "REGISTRATION_ADD_ON", "PURCHASED"])
    .parse(formData.get("eligibilityKind"));

  const value = {
    kind,
    typeId: formData.get("eligibilityTypeId"),
    addOnDefinitionId: formData.get("eligibilityAddOnDefinitionId"),
    productId: formData.get("eligibilityProductId"),
    entriesPerUnit: Number(formData.get("entriesPerUnit") ?? 1)
  };

  return raffleEligibilitySchema.parse(value);
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
      approvalStatus: "APPROVED",
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

  if (registration.approvalStatus !== "APPROVED") {
    throw new Error("This registration still requires organizer approval before check-in.");
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
  const result = await runRegistrationPolicyTransaction(async (tx) => {
    const attendee = await findOrCreateUser(parsed.data.attendeeEmail, parsed.data.attendeeName, tx);
    await assertRegistrationCapacity(tx, {
      eventId: event.id,
      userId: attendee.id,
      typeId: registrationType.id
    });

    const registration = await tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: attendee.id,
        typeId: registrationType.id,
        status: "CHECKED_IN",
        approvalStatus: getRegistrationApprovalStatus(event.settings, "CASHIER"),
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
  await createRegistrationTransferRequest(formData);
}

export async function adminTransferRegistration(formData: FormData) {
  const registrationId = z.string().uuid().parse(formData.get("registrationId"));
  const attendeeName = z.string().trim().min(1).parse(formData.get("attendeeName"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const { registration: source, event } = await requireRegistrationAccess(registrationId);
  assertTransfersAllowed(event.settings);

  const result = await runRegistrationPolicyTransaction(async (tx) => {
    const current = await tx.registration.findUnique({
      where: { id: source.id },
      include: { addOns: true, badges: true }
    });

    if (!current || current.eventId !== event.id || current.orgId !== event.orgId) {
      throw new Error("This registration is no longer eligible for transfer.");
    }

    const attendee = await findOrCreateUser(attendeeEmail, attendeeName, tx);
    await assertRegistrationCapacity(tx, {
      eventId: event.id,
      userId: attendee.id,
      typeId: current.typeId,
      excludeRegistrationId: current.id
    });

    const moved = await tx.registration.updateMany({
      where: {
        id: current.id,
        eventId: event.id,
        orgId: event.orgId,
        status: { in: [...registrationReservationStatuses] }
      },
      data: { status: "TRANSFERRED", badgeNumber: null }
    });

    if (moved.count !== 1) {
      throw new Error("This registration is no longer eligible for transfer.");
    }

    const registration = await tx.registration.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        userId: attendee.id,
        typeId: current.typeId,
        status: "CONFIRMED",
        approvalStatus: getRegistrationApprovalStatus(event.settings, "TRANSFER"),
        badgeNumber: current.badgeNumber,
        transferredFromId: current.id
      }
    });

    await tx.registrationAddOn.updateMany({
      where: { registrationId: current.id, orgId: event.orgId },
      data: { registrationId: registration.id }
    });

    const badgeJobs: Array<{ id: string; templateId: string }> = [];
    for (const badge of current.badges) {
      const changed = await tx.badge.update({
        where: { id: badge.id },
        data: {
          registrationId: registration.id,
          barcodeData: `VF-${registration.id}-${randomBytes(8).toString("hex")}`,
          nfcTag: null,
          pdfUrl: null,
          zplData: null,
          generatedAt: null,
          printedAt: null
        },
        select: { id: true, templateId: true }
      });
      badgeJobs.push(changed);
    }

    await tx.registrationTransferRequest.updateMany({
      where: { sourceRegistrationId: current.id, status: "PENDING" },
      data: { status: "CANCELLED" }
    });

    return { registrationId: registration.id, badgeJobs };
  });

  for (const badge of result.badgeJobs) {
    try {
      await badgeQueue.add("generate-badges", {
        orgId: event.orgId,
        eventId: event.id,
        templateId: badge.templateId,
        badgeIds: [badge.id]
      });
    } catch {
      // The invalidated badge stays pending and can be regenerated from the event badge queue.
    }
  }

  revalidatePath(`/dashboard/events/${event.id}/registrations/transfers`);
  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/account/registrations/${result.registrationId}`);
}

export async function createRaffle(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      name: z.string().trim().min(1),
      drawDate: z.coerce.date(),
      prizes: z.array(rafflePrizeSchema).min(1)
    })
    .safeParse({
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

  const eligibility = parseRaffleEligibilityForm(formData);
  const maxEntriesPerUser = z.coerce.number().int().min(1).max(100).parse(formData.get("maxEntriesPerUser"));
  const { event } = await requireStoredEventAccess(parsed.data.eventId);

  await runRaffleTransaction(async (tx) => {
    await validateRaffleEligibilityResources(tx, {
      orgId: event.orgId,
      eventId: event.id,
      eligibility
    });
    return tx.raffle.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        name: parsed.data.name,
        drawDate: parsed.data.drawDate,
        maxEntriesPerUser,
        eligibility: eligibility as Prisma.InputJsonValue,
        prizes: parsed.data.prizes as Prisma.InputJsonValue
      }
    });
  });

  revalidatePath(`/dashboard/events/${event.id}/raffle`);
}

export async function addRaffleEntry(formData: FormData) {
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));
  const attendeeEmail = z.string().email().parse(formData.get("attendeeEmail"));
  const attendeeName = z.string().trim().optional().parse(formData.get("attendeeName") || undefined);
  const { raffle, event } = await requireRaffleAccess(raffleId);

  await runRaffleTransaction(async (tx) => {
    const user = await findOrCreateUser(attendeeEmail, attendeeName ?? attendeeEmail, tx);
    const existing = await tx.raffleEntry.findFirst({
      where: {
        raffleId: raffle.id,
        userId: user.id,
        entryMethod: { in: ["AUTO", "MANUAL"] }
      }
    });

    if (existing) {
      return existing;
    }

    await assertRaffleEligibility(tx, {
      raffleId: raffle.id,
      orgId: event.orgId,
      eventId: event.id,
      userId: user.id,
      entryMethod: "MANUAL"
    });

    return tx.raffleEntry.create({
      data: {
        orgId: event.orgId,
        raffleId: raffle.id,
        userId: user.id,
        entryMethod: "MANUAL",
        quantity: 1
      }
    });
  });

  revalidatePath(`/dashboard/events/${event.id}/raffle`);
}

export async function autoEnterConfirmedRegistrations(formData: FormData) {
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));
  const { raffle, event } = await requireRaffleAccess(raffleId);

  await runRaffleTransaction(async (tx) => {
    const registrations = await tx.registration.findMany({
      where: {
        orgId: event.orgId,
        eventId: event.id,
        approvalStatus: "APPROVED",
        status: { in: ["CONFIRMED", "CHECKED_IN"] }
      },
      select: { userId: true },
      distinct: ["userId"]
    });

    for (const registration of registrations) {
      const existing = await tx.raffleEntry.findFirst({
        where: {
          raffleId: raffle.id,
          userId: registration.userId,
          entryMethod: { in: ["AUTO", "MANUAL"] }
        }
      });
      if (existing) continue;

      try {
        await assertRaffleEligibility(tx, {
          raffleId: raffle.id,
          orgId: event.orgId,
          eventId: event.id,
          userId: registration.userId,
          entryMethod: "AUTO"
        });
      } catch {
        continue;
      }

      await tx.raffleEntry.create({
        data: {
          orgId: event.orgId,
          raffleId: raffle.id,
          userId: registration.userId,
          entryMethod: "AUTO",
          quantity: 1
        }
      });
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/raffle`);
}

export async function drawRaffleWinner(formData: FormData) {
  const raffleId = z.string().uuid().parse(formData.get("raffleId"));
  const prizeName = z.string().trim().min(1).parse(formData.get("prizeName"));
  const { raffle: authorizedRaffle, event } = await requireRaffleAccess(raffleId);

  const result = await runRaffleTransaction(async (tx) => {
    const raffle = await tx.raffle.findFirstOrThrow({
      where: { id: authorizedRaffle.id, orgId: event.orgId, eventId: event.id },
      include: {
        entries: { where: { orgId: event.orgId, quantity: { gt: 0 } }, include: { user: true, orderItem: true } },
        org: true,
        event: true
      }
    });
    const parsedPrizes = parseRafflePrizes(raffle.prizes);
    const selectedPrize = parsedPrizes.find((prize) => prize.name === prizeName);
    if (!selectedPrize) throw new Error("The selected prize does not belong to this raffle.");

    const awardedCount = await tx.raffleDrawResult.count({ where: { raffleId: raffle.id, prizeName: selectedPrize.name } });
    if (awardedCount >= selectedPrize.quantity) {
      throw new Error("All available quantities of this prize have already been awarded.");
    }

    const previousWinners = new Set(
      (await tx.raffleDrawResult.findMany({ where: { raffleId: raffle.id }, select: { winnerUserId: true } })).map(
        (item) => item.winnerUserId
      )
    );
    const eligibleByUser = new Map<string, { user: typeof raffle.entries[number]["user"]; quantity: number }>();
    for (const entry of raffle.entries) {
      if (previousWinners.has(entry.userId)) continue;
      if (!(await assertDrawEligibility(tx, {
        raffleId: raffle.id,
        orgId: event.orgId,
        eventId: event.id,
        userId: entry.userId,
        entryMethod: entry.entryMethod,
        orderItemId: entry.orderItemId ?? undefined
      }))) continue;
      const current = eligibleByUser.get(entry.userId);
      eligibleByUser.set(entry.userId, {
        user: entry.user,
        quantity: (current?.quantity ?? 0) + entry.quantity
      });
    }

    const winner = weightedWinner(Array.from(eligibleByUser.values()));
    if (!winner) throw new Error("This raffle has no eligible entries remaining.");

    const draw = await tx.raffleDrawResult.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        raffleId: raffle.id,
        prizeName: selectedPrize.name,
        awardNumber: awardedCount + 1,
        winnerUserId: winner.user.id
      }
    });
    return { draw, raffle, prize: selectedPrize, winner: winner.user };
  });

  try {
    await sendOrgEmail(result.raffle.org, result.winner.email, "staff-message", {
      eventName: result.raffle.event.name,
      subject: `You won ${result.prize.name}`,
      message: `Congratulations! You were drawn as a winner for ${result.prize.name} in ${result.raffle.name}.`
    });
    await prisma.raffleDrawResult.update({ where: { id: result.draw.id }, data: { notifiedAt: new Date() } });
  } catch {
    // The durable result remains visible in the attendee account and can be notified by operations later.
  }

  revalidatePath(`/dashboard/events/${event.id}/raffle`);
}

export async function saveEmailTemplate(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const templateKey = z
    .enum(["registration-confirmation", "payment-receipt", "volunteer-approval", "vendor-status", "transfer-request"])
    .parse(formData.get("templateKey"));
  const template = emailTemplateSchema.parse({
    subject: formData.get("subject"),
    html: formData.get("html"),
    text: formData.get("text")
  });

  const { event: authorizedEvent } = await requireStoredEventAccess(eventId);
  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: authorizedEvent.id,
      orgId: authorizedEvent.orgId
    },
    select: {
      id: true,
      settings: true
    }
  });
  const settings = parseEventSettings(event.settings);
  const emailTemplates = parseEmailTemplates(event.settings);

  await prisma.event.update({
    where: {
      id: event.id
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

  revalidatePath(`/dashboard/events/${event.id}/settings/emails`);
}
