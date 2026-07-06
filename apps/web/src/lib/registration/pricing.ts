import { z } from "zod";

export const scheduledPriceSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  price: z.coerce.number().int().min(0)
});

export type ScheduledPrice = z.infer<typeof scheduledPriceSchema>;

export const roomTypeSchema = z.object({
  name: z.string().trim().min(1),
  rate: z.coerce.number().int().min(0),
  totalRooms: z.coerce.number().int().min(1),
  bookedRooms: z.coerce.number().int().min(0).default(0)
});

export type HotelRoomType = z.infer<typeof roomTypeSchema>;

export function dollarsToCents(value: FormDataEntryValue | null) {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : 0;

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Money amounts must be zero or greater.");
  }

  return Math.round(amount * 100);
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

export function parseScheduledPricing(value: unknown): ScheduledPrice[] {
  const parsed = z.array(scheduledPriceSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseRoomTypes(value: unknown): HotelRoomType[] {
  const parsed = z.array(roomTypeSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function getScheduledPrice(basePrice: number, scheduledPricing: unknown, now = new Date()) {
  const activeSchedule = parseScheduledPricing(scheduledPricing).find((price) => {
    const start = new Date(price.startDate);
    const end = new Date(price.endDate);
    end.setHours(23, 59, 59, 999);

    return start <= now && now <= end;
  });

  return activeSchedule?.price ?? basePrice;
}

export function applyVoucherDiscount(
  subtotal: number,
  voucher: { discountType: "PERCENT" | "AMOUNT"; discountValue: number } | null
) {
  if (!voucher) {
    return { discount: 0, total: subtotal };
  }

  const discount =
    voucher.discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(voucher.discountValue, 100) * 0.01)
      : Math.min(voucher.discountValue, subtotal);

  return {
    discount,
    total: Math.max(subtotal - discount, 0)
  };
}

export function getNightCount(checkIn: Date, checkOut: Date) {
  const milliseconds = checkOut.getTime() - checkIn.getTime();
  const nights = Math.ceil(milliseconds / 86_400_000);

  if (nights < 1) {
    throw new Error("Check-out must be after check-in.");
  }

  return nights;
}

