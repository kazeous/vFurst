import { z } from "zod";

const REVIEWABLE_VENDOR_STATUSES = ["UNDER_REVIEW", "APPROVED_UNPAID", "REJECTED", "WAITLISTED"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const vendorAmenityInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  details: optionalText(500)
});

export const vendorAssistantInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).optional().or(z.literal("").transform(() => undefined))
});

export const createVendorApplicationInputSchema = z.object({
  businessName: z.string().trim().min(2).max(180),
  contactName: z.string().trim().min(2).max(180),
  contactEmail: z.string().trim().email().max(254),
  description: z.string().trim().min(10).max(4000),
  productsServices: z.string().trim().min(10).max(4000),
  requestedTableProductId: z.string().trim().min(1).optional().or(z.literal("").transform(() => undefined)),
  amenities: z.array(vendorAmenityInputSchema).max(12).default([]),
  assistants: z.array(vendorAssistantInputSchema).max(8).default([]),
  seatingNotes: optionalText(2000),
  seatingPreferences: z.array(z.string().trim().min(1).max(500)).max(8).default([])
});

export const updateVendorApplicationStatusInputSchema = z.object({
  status: z.enum(REVIEWABLE_VENDOR_STATUSES),
  adminNote: optionalText(2000)
});
