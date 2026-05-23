import { z } from "zod";

export const upsertCartItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(100)
});

export const updateCartItemInputSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100)
});
