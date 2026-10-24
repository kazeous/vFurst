import { z } from "zod";
import { readEmergencyContacts, type ContactsRequirement, type EmergencyContact } from "./emergency-contacts";
import { formFieldSchema, readFormResponses, REGISTRATION_FORM_LIMITS, type FormField, type FormResponses } from "./form-fields";

export type RegistrationForm = { contacts: ContactsRequirement; questions: FormField[] };
export type RegistrationDetails = { contacts: EmergencyContact[] | null; responses: FormResponses | null };

const contactsSchema = z.object({
  mode: z.enum(["off", "optional", "required"]),
  count: z.union([z.literal(1), z.literal(2)])
});

// Registration limits are separate so volunteer forms retain their existing schema.
const questionSchema = formFieldSchema.extend({
  label: z.string().trim().min(1, "Each question needs a label.")
    .max(REGISTRATION_FORM_LIMITS.label, "Question labels must be 200 characters or fewer."),
  options: z.array(z.string().trim().min(1)
    .max(REGISTRATION_FORM_LIMITS.option, "Options must be 100 characters or fewer."))
    .max(REGISTRATION_FORM_LIMITS.options, "A choice question can have at most 50 options.").optional()
}).superRefine((field, context) => {
  if (field.type === "select" && !field.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: `Add at least one option to ${field.label}.` });
  }
});

const questionsSchema = z.array(questionSchema)
  .max(REGISTRATION_FORM_LIMITS.questions, "A form can have at most 30 questions.")
  .superRefine((questions, context) => {
    const ids = new Set<string>();
    for (const [index, question] of questions.entries()) {
      if (ids.has(question.id)) {
        context.addIssue({ code: "custom", path: [index, "id"], message: "Question ids must be unique." });
      }
      ids.add(question.id);
    }
  });

const storedFormSchema = z.object({
  emergencyContacts: contactsSchema.default({ mode: "off", count: 1 }),
  questions: questionsSchema.default([])
});

export function getRegistrationForm(value: unknown): RegistrationForm {
  const parsed = storedFormSchema.safeParse(value);
  if (parsed.success) return { contacts: parsed.data.emergencyContacts, questions: parsed.data.questions };
  console.warn("Invalid stored registration form; using the default form.");
  return { contacts: { mode: "off", count: 1 }, questions: [] };
}

export function hasRegistrationDetails(form: RegistrationForm): boolean {
  return form.contacts.mode !== "off" || form.questions.length > 0;
}

const inputSchema = z.object({
  contactsMode: contactsSchema.shape.mode.default("off"),
  contactsCount: z.preprocess((value) => typeof value === "string" ? Number(value) : value,
    contactsSchema.shape.count.default(1)),
  questions: z.string().transform((raw, context): unknown => {
    if (!raw.trim()) return [];
    try {
      return JSON.parse(raw);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid input" });
      return z.NEVER;
    }
  }).pipe(questionsSchema).default([])
});

export function parseRegistrationFormInput(formData: FormData): RegistrationForm {
  const parsed = inputSchema.parse({
    contactsMode: formData.get("contactsMode") ?? undefined,
    contactsCount: formData.get("contactsCount") ?? undefined,
    questions: formData.get("questions") ?? undefined
  });
  return { contacts: { mode: parsed.contactsMode, count: parsed.contactsCount }, questions: parsed.questions };
}

export function toStoredRegistrationForm(form: RegistrationForm): { emergencyContacts: ContactsRequirement; questions: FormField[] } {
  return { emergencyContacts: form.contacts, questions: form.questions };
}

export function readRegistrationDetails(form: RegistrationForm, formData: FormData):
  { ok: true; details: RegistrationDetails } | { ok: false; error: string } {
  const contacts = readEmergencyContacts(formData, form.contacts);
  if (!contacts.ok) return contacts;
  const responses = readFormResponses(form.questions, formData);
  if (!responses.ok) return responses;
  return {
    ok: true,
    details: {
      contacts: form.contacts.mode === "off" ? null : contacts.contacts,
      responses: form.questions.length === 0 ? null : responses.responses
    }
  };
}

export function canEditRegistrationAnswers(input: { status: string; eventStartDate: Date }, now: Date = new Date()): boolean {
  return (input.status === "PENDING" || input.status === "CONFIRMED") && now < input.eventStartDate;
}
