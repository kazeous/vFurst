"use server";

import { auth, signOut } from "@/lib/auth";
import { getCentralAppUrl } from "@/lib/central-url";
import { revokeIdentitySession } from "@/lib/identity-session";
import { buildStaffEndSessionUrl, getStaffOidcMetadata } from "@/lib/staff-oidc";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";

/**
 * Staff logout (spec §6.5): the local session ends first, so the logout holds
 * even when the identity provider cannot be reached; then the browser goes
 * through the provider's end-session endpoint to end the studio session.
 */
export async function staffSignOut(): Promise<never> {
  const session = await auth();
  let idTokenHint: string | null = null;

  if (session?.identitySessionId) {
    const stored = await prisma.session.findUnique({
      where: { id: session.identitySessionId },
      select: { idToken: true }
    });
    idTokenHint = stored?.idToken ?? null;
    await revokeIdentitySession(session.identitySessionId);
  }

  await signOut({ redirect: false });

  let target = "/";
  try {
    const metadata = await getStaffOidcMetadata();
    if (metadata.end_session_endpoint) {
      target = buildStaffEndSessionUrl(metadata.end_session_endpoint, {
        idTokenHint,
        postLogoutRedirectUri: getCentralAppUrl("/")
      });
    }
  } catch (error) {
    console.warn({ event: "staff_logout_end_session_unavailable", message: error instanceof Error ? error.message : "unknown" });
  }

  redirect(target);
}
