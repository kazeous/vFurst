import { Prisma, prisma, type RegistrationApprovalStatus, type RegistrationStatus } from "@vfurst/db";
import { getCoreEventSettings, type CoreEventSettings } from "@/lib/event-settings";

/** A registration reserves one attendee slot until it is cancelled or transferred. */
export const registrationReservationStatuses = ["PENDING", "CONFIRMED", "CHECKED_IN"] as const satisfies readonly RegistrationStatus[];

export class RegistrationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationPolicyError";
  }
}

export function getRegistrationApprovalStatus(
  settings: Prisma.JsonValue,
  source: "PUBLIC" | "CASHIER" | "TRANSFER" = "PUBLIC"
): RegistrationApprovalStatus {
  // Cashier and completed staff transfers are already organizer-approved actions.
  if (source === "CASHIER" || source === "TRANSFER") return "APPROVED";
  return getCoreEventSettings(settings).requireApproval ? "PENDING" : "APPROVED";
}

export function assertTransfersAllowed(settings: Prisma.JsonValue) {
  if (!getCoreEventSettings(settings).allowTransfers) {
    throw new RegistrationPolicyError("Registration transfers are disabled for this event.");
  }
}

export async function runRegistrationPolicyTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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

  throw new Error("Registration policy transaction could not be serialized.");
}

type CapacityInput = {
  eventId: string;
  userId: string;
  typeId: string;
  excludeRegistrationId?: string;
  enforceUserLimit?: boolean;
};

/**
 * Atomically checks the event-level attendee limit and tier capacity. Pending
 * registrations count because they reserve a slot before payment settles.
 */
export async function assertRegistrationCapacity(tx: Prisma.TransactionClient, input: CapacityInput) {
  const [event, type] = await Promise.all([
    tx.event.findUnique({ where: { id: input.eventId }, select: { id: true, orgId: true, settings: true } }),
    tx.registrationType.findUnique({ where: { id: input.typeId }, select: { id: true, eventId: true, orgId: true, maxCapacity: true } })
  ]);

  if (!event || !type || type.eventId !== event.id || type.orgId !== event.orgId) {
    throw new RegistrationPolicyError("Registration tier is not available for this event.");
  }

  const policy: CoreEventSettings = getCoreEventSettings(event.settings);
  const exclusion = input.excludeRegistrationId ? { not: input.excludeRegistrationId } : undefined;

  if (input.enforceUserLimit !== false) {
    const userCount = await tx.registration.count({
      where: {
        eventId: event.id,
        userId: input.userId,
        id: exclusion,
        status: { in: [...registrationReservationStatuses] }
      }
    });

    if (userCount >= policy.maxRegistrationsPerUser) {
      throw new RegistrationPolicyError(
        `This event allows at most ${policy.maxRegistrationsPerUser} active registration${policy.maxRegistrationsPerUser === 1 ? "" : "s"} per account.`
      );
    }
  }

  if (type.maxCapacity != null) {
    const typeCount = await tx.registration.count({
      where: {
        eventId: event.id,
        typeId: type.id,
        id: exclusion,
        status: { in: [...registrationReservationStatuses] }
      }
    });

    if (typeCount >= type.maxCapacity) {
      throw new RegistrationPolicyError("That registration tier is sold out.");
    }
  }

  return { event, type, policy };
}

export async function transitionRegistrationToPaid(
  tx: Prisma.TransactionClient,
  input: { registrationId: string; eventId: string; orgId: string }
) {
  const [registration, event] = await Promise.all([
    tx.registration.findUnique({
      where: { id: input.registrationId },
      select: { id: true, eventId: true, orgId: true, status: true, approvalStatus: true }
    }),
    tx.event.findUnique({ where: { id: input.eventId }, select: { id: true, orgId: true, settings: true } })
  ]);

  if (
    !registration ||
    !event ||
    registration.eventId !== input.eventId ||
    registration.orgId !== input.orgId ||
    event.orgId !== input.orgId ||
    registration.status === "CANCELLED" ||
    registration.status === "TRANSFERRED" ||
    registration.approvalStatus === "REJECTED"
  ) {
    throw new RegistrationPolicyError("This registration is no longer eligible for payment fulfillment.");
  }

  const requiredApproval = getCoreEventSettings(event.settings).requireApproval;
  const approvalStatus = registration.approvalStatus === "APPROVED" || !requiredApproval ? "APPROVED" : "PENDING";

  return tx.registration.update({
    where: { id: registration.id },
    data: {
      status: registration.status === "PENDING" ? "CONFIRMED" : registration.status,
      approvalStatus
    }
  });
}
