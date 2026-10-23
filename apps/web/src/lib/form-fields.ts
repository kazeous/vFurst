import { z } from "zod";

export const formFieldSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["text", "select", "checkbox", "textarea"]),
  label: z.string().trim().min(1),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1)).optional()
});

export type FormField = z.infer<typeof formFieldSchema>;
export type FormResponses = Record<string, string | boolean>;

export const REGISTRATION_FORM_LIMITS = {
  questions: 30, label: 200, options: 50, option: 100, text: 500, textarea: 5000
} as const;

const formResponsesSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));

export function parseStoredFormResponses(value: unknown): FormResponses {
  const parsed = formResponsesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function readFormResponses(fields: FormField[], formData: FormData):
  { ok: true; responses: FormResponses } | { ok: false; error: string } {
  const entries: [string, string | boolean][] = [];
  for (const field of fields) {
    const raw = formData.get(`field-${field.id}`);
    if (field.type === "checkbox") {
      const checked = raw === "true";
      if (field.required && !checked) return { ok: false, error: `${field.label} is required.` };
      entries.push([field.id, checked]);
      continue;
    }

    const value = typeof raw === "string" ? raw.trim() : "";
    if (field.required && !value) return { ok: false, error: `${field.label} is required.` };
    if (field.type === "select") {
      if (value && !field.options?.includes(value)) return { ok: false, error: `Choose a valid option for ${field.label}.` };
    } else {
      const max = REGISTRATION_FORM_LIMITS[field.type];
      if (value.length > max) return { ok: false, error: `${field.label} must be ${max} characters or fewer.` };
    }
    entries.push([field.id, value]);
  }
  return { ok: true, responses: Object.fromEntries(entries) };
}
