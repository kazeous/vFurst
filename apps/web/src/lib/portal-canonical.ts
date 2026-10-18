import { getCanonicalTenantHostname } from "@vfurst/tenant-context";
import { getPortalUrl, type PortalUrlOrganization } from "./portal-url";
import { getTenantHostPolicy } from "./tenant-host-policy";

export const CENTRAL_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "api", "dashboard", "docs", "platform", "login", "register", "forgot-password", "reset-password",
  "invitations", "dmca", "features", "pricing", "privacy", "request-access", "terms", "account",
  "checkout", "transfer", "monitoring", "staff"
]);

export function centralPortalCandidate(pathname: string): { key: string; portalPath: string } | null {
  const separator = pathname.indexOf("/", 1);
  const key = (separator === -1 ? pathname.slice(1) : pathname.slice(1, separator)).toLowerCase();
  if (!key || key.startsWith("_") || CENTRAL_ROUTE_SEGMENTS.has(key)) return null;
  return { key, portalPath: separator === -1 ? "/" : pathname.slice(separator) };
}

export function portalHostKey(hostname: string, rootDomain: string): string {
  const suffix = `.${rootDomain}`;
  return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : hostname;
}

export function canonicalPortalRedirect(input: {
  requestHostname: string | null;
  portalPath: string;
  search: string;
  org: PortalUrlOrganization;
}): string | null {
  const hostname = getCanonicalTenantHostname({
    subdomain: input.org.subdomain,
    customDomain: input.org.customDomainStatus === "ACTIVE" ? input.org.customDomain : null
  }, getTenantHostPolicy());
  if (input.requestHostname === hostname) return null;
  return getPortalUrl(input.org, input.portalPath + input.search);
}
