"use server";

import { requirePlatformAdmin } from "@/lib/dashboard-access";
import { reverseOrderFulfillment } from "@/lib/fulfillment";
import { isSePayEnvironmentReady, isSePaySettingsReady, sepaySettingsSchema } from "@/lib/payments/platform";
import { parseMoney } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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

  await prisma.$transaction([
    prisma.paymentProviderConfig.upsert({
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
    }),
    prisma.paymentProviderConfig.upsert({
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
    })
  ]);

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
  const exception = await prisma.paymentException.findUniqueOrThrow({ where: { id: parsed.exceptionId } });
  const details = exception.details && typeof exception.details === "object" && !Array.isArray(exception.details)
    ? exception.details
    : {};

  await prisma.paymentException.update({
    where: { id: exception.id },
    data: {
      status: parsed.status,
      resolvedById: admin.id,
      resolvedAt: new Date(),
      details: { ...details, resolutionNote: parsed.note }
    }
  });

  revalidatePath("/platform/payments");
  redirect("/platform/payments?exceptionSaved=1");
}
