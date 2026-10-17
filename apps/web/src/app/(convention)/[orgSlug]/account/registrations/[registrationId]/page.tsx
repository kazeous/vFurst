import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function AccountRegistrationDetailPage({ params }: { params: Promise<{ orgSlug: string; registrationId: string }> }) {
  const { orgSlug, registrationId } = await params;
  const context = await requirePortalPageContext(orgSlug, `/account/registrations/${registrationId}`);
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, orgId: context.org.id, portalAccountId: context.account.id },
    include: {
      event: true,
      org: true,
      type: true,
      addOns: { include: { addOnDefinition: true } },
      badges: { orderBy: { createdAt: "desc" } },
      orderItems: { include: { order: true }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!registration) notFound();
  const order = registration.orderItems[0]?.order;

  return (
    <section className="vf-section">
      <div className="vf-page-header">
        <div><p className="vf-label">{registration.org.name}</p><h2>{registration.event.name}</h2><p className="vf-muted">{registration.type.name}</p></div>
        <span className="vf-inline-status"><AccountStatus status={registration.status} />{registration.approvalStatus === "PENDING" ? <small>Awaiting organizer approval</small> : null}</span>
      </div>
      <dl className="vf-review-list">
        <div><dt>Registration ID</dt><dd>{registration.id}</dd></div>
        <div><dt>Check-in</dt><dd>{registration.checkedInAt ? registration.checkedInAt.toLocaleString() : "Not checked in"}</dd></div>
        <div><dt>Badge</dt><dd>{registration.badgeNumber ?? registration.badges[0]?.barcodeData ?? "Not generated"}</dd></div>
        <div><dt>Payment</dt><dd>{order ? `${order.status} · ${formatCurrency(order.total, order.currency)}` : "No linked order"}</dd></div>
        <div><dt>Approval</dt><dd>{registration.approvalStatus}</dd></div>
        {registration.addOns.map((addOn) => <div key={addOn.id}><dt>Add-on</dt><dd>{addOn.addOnDefinition.name} × {addOn.quantity}</dd></div>)}
      </dl>
      <div className="vf-actions"><Button label="Back to registrations" href="/account/registrations" /><Button label="Open event portal" href="/register" variant="primary" /></div>
    </section>
  );
}
