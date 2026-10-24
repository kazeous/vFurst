import { createHash } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import type { RegistrationForm } from "@/lib/registration-form";

export const PUBLIC_REGISTRATION_CACHE_TAG = "public-registration";
export const REGISTRATION_FORM_CHANGED_MESSAGE = "The registration form was updated; please review it again.";

/** Refreshes the cached public registration page after an event's form or policies change. */
export function revalidatePublicRegistration() {
  revalidateTag(PUBLIC_REGISTRATION_CACHE_TAG);
  revalidatePath("/[orgSlug]/register", "page");
}

/** Identifies the registration form a visitor was shown, so a submission made against an older form is reported as stale. */
export function registrationFormFingerprint(form: RegistrationForm): string {
  return createHash("sha256").update(JSON.stringify(form)).digest("hex").slice(0, 16);
}
