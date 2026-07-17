import { Prisma, type PrismaClient } from "@vfurst/db";

const SERIALIZATION_RETRY_LIMIT = 12;

type ControlPlaneTransactionClient = Prisma.TransactionClient;

function isRetryableControlPlaneConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/**
 * Runs a control-plane mutation at serializable isolation and retries database
 * conflicts. The callback must only contain transaction-local work because it
 * can run more than once.
 */
export async function runSerializableControlPlaneTransaction<T>(
  client: Pick<PrismaClient, "$transaction">,
  callback: (tx: ControlPlaneTransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZATION_RETRY_LIMIT; attempt += 1) {
    try {
      return await client.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (!isRetryableControlPlaneConflict(error) || attempt + 1 >= SERIALIZATION_RETRY_LIMIT) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (attempt + 1), 40)));
    }
  }

  throw new Error("Control-plane transaction retry budget was exhausted.");
}

/**
 * Global aggregates do not belong to a tenant. Their durable outbox stream is
 * the source of the next version; the unique stream index arbitrates concurrent
 * writers and the serializable transaction wrapper retries the loser.
 */
export async function getNextControlPlaneAggregateVersion(
  tx: Pick<ControlPlaneTransactionClient, "controlPlaneOutboxEvent">,
  aggregateType: string,
  aggregateId: string
): Promise<number> {
  const latest = await tx.controlPlaneOutboxEvent.findFirst({
    where: {
      aggregateType,
      aggregateId
    },
    orderBy: {
      aggregateVersion: "desc"
    },
    select: {
      aggregateVersion: true
    }
  });

  return (latest?.aggregateVersion ?? 0) + 1;
}
