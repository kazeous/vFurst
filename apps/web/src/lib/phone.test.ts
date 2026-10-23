import { describe, expect, it } from "vitest";
import { DEFAULT_DIAL_COUNTRY, DIAL_CODES, findDialCode } from "./dial-codes";
import { formatPhone, nationalNumber, normalizePhone } from "./phone";

describe("phone numbers", () => {
  it("normalizes Vietnamese local, spaced and international input", () => {
    for (const input of ["081 220 5668", "+84 81 220 5668", "0084812205668", "(081)\u00a0220-56.68"]) {
      expect(normalizePhone("VN", input)).toEqual({ ok: true, phone: "+84812205668" });
    }
  });

  it("keeps Italy's leading zero", () => {
    expect(normalizePhone("IT", "06 6982 1234")).toEqual({ ok: true, phone: "+390669821234" });
    expect(normalizePhone("VA", "+39 06 6982 1234")).toEqual({ ok: true, phone: "+390669821234" });
    expect(normalizePhone("SM", "0549 123456")).toEqual({ ok: true, phone: "+3780549123456" });
  });

  it("rejects an international number for another country", () => {
    expect(normalizePhone("VN", "+1 415 555 0100")).toEqual({ ok: false });
    expect(normalizePhone("VN", "0014155550100")).toEqual({ ok: false });
  });

  it("rejects letters, too short and too long", () => {
    for (const input of ["0812abc", "12345", "+8412345678901234", "", "++84812205668", "081/2205668"]) {
      expect(normalizePhone("VN", input)).toEqual({ ok: false });
    }
    expect(normalizePhone("ZZ", "0812205668")).toEqual({ ok: false });
  });

  it("enforces the inclusive 8–15 total digit range and drops only one trunk zero", () => {
    expect(normalizePhone("VN", "123456")).toEqual({ ok: true, phone: "+84123456" });
    expect(normalizePhone("VN", "1234567890123")).toEqual({ ok: true, phone: "+841234567890123" });
    expect(normalizePhone("VN", "+84 00812205668")).toEqual({ ok: true, phone: "+840812205668" });
  });

  it("formats and splits by the stored country", () => {
    const contact = { country: "VN", phone: "+84812205668" };
    expect(formatPhone(contact)).toBe("+84 812205668");
    expect(nationalNumber(contact)).toBe("812205668");
    for (const country of ["US", "ZZ"]) {
      expect(formatPhone({ ...contact, country })).toBe(contact.phone);
      expect(nationalNumber({ ...contact, country })).toBe(contact.phone);
    }
    expect(nationalNumber({ country: "IT", phone: "+390669821234" })).toBe("0669821234");
  });

  it("has the dial codes the tests rely on", () => {
    expect(DEFAULT_DIAL_COUNTRY).toBe("VN");
    for (const [country, dialCode] of Object.entries({ VN: "84", US: "1", CA: "1", GB: "44", IT: "39", SM: "378", VA: "39", RU: "7", KZ: "7" })) {
      expect(findDialCode(country)?.dialCode).toBe(dialCode);
    }
    expect(new Set(DIAL_CODES.map(({ country }) => country)).size).toBe(DIAL_CODES.length);
    expect(DIAL_CODES.length).toBeGreaterThanOrEqual(200);
    expect(DIAL_CODES.every(({ country, dialCode }) => /^[A-Z]{2}$/.test(country) && /^[1-9]\d{0,2}$/.test(dialCode))).toBe(true);
    expect(DIAL_CODES.map(({ name }) => name)).toEqual(DIAL_CODES.map(({ name }) => name).sort((a, b) => a.localeCompare(b, "en")));
    expect(findDialCode("ZZ")).toBeUndefined();
  });
});
