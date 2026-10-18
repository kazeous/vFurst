"use server";

import { getStaffSession, signOut } from "@/lib/auth";
import { getCentralAppUrl } from "@/lib/central-url";
import { buildStaffEndSessionUrl, getStaffOidcMetadata } from "@/lib/staff-oidc";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import { createStaffLogoutFence, staffIdentityTransaction } from "@/lib/staff-oidc-store";
import { clearStaffOidcFlow } from "@/lib/staff-oidc-flow";
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
  let idTokenHint: string | null = null;

  if (session?.identitySessionId) {
    const stored = await prisma.session.findUnique({
      where: { id: session.identitySessionId },
      select: { idToken: true }
    });
    idTokenHint = stored?.idToken ?? null;
    await staffIdentityTransaction(async (tx) => {
      const now = new Date();
      await createStaffLogoutFence(tx, {
        issuer: process.env.AUTH_AUTHENTIK_ISSUER!, clientId: process.env.AUTH_AUTHENTIK_ID!,
        kind: "local", value: session.user.id, revokedThrough: now, now
      });
      if (everywhere) await tx.user.update({ where: { id: session.user.id }, data: { authVersion: { increment: 1 } } });
      await tx.session.updateMany({
        where: { userId: session.user.id, ...(everywhere ? {} : { id: session.identitySessionId }), revokedAt: null },
        data: { revokedAt: now, idToken: null }
      });
    });
  }

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
    const revoked = await prisma.session.updateMany({
      where: { id, userId: session.user.id, revokedAt: null }, data: { revokedAt: new Date(), idToken: null }
    });
    if (revoked.count !== 1) throw new ExpectedActionError("This session has already ended.");
    revalidatePath("/staff/sessions");
  }, "Session ended.");
}
