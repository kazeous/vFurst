import { getStaffSession } from "@/lib/auth";
import { hasFreshStaffProof } from "@/lib/staff-session-policy";
import { StaffVerificationRequiredError } from "@/lib/staff-verification-error";
import { safeReturnTo } from "@/lib/return-to";
import { getCentralAppUrl } from "@/lib/central-url";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actionStateContext } from "@/lib/action-state-context";

export async function requireStaffAssurance(requireMfa = true) {
  const session = await getStaffSession();
  if (!session?.user?.id || !session.staffSecurity) redirect("/login");
  const security = session.staffSecurity;
  if (!security.leaseRequired && (!requireMfa || (security.emailVerified && hasFreshStaffProof({
    primaryAuthenticatedAt: new Date(security.primaryAuthenticatedAt),
    mfaVerifiedAt: security.mfaVerifiedAt ? new Date(security.mfaVerifiedAt) : null,
    mfaEnrolled: security.mfaEnrolled
  })))) return session;
  const requestHeaders = await headers();
  let returnTo = "/dashboard";
  try {
    const referrer = new URL(requestHeaders.get("referer") ?? "");
    if (referrer.origin === new URL(getCentralAppUrl()).origin) returnTo = safeReturnTo(referrer.pathname + referrer.search);
  } catch { /* No referrer is a normal direct request. */ }
  const verificationUrl = `${requireMfa ? "/staff/verify" : "/login"}?returnTo=${encodeURIComponent(returnTo)}`;
  if (actionStateContext.getStore()) throw new StaffVerificationRequiredError(verificationUrl);
  redirect(verificationUrl);
}
