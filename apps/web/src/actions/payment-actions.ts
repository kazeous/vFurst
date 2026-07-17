"use server";

import { requirePlatformAdmin } from "@/lib/dashboard-access";
import {
  getNextControlPlaneAggregateVersion,
  runSerializableControlPlaneTransaction
} from "@/lib/control-plane-transactions";
import { reverseOrderFulfillment } from "@/lib/fulfillment";
import { isSePayEnvironmentReady, isSePaySettingsReady, sepaySettingsSchema } from "@/lib/payments/platform";
import { parseMoney } from "@/lib/registration/pricing";
import type { ControlPlaneEvent } from "@vfurst/contracts";
import { enqueueControlPlaneEvent, PAYMENT_ATTEMPT_TTL_MS, Prisma, prisma } from "@vfurst/db";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

type ControlPlaneEventData<T extends ControlPlaneEvent["type"]> = Extract<
  ControlPlaneEvent,
  { type: T }
>["data"];

const PAYMENT_POLICY_AGGREGATE_TYPE = "platform-payment-policy";
const PAYMENT_POLICY_AGGREGATE_ID = "global";

export async function savePlatformPaymentSettings(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const stripeEnabled = formData.get("stripeEnabled") === "on";
  const sepayEnabled = formData.get("sepayEnabled") === "on";
  const sepaySettings = sepaySettingsSchema.parse({
    bankCode: formData.get("bankCode"),
    accountNumber: formData.get("accountNumber"),
    accountHolder: formData.get("accountHolder"),
    bankAccountId: formData.get("bankAccountId"),
    memoPrefix: formData.get("memoPrefix"),
    registrationFeeVnd: formData.get("registrationFeeVnd"),
    hotelFeeVnd: formData.get("hotelFeeVnd")
  });

  if (sepayEnabled && (!isSePayEnvironmentReady() || !isSePaySettingsReady(sepaySettings))) {
    throw new Error("Complete the SePay account fields and required environment secrets before enabling SePay.");
  }

  const eventId = randomUUID();
  const idempotencyKey = randomUUID();
  const correlationId = randomUUID();

  await runSerializableControlPlaneTransaction(prisma, async (tx) => {
    await tx.paymentProviderConfig.upsert({
      where: {
        provider: "STRIPE"
      },
      update: {
        enabled: stripeEnabled,
        updatedById: admin.id
      },
      create: {
        provider: "STRIPE",
        enabled: stripeEnabled,
        updatedById: admin.id
      }
    });
    await tx.paymentProviderConfig.upsert({
      where: {
        provider: "SEPAY"
      },
      update: {
        enabled: sepayEnabled,
        settings: sepaySettings,
        updatedById: admin.id
      },
      create: {
        provider: "SEPAY",
        enabled: sepayEnabled,
        settings: sepaySettings,
        updatedById: admin.id
      }
    });

    const policyVersion = await getNextControlPlaneAggregateVersion(
      tx,
      PAYMENT_POLICY_AGGREGATE_TYPE,
      PAYMENT_POLICY_AGGREGATE_ID
    );
    const data = {
      providers: [
        { provider: "STRIPE", enabled: stripeEnabled },
        { provider: "SEPAY", enabled: sepayEnabled }
      ],
      policyVersion
    } satisfies ControlPlaneEventData<"platform.payment-policy-changed">;

    await enqueueControlPlaneEvent(tx, {
      id: eventId,
      idempotencyKey,
      organizationId: null,
      aggregateType: PAYMENT_POLICY_AGGREGATE_TYPE,
      aggregateId: PAYMENT_POLICY_AGGREGATE_ID,
      aggregateVersion: policyVersion,
      eventType: "platform.payment-policy-changed",
      correlationId,
      actorUserId: admin.id,
      data
    });
  });

  revalidatePath("/platform/payments");
  redirect("/platform/payments?paymentsSaved=1");
}

const payoutSchema = z.object({
  orgId: z.string().uuid(),
  currency: z.enum(["USD", "VND"]),
  reference: z.string().trim().min(3),
  paidAt: z.coerce.date(),
  amount: z.string().trim().min(1),
  entryIds: z.array(z.string().uuid()).min(1)
});

export async function recordOrganizerPayout(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const parsed = payoutSchema.parse({
    orgId: formData.get("orgId"),
    currency: formData.get("currency"),
    reference: formData.get("reference"),
    paidAt: formData.get("paidAt"),
    amount: formData.get("amount"),
    entryIds: formData.getAll("entryId")
  });

  await prisma.$transaction(async (tx) => {
    const entries = await tx.organizerLedgerEntry.findMany({
      where: {
        id: { in: parsed.entryIds },
        orgId: parsed.orgId,
        currency: parsed.currency,
        status: "OPEN"
      }
    });
    if (entries.length !== parsed.entryIds.length) {
      throw new Error("One or more ledger entries are no longer available.");
    }
    const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const recordedAmount = parseMoney(parsed.amount, parsed.currency);
    if (amount <= 0 || recordedAmount <= 0) {
      throw new Error("A payout must have a positive selected balance.");
    }
    if (recordedAmount > amount) {
      throw new Error("The payout cannot exceed the selected positive balance.");
    }
    if (recordedAmount !== amount) {
      throw new Error("Select ledger entries whose balance exactly matches the payout amount.");
    }
    const payout = await tx.organizerPayout.create({
      data: {
        orgId: parsed.orgId,
        currency: parsed.currency,
        amount: recordedAmount,
        reference: parsed.reference,
        paidAt: parsed.paidAt,
        createdById: admin.id
      }
    });
    await tx.organizerLedgerEntry.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) }, status: "OPEN" },
      data: { status: "SETTLED", payoutId: payout.id }
    });
  });

  revalidatePath("/platform/payments");
  redirect("/platform/payments?payoutSaved=1");
}

const refundSchema = z.object({
  orderId: z.string().uuid(),
  reference: z.string().trim().min(3),
  reason: z.string().trim().optional(),
  processedAt: z.coerce.date()
});

export async function recordSePayRefund(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const parsed = refundSchema.parse({
    orderId: formData.get("orderId"),
    reference: formData.get("reference"),
    reason: formData.get("reason"),
    processedAt: formData.get("processedAt")
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: parsed.orderId } });

  if (order.paymentProvider !== "SEPAY" || order.status !== "PAID") {
    throw new Error("Only paid SePay orders can be recorded as manually refunded.");
  }

  const refund = await prisma.paymentRefund.create({
    data: {
      orderId: order.id,
      provider: "SEPAY",
      amount: order.total,
      reference: parsed.reference,
      reason: parsed.reason,
      processedAt: parsed.processedAt,
      createdById: admin.id
    }
  });

  await reverseOrderFulfillment(order.id);
  await prisma.organizerLedgerEntry.create({
    data: {
      orgId: order.orgId,
      orderId: order.id,
      refundId: refund.id,
      type: "REFUND",
      currency: order.currency,
      amount: -(order.total - order.platformFee),
      note: `Manual SePay refund ${parsed.reference}`
    }
  });

  revalidatePath("/platform/payments");
  redirect("/platform/payments?refundSaved=1");
}

const exceptionResolutionSchema = z.object({
  exceptionId: z.string().uuid(),
  status: z.enum(["RESOLVED", "REFUNDED"]),
  note: z.string().trim().min(3)
});

export async function resolvePaymentException(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const parsed = exceptionResolutionSchema.parse({
    exceptionId: formData.get("exceptionId"),
    status: formData.get("status"),
    note: formData.get("note")
  });
  await prisma.$transaction(
    async (tx) => {
      const exception = await tx.paymentException.findUniqueOrThrow({ where: { id: parsed.exceptionId } });
      const details = exception.details && typeof exception.details === "object" && !Array.isArray(exception.details)
        ? exception.details
        : {};
      const resolved = await tx.paymentException.updateMany({
        where: {
          id: exception.id,
          status: "OPEN"
        },
        data: {
          status: parsed.status,
          resolvedById: admin.id,
          resolvedAt: new Date(),
          details: { ...details, resolutionNote: parsed.note }
        }
      });

      if (resolved.count !== 1) {
        throw new Error("This payment exception was already resolved.");
      }

      if (!exception.paymentAttemptId || !exception.orderId) {
        return;
      }

      const otherOpenExceptions = await tx.paymentException.count({
        where: {
          paymentAttemptId: exception.paymentAttemptId,
          status: "OPEN"
        }
      });

      if (otherOpenExceptions > 0) {
        return;
      }

      await tx.paymentAttempt.updateMany({
        where: {
          id: exception.paymentAttemptId,
          orderId: exception.orderId,
          status: "REVIEW"
        },
        data: {
          status: "CANCELLED",
          activeOrderId: null
        }
      });

      const remainingAttempt = await tx.paymentAttempt.findFirst({
        where: {
          orderId: exception.orderId,
          status: {
            in: ["PENDING", "REVIEW"]
          }
        },
        orderBy: [{ status: "desc" }, { createdAt: "desc" }]
      });

      await tx.order.updateMany({
        where: {
          id: exception.orderId,
          status: "PENDING"
        },
        data: remainingAttempt
          ? {
              paymentProvider: remainingAttempt.provider,
              paymentReference: remainingAttempt.paymentCode ?? remainingAttempt.providerReference,
              checkoutExpiresAt: remainingAttempt.expiresAt
            }
          : {
              paymentProvider: null,
              paymentReference: null,
              checkoutExpiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MS)
            }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );

  revalidatePath("/platform/payments");
  redirect("/platform/payments?exceptionSaved=1");
}
