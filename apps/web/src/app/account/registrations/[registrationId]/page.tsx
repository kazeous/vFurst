import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePublicAccount } from "@/lib/public-account";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function AccountRegistrationDetailPage({ params }: { params: Promise<{ registrationId: string }> }) {
  const [{ registrationId }, user] = await Promise.all([params, requirePublicAccount("/account/registrations")]);
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, userId: user.id },
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
        <AccountStatus status={registration.status} />
      </div>
      <dl className="vf-review-list">
        <div><dt>Registration ID</dt><dd>{registration.id}</dd></div>
        <div><dt>Check-in</dt><dd>{registration.checkedInAt ? registration.checkedInAt.toLocaleString() : "Not checked in"}</dd></div>
        <div><dt>Badge</dt><dd>{registration.badgeNumber ?? registration.badges[0]?.barcodeData ?? "Not generated"}</dd></div>
        <div><dt>Payment</dt><dd>{order ? `${order.status} · ${formatCurrency(order.total, order.currency)}` : "No linked order"}</dd></div>
        {registration.addOns.map((addOn) => <div key={addOn.id}><dt>Add-on</dt><dd>{addOn.addOnDefinition.name} × {addOn.quantity}</dd></div>)}
      </dl>
      <div className="vf-actions"><Button label="Back to registrations" href="/account/registrations" /><Button label="Open event portal" href={`/${registration.org.subdomain}/register`} variant="primary" /></div>
    </section>
  );
}
