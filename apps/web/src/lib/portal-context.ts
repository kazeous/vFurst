import type { Organization } from "@vfurst/db";
import { notFound } from "next/navigation";
import { getConventionOrg } from "@/lib/convention";
import { getPortalAccount, requirePortalAccount } from "@/lib/portal-account";
import { portalLoginPath } from "@/lib/portal-paths";
import { getRequestPortalOrg } from "@/lib/portal-request";
import type { PortalAccountSummary } from "@/lib/portal-session";

export type PortalContext = { org: Organization; account: PortalAccountSummary };

/** The host-checked portal organization, without reading the portal session. */
export async function requirePortalPageOrg(orgSlug: string): Promise<Organization> {
  const org = await getConventionOrg(orgSlug);
  if (!org) notFound();

  const requestOrg = await getRequestPortalOrg();
  if (!requestOrg || requestOrg.id !== org.id) notFound();

  return org;
}

export async function getPortalPageContext(
  orgSlug: string
): Promise<{ org: Organization; account: PortalAccountSummary | null }> {
  const org = await requirePortalPageOrg(orgSlug);
  return { org, account: await getPortalAccount(org) };
}

export async function requirePortalPageContext(orgSlug: string, returnTo: string): Promise<PortalContext> {
  const org = await requirePortalPageOrg(orgSlug);
  return { org, account: await requirePortalAccount(org, returnTo) };
}

export async function getPortalActionContext(returnTo: string): Promise<PortalContext | { redirectTo: string }> {
  const org = await getRequestPortalOrg();
  if (!org) notFound();

  const account = await getPortalAccount(org);
  return account ? { org, account } : { redirectTo: portalLoginPath(returnTo) };
}

export function isPortalRedirect(value: PortalContext | { redirectTo: string }): value is { redirectTo: string } {
  return "redirectTo" in value;
}

export function assertPortalResourceOrg(resourceOrgId: string, org: { id: string }): void {
  if (resourceOrgId !== org.id) notFound();
}
