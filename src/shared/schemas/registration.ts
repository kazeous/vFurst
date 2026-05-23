import { z } from "zod";
import { REGISTRATION_QUESTION_TYPES } from "@/shared/products";

export const createRegistrationQuestionInputSchema = z.object({
  label: z.string().trim().min(2).max(240),
  helpText: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(REGISTRATION_QUESTION_TYPES).default("SHORT_TEXT"),
  required: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0)
});

export const updateRegistrationQuestionInputSchema = createRegistrationQuestionInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const publicRegistrationAnswerInputSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().trim().max(4000)
});

export const publicRegistrationInputSchema = z.object({
  productId: z.string().min(1),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  answers: z.array(publicRegistrationAnswerInputSchema).max(50).default([])
});
