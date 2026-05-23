import { z } from "zod";
import { EVENT_ROLES, EVENT_STATUSES } from "@/shared/rbac";

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

export const createEventInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens only")
    .optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  startsAt: optionalDateString,
  endsAt: optionalDateString,
  venueName: optionalText(160),
  contactEmail: optionalText(254).pipe(z.string().email().optional()),
  description: optionalText(4000)
});

export const updateEventInputSchema = createEventInputSchema
  .extend({
    status: z.enum(EVENT_STATUSES).optional()
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const updateEventMemberInputSchema = z.object({
  role: z.enum(EVENT_ROLES)
});

export const createEventInviteInputSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(EVENT_ROLES)
});
