import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";

export default async function AccountApplicationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/applications");
  const [volunteerApplications, vendorApplications] = await Promise.all([
    prisma.volunteerApplication.findMany({
      where: { orgId: context.org.id, portalAccountId: context.account.id },
      include: { event: true, org: true, department: true, staffAssignments: { include: { role: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.vendorApplication.findMany({
      where: { orgId: context.org.id, portalAccountId: context.account.id },
      include: { event: true, org: true },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <section className="vf-stack">
      <div><p className="vf-label">Participation</p><h2>My applications</h2><p className="vf-muted">Volunteer and vendor decisions for this account.</p></div>
      <section className="vf-two-column">
        <div className="vf-stack">
          <h3>Volunteer</h3>
          {volunteerApplications.map((application) => (
            <article key={application.id} className="vf-section">
              <div className="vf-page-header"><div><p className="vf-label">{application.org.name}</p><h4>{application.event.name}</h4><p className="vf-muted">{application.department.name}</p></div><AccountStatus status={application.status} /></div>
              {application.staffAssignments.map((assignment) => <p key={assignment.id}>{assignment.role.roleName} · <AccountStatus status={assignment.status} /></p>)}
              <Button label="Volunteer portal" href="/volunteer" size="sm" />
            </article>
          ))}
          {volunteerApplications.length === 0 ? <p className="vf-empty">No volunteer applications.</p> : null}
        </div>
        <div className="vf-stack">
          <h3>Vendor</h3>
          {vendorApplications.map((application) => (
            <article key={application.id} className="vf-section">
              <div className="vf-page-header"><div><p className="vf-label">{application.org.name}</p><h4>{application.businessName}</h4><p className="vf-muted">{application.event.name} · Booth {application.boothAssignment ?? "not assigned"} · {formatCurrency(application.boothPrice, application.event.currency)}</p></div><AccountStatus status={application.status} /></div>
              <p>{application.boothPaidAt ? "Booth payment complete" : "Booth payment not complete"}</p>
              <Button label="Vendor portal" href="/vendor-apply" size="sm" />
            </article>
          ))}
          {vendorApplications.length === 0 ? <p className="vf-empty">No vendor applications.</p> : null}
        </div>
      </section>
    </section>
  );
}
