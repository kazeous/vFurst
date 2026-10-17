import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";

export default async function AccountRegistrationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/registrations");
  const registrations = await prisma.registration.findMany({
    where: { orgId: context.org.id, portalAccountId: context.account.id },
    include: {
      event: true,
      org: true,
      type: true,
      addOns: true,
      badges: true,
      orderItems: { include: { order: true }, orderBy: { createdAt: "desc" } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="vf-stack">
      <div><p className="vf-label">Tickets</p><h2>My registrations</h2><p className="vf-muted">Only registrations owned by this account appear here.</p></div>
      {registrations.map((registration) => (
        <article key={registration.id} className="vf-section">
          <div className="vf-page-header">
            <div><p className="vf-label">{registration.org.name}</p><h3>{registration.event.name}</h3><p className="vf-muted">{registration.type.name} · {registration.addOns.length} add-on(s)</p></div>
            <span className="vf-inline-status"><AccountStatus status={registration.status} />{registration.approvalStatus === "PENDING" ? <small>Awaiting approval</small> : null}</span>
          </div>
          <div className="vf-actions">
            <Button label="View registration" href={`/account/registrations/${registration.id}`} variant="primary" size="sm" />
            <Button label="Event portal" href="/register" size="sm" />
          </div>
        </article>
      ))}
      {registrations.length === 0 ? <p className="vf-empty">No registrations are linked to this account.</p> : null}
    </section>
  );
}
