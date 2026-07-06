import { applyVoucherDiscount } from "@/lib/registration/pricing";
import { z } from "zod";

export const STORE_PLATFORM_FEE_RATE = 0.01;

export const productSurchargeSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.coerce.number().int().min(0)
});

export const productOptionSchema = z.object({
  name: z.string().trim().min(1),
  values: z.array(z.string().trim().min(1)).min(1)
});

export type ProductSurcharge = z.infer<typeof productSurchargeSchema>;
export type ProductOption = z.infer<typeof productOptionSchema>;

export function parseProductSurcharges(value: unknown): ProductSurcharge[] {
  const parsed = z.array(productSurchargeSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseProductOptions(value: unknown): ProductOption[] {
  const parsed = z.array(productOptionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function getSurchargeTotal(value: unknown) {
  return parseProductSurcharges(value).reduce((sum, surcharge) => sum + surcharge.amount, 0);
}

export function getStorePlatformFee(total: number) {
  return total > 0 ? Math.round(total * STORE_PLATFORM_FEE_RATE) : 0;
}

export function getCartItemSurchargeTotal(item: { quantity: number; itemType: string; product?: { surcharges: unknown } | null }) {
  if (item.itemType !== "PRODUCT" || !item.product) {
    return 0;
  }

  return getSurchargeTotal(item.product.surcharges) * item.quantity;
}

export function getCartSummary(
  items: Array<{ unitPrice: number; quantity: number; itemType: string; product?: { surcharges: unknown } | null }>,
  voucher: { discountType: "PERCENT" | "AMOUNT"; discountValue: number } | null
) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const surcharges = items.reduce((sum, item) => sum + getCartItemSurchargeTotal(item), 0);
  const beforeDiscount = subtotal + surcharges;
  const { discount, total } = applyVoucherDiscount(beforeDiscount, voucher);

  return {
    subtotal,
    surcharges,
    discount,
    total,
    platformFee: getStorePlatformFee(total)
  };
}
