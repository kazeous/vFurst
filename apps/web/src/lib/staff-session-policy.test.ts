import { describe, expect, it } from "vitest";
import { assertStaffStepUp, hasFreshStaffProof, parseStaffAssurance, staffOidcCookiePolicy } from "./staff-session-policy";

const now = new Date("2026-10-19T10:00:00Z");
const primary = now.getTime() / 1_000;
function claims(overrides = {}) {
  return { auth_time: primary, amr: ["pwd", "mfa"], vfurst_assurance: {
    version: 1, policy: "vfurst-v1", primary_at: primary, primary_method: "password", mfa_enrolled: true, mfa_at: primary
  }, ...overrides };
}
describe("Pawket-compatible staff assurance", () => {
  it("protects every production OIDC cookie against sibling-host shadowing", () => {
    const policy = staffOidcCookiePolicy("https://vfurst.reyuugames.com");
    for (const cookie of Object.values(policy)) {
      expect(cookie.name).toMatch(/^__Host-vfurst-/);
      expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, path: "/", sameSite: "lax" });
      expect(cookie.options).not.toHaveProperty("domain");
    }
    expect(policy.state.options.maxAge).toBe(600);
    expect(policy.nonce.options.maxAge).toBe(600);
    expect(policy.pkceCodeVerifier.options.maxAge).toBe(600);
  });
  it("uses the same cookie separation on plain HTTP loopback for the real local OIDC flow", () => {
    for (const cookie of Object.values(staffOidcCookiePolicy("http://localhost:3000"))) {
      expect(cookie.name).toMatch(/^vfurst-/);
      expect(cookie.options.secure).toBe(false);
      expect(cookie.options).not.toHaveProperty("domain");
    }
  });
  it("accepts real MFA evidence and requires new primary authentication for step-up", () => {
    const evidence = parseStaffAssurance(claims(), now);
    expect(hasFreshStaffProof(evidence, now)).toBe(true);
    expect(() => assertStaffStepUp(evidence, now, now)).not.toThrow();
    expect(() => assertStaffStepUp(evidence, new Date(now.getTime() + 1_000), new Date(now.getTime() + 1_000))).toThrow("AssuranceRequired");
  });
  it("never mistakes a freshly issued token for fresh primary authentication", () => {
    const old = primary - 3_600;
    const evidence = parseStaffAssurance({ auth_time: old, iat: primary, amr: ["mfa"], vfurst_assurance: {
      version: 1, policy: "vfurst-v1", primary_at: old, primary_method: "password", mfa_enrolled: true, mfa_at: old
    } }, now);
    expect(hasFreshStaffProof(evidence, now)).toBe(false);
  });
  it.each([{}, { auth_time: primary + 1 }, { auth_time: primary + 0.5 }, { amr: ["pwd"] },
    { vfurst_assurance: { version: 1, policy: "another-policy" } }, { vfurst_assurance: null }])("fails closed for malformed or inconsistent evidence %j", (override) => {
    expect(() => parseStaffAssurance(Object.keys(override).length ? claims(override) : {}, now)).toThrow();
  });
  it("permits ordinary sign-in without MFA but never sensitive operations", () => {
    const evidence = parseStaffAssurance({ auth_time: primary, vfurst_assurance: {
      version: 1, policy: "vfurst-v1", primary_at: primary, primary_method: "password", mfa_enrolled: false, mfa_at: null
    } }, now);
    expect(hasFreshStaffProof(evidence, now)).toBe(false);
  });
});
