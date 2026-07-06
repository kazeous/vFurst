import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { OrganizationsTable } from "./organizations-table";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
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
    subdomain: `${org.subdomain}.vfurst.app`,
    events: org._count.events,
    members: org._count.members,
    href: `/dashboard/organizations/${org.id}`
  }));

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Tenant management</p>
          <h1>Organizations</h1>
        </div>
        <Button label="Create organization" href="/dashboard/organizations/new" variant="primary" />
      </header>
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
