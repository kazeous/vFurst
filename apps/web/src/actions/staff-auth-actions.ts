"use server";

import { getStaffSession, signOut } from "@/lib/auth";
import { getCentralAppUrl } from "@/lib/central-url";
import { buildStaffEndSessionUrl, getStaffOidcMetadata } from "@/lib/staff-oidc";
import { redirect } from "next/navigation";
import { createStaffLogoutFence, endStaffBrowserSessions, staffIdentityTransaction } from "@/lib/staff-oidc-store";
import { clearStaffOidcFlow, currentStaffOidcFlowHash } from "@/lib/staff-oidc-flow";
import { runActionWithState } from "@/lib/action-state";
import type { ActionFormState } from "@/lib/action-form-state";
import { ExpectedActionError } from "@/lib/expected-action-error";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Staff logout (spec §6.5): the local session ends first, so the logout holds
 * even when the identity provider cannot be reached; then the browser goes
 * through the provider's end-session endpoint to end the studio session.
 */
export async function staffSignOut(): Promise<never> {
  return endStaffSession(false);
}

export async function staffSignOutEverywhere(): Promise<never> {
  return endStaffSession(true);
}

async function endStaffSession(everywhere: boolean): Promise<never> {
  const session = await getStaffSession();
  const idTokenHint = await endStaffBrowserSessions({
    actor: session?.identitySessionId ? { userId: session.user.id, sessionId: session.identitySessionId } : null,
    flowHash: await currentStaffOidcFlowHash(), everywhere,
    issuer: process.env.AUTH_AUTHENTIK_ISSUER!, clientId: process.env.AUTH_AUTHENTIK_ID!
  });

  await clearStaffOidcFlow();
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
  } catch {
    console.warn({ event: "staff_logout_end_session_unavailable" });
  }

  redirect(target);
}

export async function revokeOtherStaffSession(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(async () => {
    const session = await getStaffSession();
    if (!session?.user?.id || session.staffSecurity.leaseRequired) throw new ExpectedActionError("Sign in again before managing sessions.");
    const id = z.string().uuid().parse(formData.get("sessionId"));
    if (id === session.identitySessionId) throw new ExpectedActionError("Use Log out to end this session.");
    const revoked = await staffIdentityTransaction(async (tx) => {
      const target = await tx.session.findUnique({ where: { id }, select: { userId: true, oidcIssuer: true, oidcClientId: true } });
      if (!target || target.userId !== session.user.id || !target.oidcIssuer || !target.oidcClientId) return { count: 0 };
      const now = new Date();
      await createStaffLogoutFence(tx, { issuer: target.oidcIssuer, clientId: target.oidcClientId,
        kind: "session", value: id, revokedThrough: now, now });
      return tx.session.updateMany({ where: { id, userId: session.user.id, revokedAt: null }, data: { revokedAt: now, idToken: null } });
    });
    if (revoked.count !== 1) throw new ExpectedActionError("This session has already ended.");
    revalidatePath("/staff/sessions");
  }, "Session ended.");
}
