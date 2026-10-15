import { partialRefund, refundOrder } from "@/actions/store-actions";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

const statuses = ["ALL", "PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "FAILED"] as const;

function badgeVariant(status: string) {
  if (status === "PAID") {
    return "success";
  }

  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") {
    return "warning";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "error";
  }

  return "neutral";
}

function itemName(item: { itemType: string; storeProduct?: { name: string } | null; registration?: { portalAccount: { email: string; name: string | null } } | null }) {
  if (item.storeProduct) {
    return item.storeProduct.name;
  }

  if (item.registration) {
    return item.registration.portalAccount.name ?? item.registration.portalAccount.email;
  }

  return item.itemType;
}

export default async function StoreOrdersPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const status = statuses.includes((query.status ?? "ALL") as (typeof statuses)[number]) ? query.status ?? "ALL" : "ALL";
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      orders: {
        where: status === "ALL" ? undefined : { status: status as Exclude<(typeof statuses)[number], "ALL"> },
        include: {
          portalAccount: true,
          voucher: true,
          items: {
            include: {
              storeProduct: true,
              registration: {
                include: {
                  portalAccount: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Store</p>
          <h1>Orders</h1>
        </div>
        <Button label="Products" href={`/dashboard/events/${event.id}/store`} />
      </header>

      <section className="vf-section">
        <div className="vf-actions">
          {statuses.map((option) => (
            <Button
              key={option}
              label={option.replaceAll("_", " ")}
              href={`/dashboard/events/${event.id}/store/orders${option === "ALL" ? "" : `?status=${option}`}`}
              size="sm"
              variant={option === status ? "primary" : "ghost"}
            />
          ))}
        </div>
      </section>

      <section className="vf-stack">
        {event.orders.map((order) => (
          <div key={order.id} className="vf-section">
            <div className="vf-page-header">
              <div>
                <p className="vf-label">{order.createdAt.toLocaleString()}</p>
                <h2>{order.portalAccount.name ?? order.portalAccount.email}</h2>
                <p className="vf-muted">
                  Total {formatCurrency(order.total, order.currency)} - platform fee {formatCurrency(order.platformFee, order.currency)}
                  {order.voucher ? ` - voucher ${order.voucher.code}` : ""}
                </p>
              </div>
              <Badge label={order.status.replaceAll("_", " ")} variant={badgeVariant(order.status)} />
            </div>

            <div className="vf-table">
              <div className="vf-table-head">
                <span>Item</span>
                <span>Type</span>
                <span>Quantity</span>
                <span>Amount</span>
              </div>
              {order.items.map((item) => (
                <div key={item.id} className="vf-table-row">
                  <strong>{itemName(item)}</strong>
                  <span>{item.itemType}</span>
                  <span>{item.quantity}</span>
                  <span>{formatCurrency(item.unitPrice * item.quantity, order.currency)}</span>
                </div>
              ))}
            </div>

            {order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" ? (
              <div className="vf-inline-forms">
                <form action={refundOrder}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <Button label="Full refund" type="submit" variant="destructive" size="sm" />
                </form>
                <form action={partialRefund} className="vf-inline-form">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input
                    name="amount"
                    type="number"
                    min={order.currency === "VND" ? "1" : "0.01"}
                    step={order.currency === "VND" ? "1" : "0.01"}
                    placeholder={order.currency === "VND" ? "250000" : "25.00"}
                    required
                    aria-label="Partial refund amount"
                  />
                  <Button label="Partial refund" type="submit" size="sm" />
                </form>
              </div>
            ) : null}
          </div>
        ))}
        {event.orders.length === 0 ? <p className="vf-empty">No orders match this filter.</p> : null}
      </section>
    </div>
  );
}
