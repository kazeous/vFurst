"use server";

import { auth } from "@/lib/auth";
import { requireEventAccess as requireStoredEventAccess } from "@/lib/dashboard-access";
import { parseMoney } from "@/lib/registration/pricing";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import type { CurrencyCode } from "@vfurst/db";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";

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
  const discountValue =
    mode === "COMP"
      ? 100
      : mode === "AMOUNT"
        ? parseMoney(formData.get("discountValue"), currency)
        : z.coerce.number().positive().max(100).parse(formData.get("discountValue"));
  const tierIds = [
    ...new Set(
      z.array(z.string().uuid()).parse(
        formData
          .getAll("tierId")
          .map(String)
          .filter(Boolean)
      )
    )
  ];
  const maxUses = formData.get("maxUses")
    ? z.coerce.number().int().min(1).parse(formData.get("maxUses"))
    : null;
  const expiresValue = formData.get("expiresAt");
  const expiresDate = expiresValue ? z.string().date().parse(expiresValue) : null;
  const expiresAt = expiresDate ? new Date(`${expiresDate}T23:59:59.999Z`) : null;

  if (discountValue <= 0) throw new Error("Discount value must be greater than zero.");
  if (expiresAt && expiresAt < new Date()) throw new Error("Voucher expiry must be today or later.");

  return {
    tierIds,
    payload: {
      discountType,
      discountValue: discountType === "PERCENT" ? Math.round(discountValue) : discountValue,
      maxUses,
      expiresAt,
      restrictions: {
        tierIds,
        compedRegistration: mode === "COMP"
      }
    }
  };
}

async function assertVoucherTiersBelongToEvent(eventId: string, orgId: string, tierIds: string[]) {
  const matchingTiers = await prisma.registrationType.count({
    where: {
      id: {
        in: tierIds
      },
      eventId,
      orgId
    }
  });

  if (matchingTiers !== tierIds.length) {
    throw new Error("One or more voucher tier restrictions do not belong to this event.");
  }
}

function getVoucherRestrictions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { tierIds: [] as string[], compedRegistration: false };
  }

  const restrictions = value as { tierIds?: unknown; compedRegistration?: unknown };
  return {
    tierIds: Array.isArray(restrictions.tierIds)
      ? restrictions.tierIds.filter((tierId): tierId is string => typeof tierId === "string")
      : [],
    compedRegistration: restrictions.compedRegistration === true
  };
}

export async function createVoucher(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      code: z.string().trim().min(2)
    })
    .safeParse({
      eventId: formData.get("eventId"),
      code: formData.get("code")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid voucher.");
  }

  const normalizedCode = normalizeCode(parsed.data.code);
  z.string().min(2).max(64).regex(/^[A-Z0-9-]+$/).parse(normalizedCode);
  const { event } = await requireStoredEventAccess(parsed.data.eventId);
  const { payload, tierIds } = voucherPayloadFromForm(formData, event.currency);
  await assertVoucherTiersBelongToEvent(event.id, event.orgId, tierIds);

  await prisma.voucher.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      code: normalizedCode,
      ...payload
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/vouchers`);
}

export async function bulkGenerateVouchers(formData: FormData) {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      prefix: z.string().trim().min(1).max(16),
      count: z.coerce.number().int().min(1).max(500)
    })
    .safeParse({
      eventId: formData.get("eventId"),
      prefix: formData.get("prefix"),
      count: formData.get("count")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid bulk voucher request.");
  }

  const normalizedPrefix = normalizeCode(parsed.data.prefix);
  z.string().min(1).max(16).regex(/^[A-Z0-9-]+$/).parse(normalizedPrefix);
  const { event } = await requireStoredEventAccess(parsed.data.eventId);
  const { payload, tierIds } = voucherPayloadFromForm(formData, event.currency);
  await assertVoucherTiersBelongToEvent(event.id, event.orgId, tierIds);

  await prisma.voucher.createMany({
    data: Array.from({ length: parsed.data.count }, () => ({
      orgId: event.orgId,
      eventId: event.id,
      code: normalizeCode(`${normalizedPrefix}-${crypto.randomUUID().slice(0, 8)}`),
      ...payload
    })),
    skipDuplicates: true
  });

  revalidatePath(`/dashboard/events/${event.id}/vouchers`);
}

async function validateVoucher(event: { id: string; orgId: string }, code: string) {
  const normalized = normalizeCode(code);

  if (!normalized) {
    throw new PublicActionError("Enter a voucher code.");
  }

  const voucher = await prisma.voucher.findUnique({
    where: {
      eventId_code: {
        eventId: event.id,
        code: normalized
      }
    }
  });

  if (!voucher || voucher.orgId !== event.orgId || voucher.eventId !== event.id) {
    throw new PublicActionError("Voucher code was not found.");
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new PublicActionError("Voucher code has expired.");
  }

  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    throw new PublicActionError("Voucher code has reached its usage limit.");
  }

  return voucher;
}

export async function applyVoucher(_previousState: PublicFormState, formData: FormData): Promise<PublicFormState> {
  try {
    return await applyVoucherInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function applyVoucherInner(formData: FormData): Promise<PublicFormState> {
  const userId = await requireUserId();
  const parsed = z
    .object({
      cartId: z.string().uuid(),
      code: z.string().trim().min(1)
    })
    .safeParse({
      cartId: formData.get("cartId"),
      code: formData.get("code")
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid voucher code." };
  }

  const cart = await prisma.cart.findFirst({
    where: {
      id: parsed.data.cartId,
      userId
    },
    include: {
      event: {
        select: {
          id: true,
          orgId: true,
          org: {
            select: { status: true }
          }
        }
      }
    }
  });

  if (!cart || cart.orgId !== cart.event.orgId || cart.eventId !== cart.event.id) {
    throw new PublicActionError("Cart not found.");
  }

  assertOrganizationActive(cart.event.org.status);

  const voucher = await validateVoucher(cart.event, parsed.data.code);
  const restrictions = getVoucherRestrictions(voucher.restrictions);

  if (restrictions.compedRegistration) {
    throw new PublicActionError("Comped registration vouchers can only be used during registration.");
  }

  if (restrictions.tierIds.length > 0) {
    throw new PublicActionError("Registration-tier vouchers cannot be applied to the event store.");
  }

  const updated = await prisma.cart.updateMany({
    where: {
      id: cart.id,
      userId,
      orgId: cart.event.orgId,
      eventId: cart.event.id
    },
    data: {
      voucherId: voucher.id
    }
  });

  if (updated.count !== 1) {
    throw new Error("Cart not found.");
  }

  revalidatePath(String(formData.get("returnPath") ?? "/"));
  return {};
}
