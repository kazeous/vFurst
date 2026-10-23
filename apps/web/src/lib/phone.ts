import { findDialCode } from "./dial-codes";

export function normalizePhone(country: string, input: string): { ok: true; phone: string } | { ok: false } {
  const dial = findDialCode(country);
  if (!dial) return { ok: false };
  let number = input.replace(/[- \u00a0.()]/g, "");
  if (number.startsWith("+") || number.startsWith("00")) {
    number = number.slice(number.startsWith("+") ? 1 : 2);
    if (!number.startsWith(dial.dialCode)) return { ok: false };
    number = number.slice(dial.dialCode.length);
  }
  if (!["IT", "SM", "VA"].includes(country) && number.startsWith("0")) number = number.slice(1);
  const digits = dial.dialCode + number;
  if (!/^\d+$/.test(number) || digits.length < 8 || digits.length > 15) return { ok: false };
  return { ok: true, phone: `+${digits}` };
}

export function formatPhone(contact: { country: string; phone: string }): string {
  const dial = findDialCode(contact.country);
  return dial && contact.phone.startsWith(`+${dial.dialCode}`)
    ? `+${dial.dialCode} ${nationalNumber(contact)}` : contact.phone;
}

export function nationalNumber(contact: { country: string; phone: string }): string {
  const dial = findDialCode(contact.country);
  const prefix = dial ? `+${dial.dialCode}` : undefined;
  return prefix && contact.phone.startsWith(prefix) ? contact.phone.slice(prefix.length) : contact.phone;
}
