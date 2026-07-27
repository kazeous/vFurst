import { RateLimitExceededError } from "@/lib/rate-limit";
import { RegistrationPolicyError } from "@/lib/registration-policy";
import { OrganizationLifecycleError } from "@/lib/organization-lifecycle";
import { ExpectedActionError } from "@/lib/expected-action-error";
import { OrganizationInvitationError } from "@vfurst/auth/invitations";
import { ZodError } from "zod";

export { ExpectedActionError } from "@/lib/expected-action-error";

/**
 * An expected, user-correctable condition inside a public-flow Server Action
 * (bad voucher, sold-out room, upload rejected, payments disabled, ...).
 * Public actions convert these into structured form state; organizer/dashboard
 * callers that have not been converted yet fall back to the route error
 * boundary. Tenant-isolation invariants must NOT use this class — they stay
 * plain throws by design (see the runtime audit's "Do not change" list).
 */
export class PublicActionError extends ExpectedActionError {
  constructor(message: string) {
    super(message);
    this.name = "PublicActionError";
  }
}

/** Returns the user-facing message when the error is an expected condition, else null. */
export function publicActionErrorMessage(error: unknown): string | null {
  if (error instanceof ExpectedActionError) return error.message;
  if (error instanceof RegistrationPolicyError) return error.message;
  if (error instanceof RateLimitExceededError) return error.message;
  return null;
}

/** Returns inline copy for all expected action conditions, including shared domain errors. */
export function expectedActionErrorMessage(error: unknown): string | null {
  const publicMessage = publicActionErrorMessage(error);
  if (publicMessage) return publicMessage;
  if (error instanceof OrganizationInvitationError) return error.message;
  if (error instanceof OrganizationLifecycleError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "The submitted values are invalid.";
  return null;
}
