import { prisma } from "@vfurst/db";
import type { PortalUrlOrganization } from "./portal-url";

export type PortalHostOrganization = PortalUrlOrganization & { id: string };
export const PORTAL_HOST_CACHE_TTL_MS = 15_000;
export const PORTAL_HOST_CACHE_MAX_ENTRIES = 1_000;

const cache = new Map<string, { org: PortalHostOrganization; expiresAt: number }>();

export function clearPortalHostCache(): void {
  cache.clear();
}

export async function lookupPortalHostOrganization(key: string, now = Date.now()): Promise<PortalHostOrganization | null> {
  const normalized = key.trim().toLowerCase();
  if (!normalized || normalized.startsWith("_")) return null;

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > now) return cached.org;
  cache.delete(normalized);

  const org = await prisma.organization.findFirst({
    where: normalized.includes(".")
      ? { status: "ACTIVE", customDomain: normalized }
      : { status: "ACTIVE", OR: [{ subdomain: normalized }, { slug: normalized }] },
    select: { id: true, subdomain: true, customDomain: true, customDomainStatus: true }
  });
  if (!org) return null;

  cache.set(normalized, { org, expiresAt: now + PORTAL_HOST_CACHE_TTL_MS });
  if (cache.size > PORTAL_HOST_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return org;
}
