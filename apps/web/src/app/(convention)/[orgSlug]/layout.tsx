import { ConventionPortalShell } from "@/components/convention/portal-shell";
import { getConventionOrg } from "@/lib/convention";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default async function ConventionLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getConventionOrg(orgSlug);
  if (!org) notFound();

  const event = await prisma.event.findFirst({
    where: { orgId: org.id, status: "PUBLISHED" },
    orderBy: { startDate: "asc" },
    select: { name: true, venue: true, startDate: true, endDate: true, settings: true }
  });

  return <ConventionPortalShell org={org} event={event}>{children}</ConventionPortalShell>;
}
