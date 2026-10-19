import { AuthError } from "@auth/core/errors";
import { StaffIdentityError } from "./staff-session-policy";

const causeNames = new Set([
  "Error", "TypeError", "StaffIdentityError", "PrismaClientKnownRequestError", "PrismaClientValidationError",
  "JWTExpired", "JWTClaimValidationFailed", "JWTInvalid", "JWEInvalid", "JWEDecryptionFailed", "JOSEError"
]);

/** Log classifications only. OAuth error messages, stacks and causes can contain credentials. */
export function staffAuthErrorRecord(error: unknown): Record<string, string> {
  const record: Record<string, string> = { event: "staff_auth_error", type: error instanceof AuthError ? error.type : "Unknown" };
  const cause = error instanceof AuthError ? error.cause?.err : undefined;
  if (!(cause instanceof Error)) return record;
  record.causeType = causeNames.has(cause.name) ? cause.name : "Unknown";
  if (cause instanceof StaffIdentityError) record.causeCode = cause.code;
  else if (cause.name === "PrismaClientKnownRequestError" && "code" in cause &&
    typeof cause.code === "string" && /^P\d{4}$/.test(cause.code)) record.causeCode = cause.code;
  else if (cause.message.includes("outside a request scope")) record.causeType = "RequestScopeMissing";
  else if (cause.message.includes("Cookies can only be modified")) record.causeType = "CookiesReadOnly";
  return record;
}
