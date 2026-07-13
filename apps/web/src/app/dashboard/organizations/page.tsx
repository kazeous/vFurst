import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getRootDomain } from "@/lib/platform-hosts";
import { OrganizationsTable } from "./organizations-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePlatformAdminPage } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requirePlatformAdminPage();

  const rootDomain = getRootDomain();
  const organizations = await prisma.organization.findMany({
    orderBy: {
      createdAt: "desc"
    },
    include: {
      _count: {
        select: {
          events: true,
          members: true
        }
      }
    }
  });
  const rows = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    subdomain: `${org.subdomain}.${rootDomain}`,
    events: org._count.events,
    members: org._count.members,
    href: `/dashboard/organizations/${org.id}`
  }));

  return (
    <div className="vf-page">
      <PageHeader eyebrow="Workspace management" title="Organizations" description="Manage organizer teams, event portfolios, domains, billing, and integrations." actions={<Button label="Create organization" href="/dashboard/organizations/new" variant="primary" />} />
      {organizations.length > 0 ? (
        <OrganizationsTable rows={rows} />
      ) : (
        <EmptyState
          title="No organizations yet"
          description="Create the first tenant to begin managing conventions."
          actions={<Button label="Create organization" href="/dashboard/organizations/new" variant="primary" />}
        />
      )}
    </div>
  );
}
