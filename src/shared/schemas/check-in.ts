import { z } from "zod";
import { BADGE_STATUSES } from "@/shared/check-in";

export const checkInSearchQuerySchema = z.object({
  query: z.string().trim().max(160).optional().default(""),
  mode: z.enum(["standard", "express"]).optional().default("standard")
});

export const updateCheckInInputSchema = z.object({
  checkedIn: z.boolean().optional(),
  badgeStatus: z.enum(BADGE_STATUSES).optional(),
  cashierNote: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined))
});
