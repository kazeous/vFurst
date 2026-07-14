import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@vfurst/db";
import { Building2, CirclePause, CirclePlay, Clock3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const [organizations, pendingOwnerInvitations] = await Promise.all([
    prisma.organization.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.orgInvitation.count({
      where: { role: "OWNER", acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }
    })
  ]);
  const counts = Object.fromEntries(organizations.map((row) => [row.status, row._count._all]));
  const total = organizations.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Control plane"
        title="Platform overview"
        description="Provision tenants and control their service lifecycle. Organizer operations stay in a separate membership-scoped dashboard."
        actions={<Button label="Provision organization" href="/platform/organizations/new" variant="primary" />}
      />
      <section className="vf-stat-grid" aria-label="Tenant lifecycle summary">
        <StatCard label="Organizations" value={total.toString()} detail="All provisioned tenants" icon={Building2} />
        <StatCard label="Active" value={(counts.ACTIVE ?? 0).toString()} detail="Open for organizer and public activity" icon={CirclePlay} tone="success" />
        <StatCard label="Provisioning" value={(counts.PROVISIONING ?? 0).toString()} detail={`${pendingOwnerInvitations} pending owner invitations`} icon={Clock3} tone="warning" />
        <StatCard label="Suspended" value={(counts.SUSPENDED ?? 0).toString()} detail={`${counts.RETIRED ?? 0} retired`} icon={CirclePause} tone="warning" />
      </section>
      <Card className="vf-section" padding={4}>
        <div className="vf-section-heading"><div><p className="vf-label">Boundary</p><h2>Two separate workspaces</h2></div></div>
        <p className="vf-muted">This control plane owns tenant provisioning and lifecycle. Organization owners use the organizer dashboard only for organizations where they hold a membership.</p>
        <div className="vf-actions"><Button label="View all organizations" href="/platform/organizations" /><Button label="Open organizer dashboard" href="/dashboard" /></div>
      </Card>
    </div>
  );
}
