import { describe, expect, it } from "vitest";
import {
  formFieldSchema, isValidStoredAnswer, parseStoredFormResponses, readFormResponses,
  REGISTRATION_FORM_LIMITS, type FormField
} from "./form-fields";

const question: FormField = { id: "size", type: "text", label: "T-shirt size", required: true };
function answers(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(`field-${key}`, value);
  return data;
}

describe("form fields", () => {
  it("preserves the volunteer field shape without imposing registration limits", () => {
    expect(formFieldSchema.parse({ ...question, id: " size ", label: " T-shirt size ", options: [" XL "] }))
      .toEqual({ ...question, options: ["XL"] });
    expect(formFieldSchema.safeParse({ ...question, label: "x".repeat(201), options: [] }).success).toBe(true);
    expect(formFieldSchema.safeParse({ ...question, id: " " }).success).toBe(false);
    expect(formFieldSchema.safeParse({ ...question, options: [" "] }).success).toBe(false);
    expect(formFieldSchema.safeParse({ ...question, required: "true" }).success).toBe(false);
  });

  it("exports the fixed registration limits", () => {
    expect(REGISTRATION_FORM_LIMITS).toEqual({ questions: 30, label: 200, options: 50, option: 100, text: 500, textarea: 5000 });
  });

  it.each(["text", "textarea"] as const)("trims %s and enforces its inclusive answer limit", (type) => {
    const field = { ...question, type };
    const max = type === "text" ? 500 : 5000;
    expect(readFormResponses([field], answers({ size: "  hello\n " }))).toEqual({ ok: true, responses: { size: "hello" } });
    expect(readFormResponses([field], answers({ size: ` ${"x".repeat(max)} ` }))).toEqual({ ok: true, responses: { size: "x".repeat(max) } });
    expect(readFormResponses([field], answers({ size: "x".repeat(max + 1) }))).toEqual({ ok: false, error: `T-shirt size must be ${max} characters or fewer.` });
  });

  it("requires text and treats whitespace or a file as missing", () => {
    for (const data of [new FormData(), answers({ size: " \n " }), answers({ other: "value" })]) {
      expect(readFormResponses([question], data)).toEqual({ ok: false, error: "T-shirt size is required." });
    }
    const data = new FormData();
    data.set("field-size", new Blob(["value"]), "answer.txt");
    expect(readFormResponses([question], data)).toEqual({ ok: false, error: "T-shirt size is required." });
    expect(readFormResponses([{ ...question, required: false }], new FormData())).toEqual({ ok: true, responses: { size: "" } });
  });

  it("requires a checked required checkbox and stores false for an unchecked optional one", () => {
    const field = { ...question, type: "checkbox" as const };
    for (const data of [new FormData(), answers({ size: "on" }), answers({ size: "false" })]) {
      expect(readFormResponses([field], data)).toEqual({ ok: false, error: "T-shirt size is required." });
    }
    expect(readFormResponses([field], answers({ size: "true" }))).toEqual({ ok: true, responses: { size: true } });
    expect(readFormResponses([{ ...field, required: false }], new FormData())).toEqual({ ok: true, responses: { size: false } });
  });

  it("rejects a select value outside the options", () => {
    const field = { ...question, type: "select" as const, options: ["Extra large"] };
    expect(readFormResponses([field], answers({ size: "XL" }))).toEqual({ ok: false, error: "Choose a valid option for T-shirt size." });
    expect(readFormResponses([field], answers({ size: " Extra large " }))).toEqual({ ok: true, responses: { size: "Extra large" } });
    expect(readFormResponses([field], new FormData())).toEqual({ ok: false, error: "T-shirt size is required." });
    expect(readFormResponses([{ ...field, required: false }], new FormData())).toEqual({ ok: true, responses: { size: "" } });
    expect(readFormResponses([{ ...field, required: false }], answers({ size: "XL" })).ok).toBe(false);
  });

  it("reads configured fields only and returns the first error", () => {
    expect(readFormResponses([], answers({ injected: "secret" }))).toEqual({ ok: true, responses: {} });
    expect(readFormResponses([question, { ...question, id: "other", label: "Other" }], new FormData()))
      .toEqual({ ok: false, error: "T-shirt size is required." });
  });

  it("accepts stored strings and booleans and defaults invalid stored answers to an empty object", () => {
    expect(parseStoredFormResponses({ size: "XL", agreed: false })).toEqual({ size: "XL", agreed: false });
    for (const value of [null, undefined, [], "{broken", '{"size":"XL"}', { size: 1 }, { size: ["XL"] }, { size: null }]) {
      expect(parseStoredFormResponses(value)).toEqual({});
    }
  });

  it("isValidStoredAnswer applies the reader's rules to stored values", () => {
    const size: FormField = { id: "size", type: "select", label: "T-shirt size", required: true, options: ["Extra large"] };
    const accessible: FormField = { id: "access", type: "checkbox", label: "Wheelchair access", required: false };
    expect(isValidStoredAnswer(size, "Extra large")).toBe(true);
    expect(isValidStoredAnswer(size, "XL")).toBe(false);
    expect(isValidStoredAnswer(size, "")).toBe(false);
    expect(isValidStoredAnswer(size, true)).toBe(false);
    expect(isValidStoredAnswer(accessible, false)).toBe(true);
    expect(isValidStoredAnswer(accessible, "true")).toBe(false);
    expect(isValidStoredAnswer(question, "x".repeat(REGISTRATION_FORM_LIMITS.text + 1))).toBe(false);
    expect(isValidStoredAnswer(question, undefined)).toBe(false);
  });
});
