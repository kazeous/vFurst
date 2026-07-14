import { ConventionPortalShell } from "@/components/convention/portal-shell";
import { getConventionOrg } from "@/lib/convention";
import { prisma } from "@vfurst/db";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const revalidate = 15;

const getConventionShellData = unstable_cache(
  async (orgSlug: string) => {
    const org = await getConventionOrg(orgSlug);

    if (!org) {
      return null;
    }

    const event = await prisma.event.findFirst({
      where: { orgId: org.id, status: "PUBLISHED" },
      orderBy: { startDate: "asc" },
      select: { name: true, venue: true, startDate: true, endDate: true, settings: true }
    });

    return {
      event,
      org: {
        customDomain: org.customDomain,
        logo: org.logo,
        name: org.name,
        subdomain: org.subdomain
      }
    };
  },
  ["public-convention-shell-v1"],
  { revalidate: 15 }
);

export default async function ConventionLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await getConventionShellData(orgSlug);
  if (!data) notFound();

  return <ConventionPortalShell org={data.org} event={data.event}>{children}</ConventionPortalShell>;
}
