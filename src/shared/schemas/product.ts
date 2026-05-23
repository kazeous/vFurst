import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/shared/products";

const optionalDateString = z
  .string()
  .trim()
  .datetime({ offset: true })
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const productOptionInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  required: z.boolean().default(false),
  values: z.array(z.string().trim().min(1).max(120)).max(30).default([])
});

export const productImageInputSchema = z.object({
  url: z.string().trim().url().max(1000),
  altText: optionalText(160)
});

export const createProductInputSchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES).default("REGISTRATION"),
  name: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(160),
  description: optionalText(4000),
  basePriceCents: z.coerce.number().int().min(0).max(1_000_000_00),
  stockLimit: z.coerce.number().int().min(1).max(1_000_000).optional().or(z.literal("").transform(() => undefined)),
  publicVisible: z.boolean().default(true),
  availableFrom: optionalDateString,
  availableUntil: optionalDateString,
  minPurchaseAge: z.coerce.number().int().min(0).max(130).optional().or(z.literal("").transform(() => undefined)),
  maxPurchaseAge: z.coerce.number().int().min(0).max(130).optional().or(z.literal("").transform(() => undefined)),
  images: z.array(productImageInputSchema).max(8).default([]),
  options: z.array(productOptionInputSchema).max(20).default([])
});

export const updateProductInputSchema = createProductInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);
