"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type PublicEvent = {
  id: string;
  name: string;
  slug: string;
};

type CartItem = {
  id: string;
  quantity: number;
  product: {
    displayName: string;
    basePriceCents: number;
  };
};

type Cart = {
  id: string;
  items: CartItem[];
};

type CartClientProps = {
  slug: string;
};

export function CartClient({ slug }: CartClientProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const totalCents = useMemo(
    () => cart?.items.reduce((total, item) => total + item.quantity * item.product.basePriceCents, 0) ?? 0,
    [cart]
  );

  const loadCart = useCallback(async () => {
    setError(null);
    const eventResponse = await fetch(`/api/public/events/${slug}`);
    const eventBody = (await eventResponse.json().catch(() => null)) as { event?: PublicEvent; error?: string } | null;

    if (!eventResponse.ok || !eventBody?.event) {
      setError(eventBody?.error ?? "Event not found.");
      return;
    }

    setEvent(eventBody.event);

    const cartResponse = await fetch(`/api/events/${eventBody.event.id}/cart`);

    if (cartResponse.status === 401) {
      setError("Sign in to view your cart.");
      return;
    }

    const cartBody = (await cartResponse.json().catch(() => null)) as { cart?: Cart; error?: string } | null;
    if (!cartResponse.ok || !cartBody?.cart) {
      setError(cartBody?.error ?? "Unable to load cart.");
      return;
    }

    setCart(cartBody.cart);
  }, [slug]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function updateQuantity(itemId: string, quantity: number) {
    if (!event) {
      return;
    }

    await fetch(`/api/events/${event.id}/cart/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity })
    });
    await loadCart();
  }

  async function removeItem(itemId: string) {
    if (!event) {
      return;
    }

    await fetch(`/api/events/${event.id}/cart/items/${itemId}`, { method: "DELETE" });
    await loadCart();
  }

  async function createOrder() {
    if (!event) {
      return;
    }

    setIsCreatingOrder(true);
    setError(null);
    const response = await fetch(`/api/events/${event.id}/orders`, { method: "POST" });
    const body = (await response.json().catch(() => null)) as { order?: { id: string }; error?: string } | null;
    setIsCreatingOrder(false);

    if (!response.ok || !body?.order) {
      setError(body?.error ?? "Unable to create order.");
      return;
    }

    window.location.assign(`/orders/${body.order.id}`);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link className="text-sm font-medium text-primary" href={`/events/${slug}`}>
        Back to event
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-normal">{event?.name ?? "Cart"}</h1>
      {error ? <p className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <section className="mt-6 rounded-md border bg-card p-5">
        {!cart ? <p className="text-sm text-muted-foreground">Loading cart...</p> : null}
        {cart && cart.items.length === 0 ? <p className="text-sm text-muted-foreground">Your cart is empty.</p> : null}
        <div className="space-y-4">
          {cart?.items.map((item) => (
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4" key={item.id}>
              <div>
                <p className="font-medium">{item.product.displayName}</p>
                <p className="text-sm text-muted-foreground">${(item.product.basePriceCents / 100).toFixed(2)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="w-20 rounded-md border px-2 py-1"
                  min={1}
                  onChange={(changeEvent) => void updateQuantity(item.id, Number(changeEvent.currentTarget.value))}
                  type="number"
                  value={item.quantity}
                />
                <button className="rounded-md border px-2 py-1 text-sm" onClick={() => void removeItem(item.id)} type="button">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-lg font-semibold">Total ${(totalCents / 100).toFixed(2)}</p>
          <button
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
            disabled={!cart || cart.items.length === 0 || isCreatingOrder}
            onClick={() => void createOrder()}
            type="button"
          >
            {isCreatingOrder ? "Creating order..." : "Create order"}
          </button>
        </div>
      </section>
    </main>
  );
}
