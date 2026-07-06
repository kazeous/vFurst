import { z } from "zod";

export const tableTypeSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().int().min(0)
});

export const amenitySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().int().min(0)
});

export const boothSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  tableType: z.string().trim().optional(),
  status: z.enum(["AVAILABLE", "ASSIGNED", "PAID"]).default("AVAILABLE"),
  vendorApplicationId: z.string().uuid().optional()
});

export type VendorConfig = {
  tableTypes: Array<z.infer<typeof tableTypeSchema>>;
  amenities: Array<z.infer<typeof amenitySchema>>;
  booths: Array<z.infer<typeof boothSchema>>;
};

function settingsObject(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
}

export function getVendorConfig(settings: unknown): VendorConfig {
  const raw = settingsObject(settings).vendorConfig;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    tableTypes: z.array(tableTypeSchema).catch([]).parse(source.tableTypes),
    amenities: z.array(amenitySchema).catch([]).parse(source.amenities),
    booths: z.array(boothSchema).catch([]).parse(source.booths)
  };
}
