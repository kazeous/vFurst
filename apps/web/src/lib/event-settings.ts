import type { Prisma } from "@vfurst/db";
import { z } from "zod";

export const eventSettingsSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().trim().min(2),
    description: z.string().trim().optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
    venue: z.string().trim().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    requireApproval: z.boolean(),
    allowTransfers: z.boolean(),
    maxRegistrationsPerUser: z.coerce.number().int().min(1).max(20)
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"]
  });

export type CoreEventSettings = Pick<
  z.infer<typeof eventSettingsSchema>,
  "requireApproval" | "allowTransfers" | "maxRegistrationsPerUser"
>;

function settingsObject(settings: Prisma.JsonValue): Prisma.JsonObject {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Prisma.JsonObject) : {};
}

export function getCoreEventSettings(settings: Prisma.JsonValue): CoreEventSettings {
  const value = settingsObject(settings);

  return {
    requireApproval: value.requireApproval === true,
    allowTransfers: value.allowTransfers !== false,
    maxRegistrationsPerUser:
      typeof value.maxRegistrationsPerUser === "number" && Number.isInteger(value.maxRegistrationsPerUser)
        ? value.maxRegistrationsPerUser
        : 1
  };
}

export function mergeCoreEventSettings(settings: Prisma.JsonValue, core: CoreEventSettings): Prisma.JsonObject {
  return {
    ...settingsObject(settings),
    ...core
  };
}
