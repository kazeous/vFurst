import { z } from "zod";
import { EMAIL_TEMPLATE_KEYS } from "@/shared/email";

export const emailTemplateKeySchema = z.enum(EMAIL_TEMPLATE_KEYS);

export const upsertEmailTemplateSchema = z.object({
  key: emailTemplateKeySchema,
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(180),
  bodyText: z.string().trim().min(2).max(8000),
  bodyHtml: z
    .string()
    .trim()
    .max(12000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  enabled: z.boolean().default(true),
  nonCritical: z.boolean().default(true)
});

export const previewEmailTemplateSchema = upsertEmailTemplateSchema.partial({
  name: true,
  subject: true,
  bodyText: true,
  bodyHtml: true,
  enabled: true,
  nonCritical: true
}).extend({
  key: emailTemplateKeySchema
});

export type UpsertEmailTemplateInput = z.infer<typeof upsertEmailTemplateSchema>;
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;

