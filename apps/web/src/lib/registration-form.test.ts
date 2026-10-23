import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FormField } from "./form-fields";
import {
  canEditRegistrationAnswers, getRegistrationForm, hasRegistrationDetails,
  parseRegistrationFormInput, readRegistrationDetails, toStoredRegistrationForm,
  type RegistrationForm
} from "./registration-form";

const question: FormField = { id: "size", type: "text", label: "T-shirt size", required: true };
const defaultForm: RegistrationForm = { contacts: { mode: "off", count: 1 }, questions: [] };
function input(questions: unknown = [], values: Record<string, string> = {}) {
  const data = new FormData();
  data.set("contactsMode", "off");
  data.set("contactsCount", "1");
  data.set("questions", JSON.stringify(questions));
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
function validationMessage(data: FormData) {
  try {
    parseRegistrationFormInput(data);
  } catch (error) {
    expect(error).toBeInstanceOf(z.ZodError);
    return (error as z.ZodError).issues[0]?.message;
  }
  throw new Error("Expected validation to fail");
}
afterEach(() => vi.restoreAllMocks());

describe("registration form", () => {
  it("defaults missing configuration and warns for malformed stored JSON without exposing it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getRegistrationForm({})).toEqual(defaultForm);
    expect(warn).not.toHaveBeenCalled();
    for (const value of ["{broken", null, [], { emergencyContacts: { mode: "invalid", count: 1 } }, { questions: [{ ...question, label: "secret invalid label", type: "unknown" }] }]) {
      expect(getRegistrationForm(value)).toEqual(defaultForm);
    }
    expect(warn).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret invalid label");
    expect(getRegistrationForm({ questions: [question] })).toEqual({ ...defaultForm, questions: [question] });
    expect(getRegistrationForm({ emergencyContacts: { mode: "optional", count: 2 } }))
      .toEqual({ contacts: { mode: "optional", count: 2 }, questions: [] });
  });

  it.each([
    [[{ ...question, label: " \t " }], "Each question needs a label."],
    [[{ ...question, label: "x".repeat(201) }], "Question labels must be 200 characters or fewer."],
    [Array.from({ length: 31 }, (_, index) => ({ ...question, id: String(index) })), "A form can have at most 30 questions."],
    [[{ ...question, type: "select", options: [] }], "Add at least one option to T-shirt size."],
    [[{ ...question, type: "select" }], "Add at least one option to T-shirt size."],
    [[{ ...question, type: "select", options: Array.from({ length: 51 }, (_, index) => String(index)) }], "A choice question can have at most 50 options."],
    [[{ ...question, type: "select", options: ["x".repeat(101)] }], "Options must be 100 characters or fewer."],
    [[question, { ...question, id: " size " }], "Question ids must be unique."]
  ])("rejects invalid questions with exact copy (%#)", (questions, message) => {
    expect(validationMessage(input(questions))).toBe(message);
  });

  it("accepts inclusive limits and normalizes labels and options", () => {
    const questions = Array.from({ length: 30 }, (_, index) => ({
      ...question, id: String(index), type: "select", label: ` ${"x".repeat(200)} `,
      options: Array.from({ length: 50 }, () => ` ${"x".repeat(100)} `)
    }));
    const parsed = parseRegistrationFormInput(input(questions, { contactsMode: "required", contactsCount: "2" }));
    expect(parsed.contacts).toEqual({ mode: "required", count: 2 });
    expect(parsed.questions).toHaveLength(30);
    expect(parsed.questions[0]?.label).toHaveLength(200);
    expect(parsed.questions[0]?.options?.[0]).toHaveLength(100);
    expect(toStoredRegistrationForm(parsed)).toEqual({ emergencyContacts: parsed.contacts, questions: parsed.questions });
    expect(getRegistrationForm(toStoredRegistrationForm(parsed))).toEqual(parsed);
  });

  it("throws ZodError for malformed input JSON, invalid contacts, empty options and invalid field shapes", () => {
    for (const data of [
      input([], { questions: "{broken" }), input([], { contactsMode: "invalid" }),
      input([], { contactsCount: "3" }), input({}),
      input([{ ...question, type: "select", options: [" "] }]),
      input([{ ...question, id: " " }]), input([{ ...question, required: "true" }])
    ]) expect(() => parseRegistrationFormInput(data)).toThrow(z.ZodError);
    expect(parseRegistrationFormInput(new FormData())).toEqual(defaultForm);
  });

  it("rejects invalid stored questions with the same registration limits", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getRegistrationForm({ questions: [{ ...question, label: "x".repeat(201) }] })).toEqual(defaultForm);
    expect(getRegistrationForm({ questions: [question, question] })).toEqual(defaultForm);
    expect(getRegistrationForm({ questions: [{ ...question, type: "select", options: [] }] })).toEqual(defaultForm);
  });

  it("detects configured contacts or questions", () => {
    expect(hasRegistrationDetails(defaultForm)).toBe(false);
    expect(hasRegistrationDetails({ ...defaultForm, contacts: { mode: "optional", count: 1 } })).toBe(true);
    expect(hasRegistrationDetails({ ...defaultForm, contacts: { mode: "required", count: 2 } })).toBe(true);
    expect(hasRegistrationDetails({ ...defaultForm, questions: [question] })).toBe(true);
  });

  it("reports the contact error before the answer error", () => {
    const form: RegistrationForm = { contacts: { mode: "required", count: 1 }, questions: [question] };
    expect(readRegistrationDetails(form, new FormData())).toEqual({ ok: false, error: "Add an emergency contact." });
    const data = input([], { "contact-0-name": "Alex", "contact-0-country": "VN", "contact-0-number": "0812205668" });
    expect(readRegistrationDetails(form, data)).toEqual({ ok: false, error: "T-shirt size is required." });
    data.set("field-size", "XL");
    expect(readRegistrationDetails(form, data)).toEqual({ ok: true, details: { contacts: [{ name: "Alex", country: "VN", phone: "+84812205668" }], responses: { size: "XL" } } });
  });

  it("returns nulls for unconfigured parts and empty contacts for optional empty rows", () => {
    expect(readRegistrationDetails(defaultForm, input([], { "contact-0-name": "ignored", "field-size": "ignored" })))
      .toEqual({ ok: true, details: { contacts: null, responses: null } });
    expect(readRegistrationDetails({ ...defaultForm, contacts: { mode: "optional", count: 1 } }, new FormData()))
      .toEqual({ ok: true, details: { contacts: [], responses: null } });
    expect(readRegistrationDetails({ ...defaultForm, questions: [question] }, input([], { "field-size": "XL" })))
      .toEqual({ ok: true, details: { contacts: null, responses: { size: "XL" } } });
  });

  it("permits only pending or confirmed answers strictly before event start", () => {
    const eventStartDate = new Date("2026-11-01T00:00:00Z");
    const before = new Date(eventStartDate.getTime() - 1);
    for (const status of ["PENDING", "CONFIRMED"]) {
      expect(canEditRegistrationAnswers({ status, eventStartDate }, before)).toBe(true);
      expect(canEditRegistrationAnswers({ status, eventStartDate }, eventStartDate)).toBe(false);
      expect(canEditRegistrationAnswers({ status, eventStartDate }, new Date(eventStartDate.getTime() + 1))).toBe(false);
    }
    for (const status of ["CHECKED_IN", "CANCELLED", "REFUNDED", "UNKNOWN"]) {
      expect(canEditRegistrationAnswers({ status, eventStartDate }, before)).toBe(false);
    }
    vi.useFakeTimers();
    try {
      vi.setSystemTime(before);
      expect(canEditRegistrationAnswers({ status: "CONFIRMED", eventStartDate })).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
