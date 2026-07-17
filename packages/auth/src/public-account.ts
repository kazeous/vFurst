import { normalizeIdentityEmail } from "./core.js";

export const PUBLIC_ACCOUNT_EMAIL_MISMATCH_MESSAGE = "Use the email address from your signed-in vFurst account.";

export type PublicAccountEmailIdentity = Readonly<{
  email: string;
}>;

export function normalizePublicAccountEmail(email: string) {
  return normalizeIdentityEmail(email);
}

export function publicAccountEmailMatches(identity: PublicAccountEmailIdentity, submittedEmail: string) {
  return normalizePublicAccountEmail(identity.email) === normalizePublicAccountEmail(submittedEmail);
}

export function assertPublicAccountEmail(identity: PublicAccountEmailIdentity, submittedEmail: string) {
  if (!publicAccountEmailMatches(identity, submittedEmail)) {
    throw new Error(PUBLIC_ACCOUNT_EMAIL_MISMATCH_MESSAGE);
  }
}

export function normalizePublicAccountName(name: string) {
  return name.trim();
}

export function shouldUpdatePublicAccountName(currentName: string | null | undefined, submittedName: string) {
  const normalizedName = normalizePublicAccountName(submittedName);
  return normalizedName.length > 0 && normalizedName !== currentName;
}
