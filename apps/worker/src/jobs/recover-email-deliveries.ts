import { prisma } from "@vfurst/db";
import { emailDeadLetterQueue, emailQueue } from "../queues.js";

const RECOVERY_BATCH_SIZE = 100;
const STALE_AFTER_MS = 30_000;

function emailQueueJobId(deliveryId: string) {
  return `email-delivery-${deliveryId}`;
}

function deadLetterJobId(deliveryId: string) {
  return `email-dead-letter-${deliveryId}`;
}

export async function processRecoverEmailDeliveries(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const recoverable = await prisma.emailDelivery.findMany({
    where: {
      status: { in: ["QUEUED", "PROCESSING", "RETRYING"] },
      payloadCiphertext: { not: null },
      updatedAt: { lte: staleBefore }
    },
    select: { id: true },
    orderBy: { queuedAt: "asc" },
    take: RECOVERY_BATCH_SIZE
  });

  let recovered = 0;
  for (const delivery of recoverable) {
    const jobId = emailQueueJobId(delivery.id);
    const existing = await emailQueue.getJob(jobId);

    if (!existing) {
      await emailQueue.add("send-email", { deliveryId: delivery.id }, { jobId });
      recovered += 1;
    } else if ((await existing.getState()) === "failed") {
      await existing.retry("failed");
      recovered += 1;
    }

    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { queueJobId: jobId }
    });
  }

  const missingDeadLetterPointers = await prisma.emailDelivery.findMany({
    where: {
      status: "DEAD_LETTERED",
      deadLetteredAt: { not: null }
    },
    select: {
      id: true,
      deadLetteredAt: true,
      lastErrorCode: true
    },
    orderBy: { deadLetteredAt: "desc" },
    take: RECOVERY_BATCH_SIZE
  });

  let deadLetterPointers = 0;
  for (const delivery of missingDeadLetterPointers) {
    const jobId = deadLetterJobId(delivery.id);
    if (!(await emailDeadLetterQueue.getJob(jobId))) {
      await emailDeadLetterQueue.add(
        "email-dead-letter",
        {
          deliveryId: delivery.id,
          failedAt: delivery.deadLetteredAt?.toISOString() ?? now.toISOString(),
          errorCode: delivery.lastErrorCode ?? "EMAIL_DELIVERY_FAILED"
        },
        { jobId }
      );
      deadLetterPointers += 1;
    }
  }

  return {
    scanned: recoverable.length,
    recovered,
    deadLetterPointers
  };
}
