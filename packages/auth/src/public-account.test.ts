import { describe, expect, it } from "vitest";
import {
  PUBLIC_ACCOUNT_EMAIL_MISMATCH_MESSAGE,
  assertPublicAccountEmail,
  normalizePublicAccountEmail,
  normalizePublicAccountName,
  publicAccountEmailMatches,
  shouldUpdatePublicAccountName
} from "./public-account.js";

describe("public account identity", () => {
  it("matches submitted email using the central normalization policy", () => {
    const account = { email: " Attendee@Example.COM " };

    expect(normalizePublicAccountEmail(account.email)).toBe("attendee@example.com");
    expect(publicAccountEmailMatches(account, "attendee@example.com")).toBe(true);
    expect(() => assertPublicAccountEmail(account, " ATTENDEE@example.com ")).not.toThrow();
  });

  it("rejects a submitted identity that differs from the signed-in account", () => {
    const account = { email: "attendee@example.com" };

    expect(publicAccountEmailMatches(account, "other@example.com")).toBe(false);
    expect(() => assertPublicAccountEmail(account, "other@example.com")).toThrow(
      PUBLIC_ACCOUNT_EMAIL_MISMATCH_MESSAGE
    );
  });
});

describe("public account name normalization", () => {
  it("trims boundary whitespace without rewriting the person's name", () => {
    expect(normalizePublicAccountName("  Trần  Hải  An  ")).toBe("Trần  Hải  An");
  });

  it("updates only when a non-empty normalized name changed", () => {
    expect(shouldUpdatePublicAccountName("Ada Lovelace", " Ada Lovelace ")).toBe(false);
    expect(shouldUpdatePublicAccountName("Ada Lovelace", "Ada Byron")).toBe(true);
    expect(shouldUpdatePublicAccountName(null, "Grace Hopper")).toBe(true);
    expect(shouldUpdatePublicAccountName(undefined, "   ")).toBe(false);
  });
});
