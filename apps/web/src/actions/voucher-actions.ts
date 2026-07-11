"use server";

import { auth } from "@/lib/auth";
import { parseMoney } from "@/lib/registration/pricing";
import type { CurrencyCode } from "@vfurst/db";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function requireEventAccess(orgId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const member = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId: session.user.id,
        orgId
      }
    }
  });

  if (!member || member.role === "MEMBER") {
    throw new Error("You do not have permission to manage vouchers for this event.");
  }

  return session.user.id;
}

async function requireUserId() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function voucherPayloadFromForm(formData: FormData, currency: CurrencyCode) {
  const mode = z.enum(["PERCENT", "AMOUNT", "COMP"]).parse(formData.get("discountType"));
  const discountType = mode === "AMOUNT" ? ("AMOUNT" as const) : ("PERCENT" as const);
  const discountValue = mode === "COMP" ? 100 : mode === "AMOUNT" ? parseMoney(formData.get("discountValue"), currency) : Number(formData.get("discountValue") ?? 0);
  const tierIds = formData
    .getAll("tierId")
    .map((value) => String(value))
    .filter(Boolean);

  if (discountValue <= 0) {
    throw new Error("Discount value must be greater than zero.");
  }

  return {
    discountType,
    discountValue: discountType === "PERCENT" ? Math.min(Math.round(discountValue), 100) : discountValue,
    maxUses: formData.get("maxUses") ? Number(formData.get("maxUses")) : null,
    expiresAt: formData.get("expiresAt") ? new Date(String(formData.get("expiresAt"))) : null,
    restrictions: {
      tierIds,
      compedRegistration: mode === "COMP"
    }
  };
}

export async function createVoucher(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      code: z.string().trim().min(2)
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      code: formData.get("code")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid voucher.");
  }

  await requireEventAccess(parsed.data.orgId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: parsed.data.eventId }, select: { currency: true } });

  await prisma.voucher.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      code: normalizeCode(parsed.data.code),
      ...voucherPayloadFromForm(formData, event.currency)
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/vouchers`);
}

export async function bulkGenerateVouchers(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      prefix: z.string().trim().min(1).max(16),
      count: z.coerce.number().int().min(1).max(500)
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      prefix: formData.get("prefix"),
      count: formData.get("count")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid bulk voucher request.");
  }

  await requireEventAccess(parsed.data.orgId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: parsed.data.eventId }, select: { currency: true } });
  const payload = voucherPayloadFromForm(formData, event.currency);

  await prisma.voucher.createMany({
    data: Array.from({ length: parsed.data.count }, () => ({
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      code: normalizeCode(`${parsed.data.prefix}-${crypto.randomUUID().slice(0, 8)}`),
      ...payload
    })),
    skipDuplicates: true
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/vouchers`);
}

export async function validateVoucher(eventId: string, code: string) {
  const normalized = normalizeCode(code);

  if (!normalized) {
    throw new Error("Enter a voucher code.");
  }

  const voucher = await prisma.voucher.findUnique({
    where: {
      eventId_code: {
        eventId,
        code: normalized
      }
    }
  });

  if (!voucher) {
    throw new Error("Voucher code was not found.");
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new Error("Voucher code has expired.");
  }

  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    throw new Error("Voucher code has reached its usage limit.");
  }

  return voucher;
}

export async function applyVoucher(formData: FormData) {
  const userId = await requireUserId();
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      cartId: z.string().uuid(),
      code: z.string().trim().min(1)
    })
    .safeParse({
      eventId: formData.get("eventId"),
      cartId: formData.get("cartId"),
      code: formData.get("code")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid voucher code.");
  }

  const voucher = await validateVoucher(parsed.data.eventId, parsed.data.code);
  const restrictions =
    voucher.restrictions && typeof voucher.restrictions === "object" && "compedRegistration" in voucher.restrictions
      ? (voucher.restrictions as { compedRegistration?: boolean })
      : null;

  if (restrictions?.compedRegistration) {
    throw new Error("Comped registration vouchers can only be used during registration.");
  }

  await prisma.cart.updateMany({
    where: {
      id: parsed.data.cartId,
      userId,
      eventId: parsed.data.eventId
    },
    data: {
      voucherId: voucher.id
    }
  });

  revalidatePath(String(formData.get("returnPath") ?? "/"));
}
