import { PageHeader } from "@/components/dashboard/page-header";
import { PlatformOrganizationsTable } from "@/components/platform/organizations-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getRootDomain } from "@/lib/platform-hosts";
import { prisma } from "@vfurst/db";

export const dynamic = "force-dynamic";

export default async function PlatformOrganizationsPage() {
  const rootDomain = getRootDomain();
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { events: true, members: true } } }
  });
  const rows = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    subdomain: `${org.subdomain}.${rootDomain}`,
    status: org.status,
    events: org._count.events,
    members: org._count.members,
    href: `/platform/organizations/${org.id}`
  }));

  return (
    <div className="vf-page">
      <PageHeader eyebrow="Tenant inventory" title="Organizations" description="Provision tenants and manage service lifecycle without entering their organizer workspaces." actions={<Button label="Provision organization" href="/platform/organizations/new" variant="primary" />} />
      {organizations.length > 0 ? <PlatformOrganizationsTable rows={rows} /> : (
        <EmptyState title="No organizations yet" description="Provision the first tenant to begin onboarding its owner." actions={<Button label="Provision organization" href="/platform/organizations/new" variant="primary" />} />
      )}
    </div>
  );
}
