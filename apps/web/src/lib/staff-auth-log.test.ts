import { describe, expect, it } from "vitest";
import { AuthError } from "@auth/core/errors";
import { StaffIdentityError } from "./staff-session-policy";
import { staffAuthErrorRecord } from "./staff-auth-log";

const authError = (cause: Error) => new AuthError("redacted", { cause: { err: cause } });

describe("bounded staff authentication diagnostics", () => {
  it("keeps useful identity and database classifications without raw causes", () => {
    expect(staffAuthErrorRecord(authError(new StaffIdentityError("SessionRevoked"))))
      .toMatchObject({ causeType: "StaffIdentityError", causeCode: "SessionRevoked" });
    const databaseError = Object.assign(new Error("private database details"), { name: "PrismaClientKnownRequestError", code: "P2034" });
    expect(staffAuthErrorRecord(authError(databaseError))).toMatchObject({ causeType: "PrismaClientKnownRequestError", causeCode: "P2034" });
  });
  it("never emits messages, arbitrary names/codes, token URLs, stacks or extra cause properties", () => {
    const secret = "private-oauth-token-123";
    const cause = Object.assign(new Error(`https://account.example/?code=${secret}`), { name: secret, code: secret, token: secret });
    const result = staffAuthErrorRecord(authError(cause));
    expect(result).toMatchObject({ event: "staff_auth_error", causeType: "Unknown" });
    expect(result).not.toHaveProperty("causeCode");
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("recognizes cookie/request-context failures without printing their messages", () => {
    expect(staffAuthErrorRecord(authError(new Error("cookies was called outside a request scope")))).toMatchObject({ causeType: "RequestScopeMissing" });
    expect(staffAuthErrorRecord(authError(new Error("Cookies can only be modified in a Server Action or Route Handler.")))).toMatchObject({ causeType: "CookiesReadOnly" });
  });
  it("classifies malformed encrypted-cookie failures without disclosing their contents", () => {
    const result = staffAuthErrorRecord(authError(Object.assign(new Error("private-cookie-content"), { name: "JWEInvalid" })));
    expect(result).toMatchObject({ causeType: "JWEInvalid" });
    expect(JSON.stringify(result)).not.toContain("private-cookie-content");
  });
});
