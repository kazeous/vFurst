import { Prisma, prisma, type RaffleEntryMethod } from "@vfurst/db";
import { z } from "zod";

export const raffleEligibilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CONFIRMED_REGISTRATION") }),
  z.object({ kind: z.literal("CHECKED_IN") }),
  z.object({ kind: z.literal("REGISTRATION_TIER"), typeId: z.string().uuid() }),
  z.object({ kind: z.literal("REGISTRATION_ADD_ON"), addOnDefinitionId: z.string().uuid() }),
  z.object({
    kind: z.literal("PURCHASED"),
    productId: z.string().uuid(),
    entriesPerUnit: z.number().int().min(1).max(100).default(1)
  })
]);

export type RaffleEligibility = z.infer<typeof raffleEligibilitySchema>;

export const rafflePrizeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  quantity: z.number().int().min(1).max(1000)
});

export type RafflePrize = z.infer<typeof rafflePrizeSchema>;

export function parseRaffleEligibility(value: unknown): RaffleEligibility {
  const parsed = raffleEligibilitySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("This raffle has an invalid eligibility configuration.");
  }
  return parsed.data;
}

export function parseRafflePrizes(value: unknown): RafflePrize[] {
  const parsed = z.array(rafflePrizeSchema).min(1).safeParse(value);
  if (!parsed.success) {
    throw new Error("This raffle has an invalid prize configuration.");
  }

  const names = parsed.data.map((prize) => prize.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new Error("Prize names must be unique within a raffle.");
  }

  return parsed.data;
}

export async function runRaffleTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let retry = 0; retry < 12; retry += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && retry < 11) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (retry + 1), 40)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Raffle policy transaction could not be serialized.");
}

export async function validateRaffleEligibilityResources(
  tx: Prisma.TransactionClient,
  input: { orgId: string; eventId: string; eligibility: RaffleEligibility }
) {
  const { orgId, eventId, eligibility } = input;

  if (eligibility.kind === "REGISTRATION_TIER") {
    const type = await tx.registrationType.findUnique({ where: { id: eligibility.typeId } });
    if (!type || type.orgId !== orgId || type.eventId !== eventId) {
      throw new Error("The selected registration tier does not belong to this event.");
    }
  }

  if (eligibility.kind === "REGISTRATION_ADD_ON") {
    const addOn = await tx.addOnDefinition.findUnique({
      where: { id: eligibility.addOnDefinitionId },
      include: { registrationType: true }
    });
    if (
      !addOn ||
      addOn.orgId !== orgId ||
      addOn.registrationType.orgId !== orgId ||
      addOn.registrationType.eventId !== eventId
    ) {
      throw new Error("The selected add-on does not belong to this event.");
    }
  }

  if (eligibility.kind === "PURCHASED") {
    const product = await tx.storeProduct.findUnique({ where: { id: eligibility.productId } });
    if (!product || product.orgId !== orgId || product.eventId !== eventId) {
      throw new Error("The selected raffle product does not belong to this event.");
    }
  }
}

type EligibilityCheck = {
  raffleId: string;
  orgId: string;
  eventId: string;
  portalAccountId: string;
  entryMethod: RaffleEntryMethod;
  orderItemId?: string;
  skipEntryLimit?: boolean;
};

export async function assertRaffleEligibility(tx: Prisma.TransactionClient, input: EligibilityCheck) {
  const raffle = await tx.raffle.findUnique({
    where: { id: input.raffleId },
    select: { id: true, orgId: true, eventId: true, eligibility: true, maxEntriesPerUser: true }
  });

  if (!raffle || raffle.orgId !== input.orgId || raffle.eventId !== input.eventId) {
    throw new Error("Raffle does not belong to this event.");
  }

  const eligibility = parseRaffleEligibility(raffle.eligibility);
  await validateRaffleEligibilityResources(tx, {
    orgId: input.orgId,
    eventId: input.eventId,
    eligibility
  });

  if (eligibility.kind === "PURCHASED") {
    if (input.entryMethod !== "PURCHASED" || !input.orderItemId) {
      throw new Error("This raffle only accepts entries from qualifying paid purchases.");
    }

    const item = await tx.orderItem.findUnique({
      where: { id: input.orderItemId },
      include: { order: true }
    });
    if (
      !item ||
      item.itemType !== "PRODUCT" ||
      item.storeProductId !== eligibility.productId ||
      item.orgId !== input.orgId ||
      item.order.orgId !== input.orgId ||
      item.order.eventId !== input.eventId ||
      item.order.portalAccountId !== input.portalAccountId ||
      item.order.status !== "PAID"
    ) {
      throw new Error("This order item is not eligible for the raffle.");
    }
  } else {
    if (input.entryMethod === "PURCHASED") {
      throw new Error("This raffle does not accept purchase-based entries.");
    }

    const registration = await tx.registration.findFirst({
      where: {
        orgId: input.orgId,
        eventId: input.eventId,
        portalAccountId: input.portalAccountId,
        approvalStatus: "APPROVED",
        status: { in: eligibility.kind === "CHECKED_IN" ? ["CHECKED_IN"] : ["CONFIRMED", "CHECKED_IN"] },
        ...(eligibility.kind === "REGISTRATION_TIER" ? { typeId: eligibility.typeId } : {}),
        ...(eligibility.kind === "REGISTRATION_ADD_ON"
          ? { addOns: { some: { addOnDefinitionId: eligibility.addOnDefinitionId } } }
          : {})
      },
      select: { id: true }
    });

    if (!registration) {
      throw new Error("This attendee does not satisfy the raffle eligibility rule.");
    }
  }

  const current = await tx.raffleEntry.aggregate({
    where: { raffleId: input.raffleId, portalAccountId: input.portalAccountId },
    _sum: { quantity: true }
  });
  const requestedQuantity = input.entryMethod === "PURCHASED" && input.orderItemId ? 1 : 1;
  if (!input.skipEntryLimit && (current._sum.quantity ?? 0) + requestedQuantity > raffle.maxEntriesPerUser) {
    throw new Error("This attendee has reached the raffle entry limit.");
  }

  return { raffle, eligibility, currentQuantity: current._sum.quantity ?? 0 };
}

export async function assertDrawEligibility(
  tx: Prisma.TransactionClient,
  input: { raffleId: string; orgId: string; eventId: string; portalAccountId: string; entryMethod: RaffleEntryMethod; orderItemId?: string }
) {
  try {
    await assertRaffleEligibility(tx, { ...input, skipEntryLimit: true });
    return true;
  } catch {
    return false;
  }
}

export function weightedWinner<T extends { quantity: number }>(entries: T[]) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.quantity), 0);
  if (total <= 0) return null;
  let target = Math.floor(Math.random() * total);
  for (const entry of entries) {
    target -= Math.max(0, entry.quantity);
    if (target < 0) return entry;
  }
  return entries[entries.length - 1] ?? null;
}

export async function fulfillPurchasedRaffleEntries(
  tx: Prisma.TransactionClient,
  input: { orgId: string; eventId: string; portalAccountId: string; orderItemIds: string[] }
) {
  if (input.orderItemIds.length === 0) return 0;

  const [raffles, items] = await Promise.all([
    tx.raffle.findMany({ where: { orgId: input.orgId, eventId: input.eventId } }),
    tx.orderItem.findMany({
      where: { id: { in: input.orderItemIds }, orgId: input.orgId },
      include: { order: true }
    })
  ]);
  let createdCount = 0;

  for (const item of items) {
    if (item.itemType !== "PRODUCT" || !item.storeProductId || item.order.portalAccountId !== input.portalAccountId || item.order.eventId !== input.eventId) {
      continue;
    }

    for (const raffle of raffles) {
      const eligibility = parseRaffleEligibility(raffle.eligibility);
      if (eligibility.kind !== "PURCHASED" || eligibility.productId !== item.storeProductId) continue;

      const purchaseKey = `${raffle.id}:${item.id}`;
      const existing = await tx.raffleEntry.findFirst({ where: { purchaseKey } });
      if (existing) continue;

      const current = await tx.raffleEntry.aggregate({
        where: { raffleId: raffle.id, portalAccountId: input.portalAccountId },
        _sum: { quantity: true }
      });
      const remaining = raffle.maxEntriesPerUser - (current._sum.quantity ?? 0);
      if (remaining <= 0) continue;

      await assertRaffleEligibility(tx, {
        raffleId: raffle.id,
        orgId: input.orgId,
        eventId: input.eventId,
        portalAccountId: input.portalAccountId,
        entryMethod: "PURCHASED",
        orderItemId: item.id,
        skipEntryLimit: true
      });

      const quantity = Math.min(remaining, item.quantity * eligibility.entriesPerUnit);
      if (quantity <= 0) continue;

      await tx.raffleEntry.create({
        data: {
          orgId: input.orgId,
          raffleId: raffle.id,
          portalAccountId: input.portalAccountId,
          entryMethod: "PURCHASED",
          quantity,
          orderItemId: item.id,
          purchaseKey
        }
      });
      createdCount += 1;
    }
  }

  return createdCount;
}

export function getCoreRegistrationEligibilityDescription(eligibility: RaffleEligibility) {
  switch (eligibility.kind) {
    case "CONFIRMED_REGISTRATION":
      return "Approved confirmed registration";
    case "CHECKED_IN":
      return "Approved checked-in registration";
    case "REGISTRATION_TIER":
      return `Registration tier ${eligibility.typeId}`;
    case "REGISTRATION_ADD_ON":
      return `Registration add-on ${eligibility.addOnDefinitionId}`;
    case "PURCHASED":
      return `Paid product purchase ${eligibility.productId}`;
  }
}
