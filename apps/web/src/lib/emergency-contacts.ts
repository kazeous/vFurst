import { z } from "zod";
import { DEFAULT_DIAL_COUNTRY, findDialCode } from "./dial-codes";
import { nationalNumber, normalizePhone } from "./phone";

export const MAX_EMERGENCY_CONTACTS = 2;
export type EmergencyContact = { name: string; country: string; phone: string };
export type ContactsRequirement = { mode: "off" | "optional" | "required"; count: 1 | 2 };
export type ContactDraft = { name: string; country: string; number: string };

// Same cleanFullName rule as attendee profiles, kept here to stay client-safe.
function cleanFullName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

export const emergencyContactsSchema: z.ZodType<EmergencyContact[]> = z.array(z.object({
  name: z.string().transform(cleanFullName).pipe(z.string().min(1).max(120)),
  country: z.string().refine((country) => Boolean(findDialCode(country))),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/)
}).refine((contact) => {
  const dial = findDialCode(contact.country);
  return dial !== undefined && contact.phone.startsWith(`+${dial.dialCode}`);
})).max(MAX_EMERGENCY_CONTACTS);

export function parseStoredEmergencyContacts(value: unknown): EmergencyContact[] {
  const parsed = emergencyContactsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn("Invalid stored emergency contacts; using an empty list.");
  return [];
}

export function readEmergencyContacts(formData: FormData, requirement: ContactsRequirement):
  { ok: true; contacts: EmergencyContact[] } | { ok: false; error: string } {
  if (requirement.mode === "off") return { ok: true, contacts: [] };
  const contacts: EmergencyContact[] = [];
  for (let index = 0; index < requirement.count; index += 1) {
    const read = (field: string) => {
      const value = formData.get(`contact-${index}-${field}`);
      return typeof value === "string" ? value : "";
    };
    const name = cleanFullName(read("name"));
    const number = read("number").trim();
    if (!name && !number) {
      if (index === 0 && requirement.mode === "required") return { ok: false, error: "Add an emergency contact." };
      continue;
    }
    if (!name) return { ok: false, error: `Enter a name for contact ${index + 1}.` };
    if (name.length > 120) return { ok: false, error: "Contact names must be 120 characters or fewer." };
    if (!number) return { ok: false, error: `Add a phone number for contact ${index + 1}.` };
    const country = read("country");
    const normalized = normalizePhone(country, number);
    if (!normalized.ok) return { ok: false, error: `Enter a valid phone number for contact ${index + 1}.` };
    contacts.push({ name, country, phone: normalized.phone });
  }
  return { ok: true, contacts };
}

export function mergeEmergencyContacts(stored: EmergencyContact[], submitted: EmergencyContact[], count: 1 | 2): EmergencyContact[] {
  return [...submitted.slice(0, count), ...stored.slice(count)];
}

export function contactDrafts(stored: EmergencyContact[], count: 1 | 2): ContactDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const contact = stored[index];
    return contact ? { name: contact.name, country: contact.country, number: nationalNumber(contact) }
      : { name: "", country: DEFAULT_DIAL_COUNTRY, number: "" };
  });
}
