import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import Link from "next/link";

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
        <div className="vf-table" role="table" aria-label="Organizations">
          <div role="row" className="vf-table-head">
            <span>Name</span>
            <span>Subdomain</span>
            <span>Events</span>
            <span>Members</span>
          </div>
          {organizations.map((org) => (
            <Link role="row" className="vf-table-row" key={org.id} href={`/dashboard/organizations/${org.id}`}>
              <span>{org.name}</span>
              <span>{org.subdomain}.vfurst.app</span>
              <span>{org._count.events}</span>
              <span>{org._count.members}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="vf-empty">
          <h2>No organizations yet</h2>
          <p>Create the first tenant to begin managing conventions.</p>
        </div>
      )}
    </div>
  );
}
