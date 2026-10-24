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

function answerError(field: FormField, value: string | boolean): string | null {
  if (field.type === "checkbox") return field.required && value !== true ? `${field.label} is required.` : null;
  const text = String(value);
  if (field.required && !text) return `${field.label} is required.`;
  if (field.type === "select") return text && !field.options?.includes(text) ? `Choose a valid option for ${field.label}.` : null;
  const max = REGISTRATION_FORM_LIMITS[field.type];
  return text.length > max ? `${field.label} must be ${max} characters or fewer.` : null;
}

/** Whether a stored answer still satisfies the field as it is configured now. */
export function isValidStoredAnswer(field: FormField, value: unknown): value is string | boolean {
  const matchesType = field.type === "checkbox" ? typeof value === "boolean" : typeof value === "string";
  return matchesType && answerError(field, value as string | boolean) === null;
}

export function readFormResponses(fields: FormField[], formData: FormData):
  { ok: true; responses: FormResponses } | { ok: false; error: string } {
  const entries: [string, string | boolean][] = [];
  for (const field of fields) {
    const raw = formData.get(`field-${field.id}`);
    const value = field.type === "checkbox" ? raw === "true" : typeof raw === "string" ? raw.trim() : "";
    const error = answerError(field, value);
    if (error) return { ok: false, error };
    entries.push([field.id, value]);
  }
  return { ok: true, responses: Object.fromEntries(entries) };
}
