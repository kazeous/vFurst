import { markOrderPaidWithProvider } from "@/lib/fulfillment";
import { getSePaySettings } from "@/lib/payments/platform";
import { extractSePayPaymentCode } from "@/lib/payments/sepay";
import { prisma, type PaymentExceptionType, type Prisma } from "@vfurst/db";

export type SePayTransaction = {
  id: string;
  accountNumber: string;
  code: string | null;
  transferType: "in" | "out";
  transferAmount: number;
  payload: Prisma.InputJsonValue;
};

async function recordException(transaction: SePayTransaction, type: PaymentExceptionType, attemptId?: string, orderId?: string) {
  const attempt = attemptId ? await prisma.paymentAttempt.findUnique({ where: { id: attemptId } }) : null;

  await prisma.paymentException.upsert({
    where: {
      sepayTransactionId: transaction.id
    },
    update: {
      type,
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
    await recordException(transaction, "ACCOUNT_MISMATCH", attempt.id, attempt.orderId);
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "REVIEW" } });
    return { outcome: "exception" as const };
  }

  if (attempt.currency !== "VND") {
    await recordException(transaction, "INVALID_TRANSFER", attempt.id, attempt.orderId);
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "REVIEW" } });
    return { outcome: "exception" as const };
  }

  if (transaction.transferAmount < attempt.amount) {
    await recordException(transaction, "UNDERPAID", attempt.id, attempt.orderId);
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "REVIEW" } });
    return { outcome: "exception" as const };
  }

  if (transaction.transferAmount > attempt.amount) {
    await recordException(transaction, "OVERPAID", attempt.id, attempt.orderId);
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "REVIEW" } });
    return { outcome: "exception" as const };
  }

  if (attempt.expiresAt <= new Date() || attempt.status === "EXPIRED" || attempt.order.status !== "PENDING") {
    await recordException(transaction, "LATE_PAYMENT", attempt.id, attempt.orderId);
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "REVIEW" } });
    return { outcome: "exception" as const };
  }

  await markOrderPaidWithProvider(attempt.orderId, "SEPAY", transaction.id);
  return { outcome: "paid" as const, orderId: attempt.orderId };
}
