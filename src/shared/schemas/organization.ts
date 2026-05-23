import { z } from "zod";
import { ORGANIZATION_ROLES } from "@/shared/rbac";

export const createOrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens only")
    .optional()
});

export const updateOrganizationInputSchema = createOrganizationInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const updateOrganizationMemberInputSchema = z.object({
  role: z.enum(ORGANIZATION_ROLES).exclude(["OWNER"])
});

export const createOrganizationInviteInputSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(ORGANIZATION_ROLES).exclude(["OWNER"])
});
