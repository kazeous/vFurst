import { changeOrganizationStatus, resendInitialOwnerInvitation } from "@/actions/platform-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/i18n";
import { getAllowedOrganizationTransitions, organizationStatusLabels } from "@/lib/organization-lifecycle";
import { getConventionUrl } from "@/lib/subdomain";
import { prisma, type OrganizationStatus } from "@vfurst/db";
import { notFound } from "next/navigation";

function statusVariant(status: OrganizationStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "PROVISIONING" || status === "SUSPENDED") return "warning" as const;
  return "neutral" as const;
}

const transitionLabels: Partial<Record<OrganizationStatus, string>> = {
  ACTIVE: "Activate service",
  SUSPENDED: "Suspend new activity",
  RETIRED: "Retire organization"
};

export default async function PlatformOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      statusUpdatedBy: { select: { name: true, email: true } },
      invitations: { where: { role: "OWNER" }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          events: true,
          members: true,
          orders: true,
          registrations: true
        }
      },
      members: {
        where: { role: "OWNER" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!org) notFound();

  const transitions = getAllowedOrganizationTransitions(org.status);
  const latestInvitation = org.invitations[0];

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Tenant lifecycle"
        title={org.name}
        description={getConventionUrl(org)}
        actions={<Badge label={organizationStatusLabels[org.status]} variant={statusVariant(org.status)} />}
      />
      <section className="vf-stat-grid" aria-label="Organization inventory">
        <div className="vf-stat-card"><p className="vf-label">Owners</p><strong>{org.members.length}</strong><span>{org._count.members} total members</span></div>
        <div className="vf-stat-card"><p className="vf-label">Events</p><strong>{org._count.events}</strong><span>Retained through every lifecycle state</span></div>
        <div className="vf-stat-card"><p className="vf-label">Registrations</p><strong>{org._count.registrations}</strong><span>{org._count.orders} orders retained</span></div>
      </section>

      <section className="vf-two-column">
        <Card className="vf-section" padding={4}>
          <div className="vf-section-heading"><div><p className="vf-label">Service state</p><h2>{organizationStatusLabels[org.status]}</h2></div></div>
          <p className="vf-muted">
            {org.status === "ACTIVE" ? "Organizer and public activity is enabled." : org.status === "SUSPENDED" ? "New activity is blocked; callbacks, refunds, reconciliation, and settlement remain available." : org.status === "RETIRED" ? "This tenant is retained read-only. Retirement is terminal and does not delete data." : "Waiting for an owner to accept before service can be activated."}
          </p>
          {org.statusUpdatedAt ? <p className="vf-muted">Last changed {formatDate(org.statusUpdatedAt)} by {org.statusUpdatedBy?.name ?? org.statusUpdatedBy?.email ?? "system"}.</p> : null}
          <div className="vf-actions">
            {transitions.map((targetStatus) => (
              <form action={changeOrganizationStatus} key={targetStatus}>
                <input type="hidden" name="orgId" value={org.id} />
                <input type="hidden" name="targetStatus" value={targetStatus} />
                <Button
                  label={transitionLabels[targetStatus] ?? organizationStatusLabels[targetStatus]}
                  type="submit"
                  variant={targetStatus === "RETIRED" || targetStatus === "SUSPENDED" ? "destructive" : "primary"}
                  isDisabled={targetStatus === "ACTIVE" && org.members.length === 0}
                />
              </form>
            ))}
          </div>
          {transitions.includes("ACTIVE") && org.members.length === 0 ? <p className="vf-muted">Activation unlocks after the first owner accepts an invitation.</p> : null}
        </Card>

        <Card className="vf-section" padding={4}>
          <div className="vf-section-heading"><div><p className="vf-label">Ownership</p><h2>Initial owner</h2></div></div>
          {org.members.length > 0 ? (
            <div className="vf-list">{org.members.map((member) => <div className="vf-list-row" key={member.id}><span>{member.user.name ?? member.user.email}</span><small>{member.user.email}</small></div>)}</div>
          ) : (
            <>
              <p className="vf-muted">No owner has accepted yet. Sending again revokes the previous pending invitation.</p>
              {org.status === "PROVISIONING" ? (
                <form action={resendInitialOwnerInvitation} className="vf-form">
                  <input type="hidden" name="orgId" value={org.id} />
                  <label>Owner email<input name="email" type="email" defaultValue={latestInvitation?.email ?? org.contactEmail} required /></label>
                  <Button label="Send owner invitation" type="submit" />
                </form>
              ) : null}
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
