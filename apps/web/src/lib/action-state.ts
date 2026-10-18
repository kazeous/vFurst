import { expectedActionErrorMessage } from "@/lib/public-action-error";
import type { ActionFormState } from "@/lib/action-form-state";
import { unstable_rethrow } from "next/navigation";
import { StaffVerificationRequiredError } from "@/lib/staff-verification-error";
import { actionStateContext } from "@/lib/action-state-context";

/**
 * Runs a form mutation without masking redirects or framework control-flow.
 * Only known, user-correctable conditions become inline form state; system and
 * authorization failures continue to the route boundary and observability.
 */
export async function runActionWithState(
  operation: () => Promise<void>,
  success?: string
): Promise<ActionFormState> {
  try {
    await actionStateContext.run(true, operation);
    return success ? { success } : {};
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof StaffVerificationRequiredError) return { error: error.message, verificationUrl: error.verificationUrl };
    const message = expectedActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}
