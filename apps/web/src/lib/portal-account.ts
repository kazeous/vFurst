import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  assertPublicAccountEmail,
  normalizePublicAccountName,
  shouldUpdatePublicAccountName
} from "@vfurst/auth/public-account";
import { prisma } from "@vfurst/db";
import { isSecureRequest } from "@/lib/portal-request";
import {
  createPortalSession,
  portalSessionCookieName,
  portalSessionCookieOptions,
  resolvePortalSession,
  revokePortalSession,
  type PortalAccountSummary
} from "@/lib/portal-session";
import { safeReturnTo } from "@/lib/return-to";

export const getPortalAccount = cache(async (org: { id: string }): Promise<PortalAccountSummary | null> => {
  const cookieName = portalSessionCookieName(isSecureRequest(await headers()));
  const token = (await cookies()).get(cookieName)?.value;
  return token ? resolvePortalSession({ token, orgId: org.id }) : null;
});

export async function requirePortalAccount(org: { id: string }, returnTo: string): Promise<PortalAccountSummary> {
  const account = await getPortalAccount(org);
  if (!account) {
    redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}`);
  }
  return account;
}

export function assertPortalAccountEmail(account: Pick<PortalAccountSummary, "email">, submittedEmail: string): void {
  assertPublicAccountEmail(account, submittedEmail);
}

export async function syncPortalAccountName(
  account: PortalAccountSummary,
  submittedName: string
): Promise<PortalAccountSummary> {
  const name = normalizePublicAccountName(submittedName);
  if (!shouldUpdatePublicAccountName(account.name, name)) return account;

  return prisma.portalAccount.update({
    where: { id: account.id },
    data: { name },
    select: { id: true, orgId: true, email: true, name: true }
  });
}

export async function startPortalSession(account: { id: string; orgId: string; authVersion: number }): Promise<void> {
  const secure = isSecureRequest(await headers());
  const cookieName = portalSessionCookieName(secure);
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(cookieName)?.value;
  if (currentToken) await revokePortalSession(currentToken);

  const session = await createPortalSession({
    orgId: account.orgId,
    portalAccountId: account.id,
    authVersion: account.authVersion
  });
  cookieStore.set(cookieName, session.token, portalSessionCookieOptions(secure, session.expiresAt));
}

export async function endPortalSession(): Promise<void> {
  const secure = isSecureRequest(await headers());
  const cookieName = portalSessionCookieName(secure);
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token) await revokePortalSession(token);
  // Browsers require Secure even when expiring a __Host- cookie.
  cookieStore.set(cookieName, "", portalSessionCookieOptions(secure, new Date(0)));
}
