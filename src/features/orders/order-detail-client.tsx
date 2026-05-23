"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OrderDetail = {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  event: {
    name: string;
    slug: string;
  };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    status: string;
    amountCents: number;
  }>;
  refunds: Array<{
    id: string;
    status: string;
    amountCents: number;
    reason: string | null;
  }>;
};

type OrderDetailClientProps = {
  orderId: string;
};

export function OrderDetailClient({ orderId }: OrderDetailClientProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const loadOrder = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/orders/${orderId}`);
    const body = (await response.json().catch(() => null)) as { order?: OrderDetail; error?: string } | null;

    if (!response.ok || !body?.order) {
      setError(body?.error ?? "Unable to load order.");
      return;
    }

    setOrder(body.order);
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function checkout() {
    setIsCheckingOut(true);
    setError(null);
    const response = await fetch(`/api/orders/${orderId}/checkout`, { method: "POST" });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    setIsCheckingOut(false);

    if (!response.ok || !body?.url) {
      setError(body?.error ?? "Unable to start checkout.");
      return;
    }

    window.location.assign(body.url);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {order ? (
        <Link className="text-sm font-medium text-primary" href={`/events/${order.event.slug}`}>
          Back to event
        </Link>
      ) : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-normal">Order</h1>
      {error ? <p className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {!order ? <p className="mt-5 text-sm text-muted-foreground">Loading order...</p> : null}
      {order ? (
        <section className="mt-6 space-y-6 rounded-md border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{order.event.name}</p>
              <p className="text-xl font-semibold">${(order.totalCents / 100).toFixed(2)}</p>
            </div>
            <span className="rounded-md bg-secondary px-3 py-1 text-sm font-medium">{order.status}</span>
          </div>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div className="flex flex-wrap justify-between gap-3 border-b pb-3 text-sm" key={item.id}>
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">
                    {item.quantity} x ${(item.unitPriceCents / 100).toFixed(2)}
                  </p>
                </div>
                <p>${(item.totalCents / 100).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div>
            <h2 className="font-semibold">Payments</h2>
            {order.payments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p> : null}
            {order.payments.map((payment) => (
              <p className="mt-2 text-sm text-muted-foreground" key={payment.id}>
                {payment.provider} - {payment.status} - ${(payment.amountCents / 100).toFixed(2)}
              </p>
            ))}
          </div>
          <div>
            <h2 className="font-semibold">Refunds</h2>
            {order.refunds.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No refunds recorded.</p> : null}
            {order.refunds.map((refund) => (
              <p className="mt-2 text-sm text-muted-foreground" key={refund.id}>
                {refund.status} - ${(refund.amountCents / 100).toFixed(2)}
                {refund.reason ? ` - ${refund.reason}` : ""}
              </p>
            ))}
          </div>
          {order.status === "UNPAID" ? (
            <button
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
              disabled={isCheckingOut}
              onClick={() => void checkout()}
              type="button"
            >
              {isCheckingOut ? "Starting checkout..." : "Pay with Stripe"}
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
