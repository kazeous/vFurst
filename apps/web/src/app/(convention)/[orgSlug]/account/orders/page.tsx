import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";

export default async function AccountOrdersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/orders");
  const orders = await prisma.order.findMany({
    where: { orgId: context.org.id, portalAccountId: context.account.id },
    include: { event: true, org: true, items: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="vf-stack">
      <div><p className="vf-label">Commerce</p><h2>My orders</h2><p className="vf-muted">Receipts and payment state for this account.</p></div>
      {orders.map((order) => (
        <article key={order.id} className="vf-section">
          <div className="vf-page-header">
            <div><p className="vf-label">{order.org.name} · {order.createdAt.toLocaleString()}</p><h3>{order.event.name}</h3><p className="vf-muted">{order.items.length} item(s) · {formatCurrency(order.total, order.currency)}</p></div>
            <AccountStatus status={order.status} />
          </div>
          <Button label="View receipt" href={`/account/orders/${order.id}`} variant="primary" size="sm" />
        </article>
      ))}
      {orders.length === 0 ? <p className="vf-empty">No orders are linked to this account.</p> : null}
    </section>
  );
}
