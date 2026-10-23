import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EMERGENCY_CONTACTS, contactDrafts, emergencyContactsSchema, mergeEmergencyContacts,
  parseStoredEmergencyContacts, readEmergencyContacts, type EmergencyContact
} from "./emergency-contacts";

const A: EmergencyContact = { name: "Alex", country: "VN", phone: "+84812205668" };
const B: EmergencyContact = { name: "Blair", country: "US", phone: "+14155550100" };
const optional = { mode: "optional", count: 2 } as const;
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
afterEach(() => vi.restoreAllMocks());

describe("emergency contacts", () => {
  it("skips empty rows and rejects half-filled ones", () => {
    expect(readEmergencyContacts(form({ "contact-0-country": "VN", "contact-1-name": " \t " }), optional)).toEqual({ ok: true, contacts: [] });
    expect(readEmergencyContacts(form({ "contact-1-name": "Blair" }), optional)).toEqual({ ok: false, error: "Add a phone number for contact 2." });
    expect(readEmergencyContacts(form({ "contact-0-number": "0812205668" }), optional)).toEqual({ ok: false, error: "Enter a name for contact 1." });
  });

  it("requires the first row in required mode", () => {
    expect(readEmergencyContacts(new FormData(), { mode: "required", count: 2 })).toEqual({ ok: false, error: "Add an emergency contact." });
    expect(readEmergencyContacts(form({ "contact-1-name": "Blair", "contact-1-country": "US", "contact-1-number": "4155550100" }), { mode: "required", count: 2 })).toEqual({ ok: false, error: "Add an emergency contact." });
    expect(readEmergencyContacts(form({ "contact-0-name": "Alex", "contact-0-country": "VN", "contact-0-number": "0812205668" }), { mode: "required", count: 2 })).toEqual({ ok: true, contacts: [A] });
  });

  it("reads only rows below count", () => {
    expect(readEmergencyContacts(form({ "contact-1-name": "Blair" }), { mode: "optional", count: 1 })).toEqual({ ok: true, contacts: [] });
  });

  it("mode off reads nothing", () => {
    expect(readEmergencyContacts(form({ "contact-0-name": "Alex" }), { mode: "off", count: 2 })).toEqual({ ok: true, contacts: [] });
  });

  it("rejects an invalid phone", () => {
    for (const values of [{ "contact-0-number": "invalid", "contact-0-country": "VN" }, { "contact-0-number": "0812205668", "contact-0-country": "ZZ" }]) {
      expect(readEmergencyContacts(form({ "contact-0-name": "Alex", ...values }), optional)).toEqual({ ok: false, error: "Enter a valid phone number for contact 1." });
    }
  });

  it("normalizes names and phones and enforces the cleaned name limit", () => {
    expect(readEmergencyContacts(form({ "contact-0-name": "  Ale\u0301x\n  Smith ", "contact-0-country": "VN", "contact-0-number": "081 220 5668" }), optional)).toEqual({ ok: true, contacts: [{ ...A, name: "Aléx Smith" }] });
    expect(readEmergencyContacts(form({ "contact-0-name": "x".repeat(121), "contact-0-country": "VN", "contact-0-number": "0812205668" }), optional)).toEqual({ ok: false, error: "Contact names must be 120 characters or fewer." });
    expect(readEmergencyContacts(form({ "contact-0-name": ` ${"x".repeat(120)} `, "contact-0-country": "VN", "contact-0-number": "0812205668" }), optional).ok).toBe(true);
  });

  it("mergeEmergencyContacts keeps stored contacts beyond count", () => {
    const edited = { ...A, name: "Alex Updated" };
    expect(mergeEmergencyContacts([A, B], [edited], 1)).toEqual([edited, B]);
    expect(mergeEmergencyContacts([A, B], [], 1)).toEqual([B]);
    expect(mergeEmergencyContacts([A, B], [], 2)).toEqual([]);
    expect(mergeEmergencyContacts([A, B], [edited], 2)).toEqual([edited]);
  });

  it("parseStoredEmergencyContacts returns [] for malformed JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const value of [null, undefined, "{broken", JSON.stringify([A]), {}, [A, B, A], [{ ...A, country: "ZZ" }], [{ ...A, phone: "0812205668" }], [{ ...A, country: "US" }], [{ ...A, name: " " }]]) {
      expect(parseStoredEmergencyContacts(value)).toEqual([]);
    }
    expect(warn).toHaveBeenCalledTimes(10);
    // Warning metadata must not expose names or phone numbers.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(A.phone);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(A.name);
    expect(parseStoredEmergencyContacts([A, B])).toEqual([A, B]);
    expect(parseStoredEmergencyContacts([])).toEqual([]);
  });

  it("validates stored contact limits and canonical E.164 phone numbers", () => {
    expect(MAX_EMERGENCY_CONTACTS).toBe(2);
    expect(emergencyContactsSchema.safeParse([A, B]).success).toBe(true);
    expect(emergencyContactsSchema.safeParse([{ ...A, phone: "+840812205668" }]).success).toBe(true);
    for (const phone of ["+84 812205668", "+8412345", "+8412345678901234", "84812205668"]) {
      expect(emergencyContactsSchema.safeParse([{ ...A, phone }]).success).toBe(false);
    }
    expect(emergencyContactsSchema.parse([{ ...A, name: "  Ale\u0301x   Smith " }])[0]?.name).toBe("Aléx Smith");
  });

  it("builds exactly count drafts with national numbers and the VN default", () => {
    expect(contactDrafts([A, B], 1)).toEqual([{ name: "Alex", country: "VN", number: "812205668" }]);
    expect(contactDrafts([A], 2)).toEqual([{ name: "Alex", country: "VN", number: "812205668" }, { name: "", country: "VN", number: "" }]);
    expect(contactDrafts([], 1)).toEqual([{ name: "", country: "VN", number: "" }]);
  });
});
