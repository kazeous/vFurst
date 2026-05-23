import { z } from "zod";
import { VOLUNTEER_APPLICATION_STATUSES, VOLUNTEER_ASSIGNMENT_STATES, VOLUNTEER_CONTACT_METHODS } from "@/shared/volunteers";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const createVolunteerApplicationInputSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: optionalText(80),
  preferredContactMethod: z.enum(VOLUNTEER_CONTACT_METHODS).default("EMAIL"),
  availability: z.string().trim().min(5).max(4000),
  departmentInterests: z.string().trim().min(2).max(2000),
  priorExperience: optionalText(4000)
});

export const createVolunteerDepartmentInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: optionalText(2000),
  leadUserId: z.string().trim().min(1).optional().or(z.literal("").transform(() => undefined))
});

export const updateVolunteerDepartmentInputSchema = createVolunteerDepartmentInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const updateVolunteerApplicationInputSchema = z.object({
  status: z.enum(VOLUNTEER_APPLICATION_STATUSES),
  departmentId: z.string().trim().min(1).optional().or(z.literal("").transform(() => undefined)),
  assignmentState: z.enum(VOLUNTEER_ASSIGNMENT_STATES).optional(),
  assignmentNote: optionalText(2000),
  adminNote: optionalText(2000)
});
