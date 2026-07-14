import { markOrderPaidWithProvider } from "@/lib/fulfillment";
import { getSePaySettings } from "@/lib/payments/platform";
import { extractSePayPaymentCode } from "@/lib/payments/sepay";
import { Prisma, prisma, type PaymentExceptionType } from "@vfurst/db";

export type SePayTransaction = {
  id: string;
  accountNumber: string;
  code: string | null;
  transferType: "in" | "out";
  transferAmount: number;
  payload: Prisma.InputJsonValue;
};

async function recordException(
  transaction: SePayTransaction,
  type: PaymentExceptionType,
  attemptId?: string,
  orderId?: string,
  holdForReview = false
) {
  for (let retry = 0; retry < 12; retry += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const attempt = attemptId
            ? await tx.paymentAttempt.findUnique({
                where: { id: attemptId },
                include: {
                  order: {
                    select: { status: true }
                  }
                }
              })
            : null;

          await tx.paymentException.upsert({
            where: {
              sepayTransactionId: transaction.id
            },
            update: {
              type,
              paymentAttemptId: attemptId,
              orderId,
              expectedAmount: attempt?.amount,
              receivedAmount: transaction.transferAmount,
              details: transaction.payload
            },
            create: {
              sepayTransactionId: transaction.id,
              type,
              paymentAttemptId: attemptId,
              orderId,
              expectedAmount: attempt?.amount,
              receivedAmount: transaction.transferAmount,
              details: transaction.payload
            }
          });

          if (!holdForReview || !attempt || attempt.status === "PAID" || attempt.order.status !== "PENDING") {
            return;
          }

          const claimedOrder = await tx.order.updateMany({
            where: {
              id: attempt.orderId,
              status: "PENDING"
            },
            data: {
              paymentProvider: attempt.provider,
              paymentReference: attempt.paymentCode ?? attempt.providerReference,
              checkoutExpiresAt: attempt.expiresAt
            }
          });

          if (claimedOrder.count !== 1) {
            return;
          }

          await tx.paymentAttempt.updateMany({
            where: {
              orderId: attempt.orderId,
              id: {
                not: attempt.id
              },
              status: {
                in: ["PENDING", "REVIEW"]
              }
            },
            data: {
              status: "CANCELLED",
              activeOrderId: null
            }
          });

          const reviewedAttempt = await tx.paymentAttempt.updateMany({
            where: {
              id: attempt.id,
              status: {
                not: "PAID"
              }
            },
            data: {
              status: "REVIEW",
              activeOrderId: attempt.orderId
            }
          });

          if (reviewedAttempt.count !== 1) {
            throw new Error("The payment attempt changed while its exception was being recorded.");
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
      return;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034") &&
        retry < 11
      ) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (retry + 1), 40)));
        continue;
      }
      throw error;
    }
  }
}

export async function processSePayTransaction(transaction: SePayTransaction) {
  if (transaction.transferType !== "in") {
    await recordException(transaction, "INVALID_TRANSFER");
    return { outcome: "exception" as const };
  }

  const payload = transaction.payload as Record<string, unknown>;
  const paymentCode = extractSePayPaymentCode(transaction.code, typeof payload.content === "string" ? payload.content : null);
  const attempt = paymentCode
    ? await prisma.paymentAttempt.findUnique({
        where: {
          paymentCode
        },
        include: {
          order: true
        }
      })
    : null;

  if (!attempt || attempt.provider !== "SEPAY") {
    await recordException(transaction, "UNKNOWN_CODE");
    return { outcome: "exception" as const };
  }

  const settings = await getSePaySettings();

  if (transaction.accountNumber !== settings.accountNumber) {
    await recordException(transaction, "ACCOUNT_MISMATCH", attempt.id, attempt.orderId, true);
    return { outcome: "exception" as const };
  }

  if (attempt.currency !== "VND") {
    await recordException(transaction, "INVALID_TRANSFER", attempt.id, attempt.orderId, true);
    return { outcome: "exception" as const };
  }

  if (transaction.transferAmount < attempt.amount) {
    await recordException(transaction, "UNDERPAID", attempt.id, attempt.orderId, true);
    return { outcome: "exception" as const };
  }

  if (transaction.transferAmount > attempt.amount) {
    await recordException(transaction, "OVERPAID", attempt.id, attempt.orderId, true);
    return { outcome: "exception" as const };
  }

  if (attempt.expiresAt <= new Date() || attempt.status === "EXPIRED" || attempt.order.status !== "PENDING") {
    await recordException(transaction, "LATE_PAYMENT", attempt.id, attempt.orderId, true);
    return { outcome: "exception" as const };
  }

  await markOrderPaidWithProvider(attempt.orderId, "SEPAY", transaction.id, {
    paymentAttemptId: attempt.id
  });
  return { outcome: "paid" as const, orderId: attempt.orderId };
}
