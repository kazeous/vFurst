"use server";

import type { ActionFormState } from "@/lib/action-form-state";
import { runActionWithState } from "@/lib/action-state";
import { requireEventAccess, requirePlatformAdmin } from "@/lib/dashboard-access";
import { enqueueEmailDelivery } from "@/lib/email-queue";
import { ExpectedActionError } from "@/lib/public-action-error";
import { Prisma, prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const deliverySchema = z.object({
  deliveryId: z.string().uuid()
});

async function createReplay(
  deliveryId: string,
  replayedById: string,
  expectedEventId?: string
) {
  const replay = await prisma.$transaction(
    async (tx) => {
      const delivery = await tx.emailDelivery.findUnique({
        where: { id: deliveryId }
      });

      if (!delivery || (expectedEventId && delivery.eventId !== expectedEventId)) {
        throw new ExpectedActionError("Email delivery not found.");
      }
      if (delivery.status !== "DEAD_LETTERED") {
        throw new ExpectedActionError("Only a dead-lettered email delivery can be replayed.");
      }
      if (
        !delivery.replayable ||
        !delivery.payloadCiphertext ||
        !delivery.payloadIv ||
        !delivery.payloadAuthTag
      ) {
        throw new ExpectedActionError("This email contains an expired or single-use link and cannot be replayed.");
      }

      const activeReplay = await tx.emailDelivery.findFirst({
        where: {
          replayedFromId: delivery.id,
          status: { in: ["QUEUED", "PROCESSING", "RETRYING"] }
        },
        select: { id: true }
      });
      if (activeReplay) {
        throw new ExpectedActionError("A replay of this email is already queued.");
      }

      return tx.emailDelivery.create({
        data: {
          orgId: delivery.orgId,
          eventId: delivery.eventId,
          recipient: delivery.recipient,
          template: delivery.template,
          payloadCiphertext: delivery.payloadCiphertext,
          payloadIv: delivery.payloadIv,
          payloadAuthTag: delivery.payloadAuthTag,
          payloadVersion: delivery.payloadVersion,
          maxAttempts: delivery.maxAttempts,
          replayable: true,
          replayedFromId: delivery.id,
          replayedById,
          replayedAt: new Date()
        }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );

  try {
    const queueJobId = await enqueueEmailDelivery(replay.id);
    await prisma.emailDelivery.update({
      where: { id: replay.id },
      data: { queueJobId }
    });
  } catch (error) {
    console.error("Email replay is durable but could not be added to Redis; recovery will retry.", {
      deliveryId: replay.id,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }

  return replay;
}

export async function replayEventEmailDelivery(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(() => replayEventEmailDeliveryInner(formData), "Email replay queued.");
}

async function replayEventEmailDeliveryInner(formData: FormData) {
  const parsed = deliverySchema.safeParse({ deliveryId: formData.get("deliveryId") });
  if (!parsed.success) {
    throw new ExpectedActionError("Invalid email delivery.");
  }

  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: parsed.data.deliveryId },
    select: { eventId: true }
  });
  if (!delivery?.eventId) {
    throw new ExpectedActionError("Email delivery not found.");
  }

  const access = await requireEventAccess(delivery.eventId);
  await createReplay(parsed.data.deliveryId, access.userId, delivery.eventId);
  revalidatePath(`/dashboard/events/${delivery.eventId}/settings/emails`);
}

export async function replayPlatformEmailDelivery(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(() => replayPlatformEmailDeliveryInner(formData), "Email replay queued.");
}

async function replayPlatformEmailDeliveryInner(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = deliverySchema.safeParse({ deliveryId: formData.get("deliveryId") });
  if (!parsed.success) {
    throw new ExpectedActionError("Invalid email delivery.");
  }

  const replay = await createReplay(parsed.data.deliveryId, platformAdmin.id);
  revalidatePath("/platform/operations/email");
  if (replay.eventId) {
    revalidatePath(`/dashboard/events/${replay.eventId}/settings/emails`);
  }
}
