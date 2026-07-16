import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePublicAccount } from "@/lib/public-account";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

function itemLabel(item: { itemType: string; storeProduct: { name: string } | null; registration: { type: { name: string } } | null }) {
  return item.storeProduct?.name ?? item.registration?.type.name ?? item.itemType.replaceAll("_", " ");
}

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }, user] = await Promise.all([params, requirePublicAccount("/account/orders")]);
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: {
      event: true,
      org: true,
      voucher: true,
      items: { include: { storeProduct: true, registration: { include: { type: true } } }, orderBy: { createdAt: "asc" } }
    }
  });

  if (!order) notFound();

  return (
    <section className="vf-section">
      <div className="vf-page-header">
        <div><p className="vf-label">Order {order.id.slice(0, 8).toUpperCase()}</p><h2>{order.event.name}</h2><p className="vf-muted">{order.org.name} · {order.createdAt.toLocaleString()}</p></div>
        <AccountStatus status={order.status} />
      </div>
      <div className="vf-table">
        <div className="vf-table-head"><span>Item</span><span>Type</span><span>Quantity</span><span>Amount</span></div>
        {order.items.map((item) => <div key={item.id} className="vf-table-row"><strong>{itemLabel(item)}</strong><span>{item.itemType}</span><span>{item.quantity}</span><span>{formatCurrency(item.unitPrice * item.quantity, order.currency)}</span></div>)}
      </div>
      <dl className="vf-review-list">
        <div><dt>Subtotal/total</dt><dd>{formatCurrency(order.total, order.currency)}</dd></div>
        <div><dt>Payment provider</dt><dd>{order.paymentProvider ?? "Not selected"}</dd></div>
        <div><dt>Voucher</dt><dd>{order.voucher?.code ?? "None"}</dd></div>
      </dl>
      <Button label="Back to orders" href="/account/orders" />
    </section>
  );
}
