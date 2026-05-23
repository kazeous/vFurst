import { z } from "zod";

export const manualPaymentInputSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined))
});

export const createRefundInputSchema = z.object({
  amountCents: z.coerce.number().int().min(1).max(1_000_000_00),
  paymentId: z.string().min(1).optional(),
  reason: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined))
});
