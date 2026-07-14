import {
  Prisma,
  type CurrencyCode,
  type PaymentAttempt,
  type PaymentProvider,
  type PrismaClient
} from "@prisma/client";

export const ACTIVE_PAYMENT_ATTEMPT_STATUSES = ["PENDING", "REVIEW"] as const;
export const PAYMENT_ATTEMPT_TTL_MS = 30 * 60 * 1000;
const SERIALIZATION_RETRY_LIMIT = 12;

class RetryPaymentAttemptReservationError extends Error {}

export type PaymentAttemptReservationErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PENDING"
  | "ORDER_CONTRACT_CHANGED"
  | "PROVIDER_LOCKED"
  | "PAYMENT_REVIEW"
  | "INVALID_EXPIRY";

export class PaymentAttemptReservationError extends Error {
  constructor(
    public readonly code: PaymentAttemptReservationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PaymentAttemptReservationError";
  }
}

export type ReservePaymentAttemptInput = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  amount: number;
  currency: CurrencyCode;
  paymentCode?: string;
  expiresAt: Date;
  now?: Date;
};

export type ReservedPaymentAttempt = {
  attempt: PaymentAttempt;
  created: boolean;
};

function isRetryableSerializationError(error: unknown) {
  return (
    error instanceof RetryPaymentAttemptReservationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034"))
  );
}

function attemptMatchesOrderReference(
  attempt: Pick<PaymentAttempt, "paymentCode" | "providerReference">,
  orderReference: string | null
) {
  return Boolean(
    orderReference && (attempt.paymentCode === orderReference || attempt.providerReference === orderReference)
  );
}

function authoritativeAttempt(
  attempts: PaymentAttempt[],
  orderReference: string | null
) {
  return (
    attempts.find((attempt) => attempt.status === "REVIEW") ??
    attempts.find((attempt) => attemptMatchesOrderReference(attempt, orderReference)) ??
    attempts[0]
  );
}

export async function reservePaymentAttempt(
  client: PrismaClient,
  input: ReservePaymentAttemptInput
): Promise<ReservedPaymentAttempt> {
  const now = input.now ?? new Date();

  if (input.expiresAt <= now) {
    throw new PaymentAttemptReservationError("INVALID_EXPIRY", "Payment attempt expiry must be in the future.");
  }

  for (let retry = 0; retry < SERIALIZATION_RETRY_LIMIT; retry += 1) {
    try {
      return await client.$transaction(
        async (tx) => {
          const order = await tx.order.findUnique({
            where: {
              id: input.orderId
            },
            select: {
              id: true,
              status: true,
              total: true,
              currency: true,
              paymentProvider: true,
              paymentReference: true,
              checkoutExpiresAt: true
            }
          });

          if (!order) {
            throw new PaymentAttemptReservationError("ORDER_NOT_FOUND", "Checkout order was not found.");
          }
          if (order.status !== "PENDING") {
            throw new PaymentAttemptReservationError("ORDER_NOT_PENDING", "This order is no longer awaiting payment.");
          }
          if (order.total !== input.amount || order.currency !== input.currency) {
            throw new PaymentAttemptReservationError(
              "ORDER_CONTRACT_CHANGED",
              "The order amount or currency changed before payment could start."
            );
          }

          await tx.paymentAttempt.updateMany({
            where: {
              orderId: order.id,
              status: "PENDING",
              expiresAt: {
                lte: now
              }
            },
            data: {
              status: "EXPIRED",
              activeOrderId: null
            }
          });

          const logicalActiveAttempts = await tx.paymentAttempt.findMany({
            where: {
              orderId: order.id,
              status: {
                in: [...ACTIVE_PAYMENT_ATTEMPT_STATUSES]
              }
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
          });

          if (logicalActiveAttempts.length > 0) {
            const active = authoritativeAttempt(logicalActiveAttempts, order.paymentReference)!;
            const duplicateIds = logicalActiveAttempts
              .filter((attempt) => attempt.id !== active.id)
              .map((attempt) => attempt.id);

            if (duplicateIds.length > 0) {
              await tx.paymentAttempt.updateMany({
                where: {
                  id: {
                    in: duplicateIds
                  }
                },
                data: {
                  status: "CANCELLED",
                  activeOrderId: null
                }
              });
            }

            if (active.activeOrderId !== order.id) {
              const claimed = await tx.paymentAttempt.updateMany({
                where: {
                  id: active.id,
                  activeOrderId: null
                },
                data: {
                  activeOrderId: order.id
                }
              });

              if (claimed.count !== 1) {
                throw new RetryPaymentAttemptReservationError("Payment-attempt lock changed concurrently.");
              }
            }

            if (active.status === "REVIEW") {
              throw new PaymentAttemptReservationError(
                "PAYMENT_REVIEW",
                "A received payment for this order is under platform review."
              );
            }
            if (active.provider !== input.provider) {
              throw new PaymentAttemptReservationError(
                "PROVIDER_LOCKED",
                `This order already has an active ${active.provider === "STRIPE" ? "Stripe" : "SePay"} payment attempt.`
              );
            }
            if (active.amount !== input.amount || active.currency !== input.currency) {
              throw new PaymentAttemptReservationError(
                "ORDER_CONTRACT_CHANGED",
                "The active payment attempt no longer matches this order."
              );
            }

            const claimedAttempt = active.activeOrderId === order.id
              ? active
              : await tx.paymentAttempt.findUniqueOrThrow({ where: { id: active.id } });

            const expectedReference = active.paymentCode ?? active.providerReference ?? order.paymentReference;
            if (
              order.paymentProvider !== active.provider ||
              order.paymentReference !== expectedReference ||
              order.checkoutExpiresAt?.getTime() !== active.expiresAt.getTime()
            ) {
              await tx.order.update({
                where: {
                  id: order.id
                },
                data: {
                  paymentProvider: active.provider,
                  paymentReference: expectedReference,
                  checkoutExpiresAt: active.expiresAt
                }
              });
            }

            return {
              attempt: claimedAttempt,
              created: false
            };
          }

          const updatedOrder = await tx.order.updateMany({
            where: {
              id: order.id,
              status: "PENDING",
              total: input.amount,
              currency: input.currency
            },
            data: {
              paymentProvider: input.provider,
              paymentReference: input.provider === "SEPAY" ? input.paymentCode : null,
              checkoutExpiresAt: input.expiresAt
            }
          });

          if (updatedOrder.count !== 1) {
            throw new PaymentAttemptReservationError("ORDER_NOT_PENDING", "This order is no longer awaiting payment.");
          }

          const attempt = await tx.paymentAttempt.create({
            data: {
              id: input.id,
              orderId: order.id,
              activeOrderId: order.id,
              provider: input.provider,
              amount: input.amount,
              currency: input.currency,
              paymentCode: input.provider === "SEPAY" ? input.paymentCode : null,
              expiresAt: input.expiresAt
            }
          });

          return {
            attempt,
            created: true
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (isRetryableSerializationError(error) && retry + 1 < SERIALIZATION_RETRY_LIMIT) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (retry + 1), 40)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Payment attempt could not be serialized.");
}
