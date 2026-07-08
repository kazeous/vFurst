import { addToCart } from "@/actions/cart-actions";
import { StoreCart } from "@/components/store/cart";
import { auth } from "@/lib/auth";
import { getConventionOrg } from "@/lib/convention";
import { markOrderPaid } from "@/lib/fulfillment";
import { getStripe } from "@/lib/payments/stripe";
import { formatCurrency } from "@/lib/registration/pricing";
import { getSurchargeTotal, parseProductOptions } from "@/lib/store/pricing";
import { prisma, type Prisma } from "@vfurst/db";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const receiptOrderInclude = {
  voucher: true,
  items: {
    include: {
      storeProduct: true
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.OrderInclude;

function imageUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function badgeVariant(status: string) {
  if (status === "PAID") {
    return "success";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "error";
  }

  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") {
    return "warning";
  }

  return "neutral";
}

function itemName(item: { itemType: string; storeProduct?: { name: string } | null }) {
  return item.storeProduct?.name ?? item.itemType.replaceAll("_", " ");
}

async function findReceiptOrder(orderId: string, userId: string, orgId: string, eventId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
      orgId,
      eventId
    },
    include: receiptOrderInclude
  });
}

type StoreReceiptOrder = NonNullable<Awaited<ReturnType<typeof findReceiptOrder>>>;

function receiptTotals(order: StoreReceiptOrder) {
  const subtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const surcharges = order.items.reduce((sum, item) => sum + getSurchargeTotal(item.storeProduct?.surcharges) * item.quantity, 0);
  const discount = Math.max(0, subtotal + surcharges - order.total);

  return {
    subtotal,
    surcharges,
    discount
  };
}

async function verifyStripeReturn(orderId: string, sessionId?: string) {
  if (!sessionId) {
    return null;
  }

  try {
    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);
    const checkoutOrderId = checkoutSession.client_reference_id ?? checkoutSession.metadata?.orderId;

    if (checkoutOrderId !== orderId || checkoutSession.payment_status !== "paid") {
      return null;
    }

    return typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : checkoutSession.payment_intent?.id ?? null;
  } catch (error) {
    console.error("Store checkout return verification failed.", error);
    return null;
  }
}

async function resolveSuccessOrder({
  orderId,
  sessionId,
  userId,
  orgId,
  eventId
}: {
  orderId: string | undefined;
  sessionId: string | undefined;
  userId: string | undefined;
  orgId: string;
  eventId: string;
}) {
  if (!orderId || !userId) {
    return null;
  }

  const order = await findReceiptOrder(orderId, userId, orgId, eventId);

  if (!order) {
    return null;
  }

  if (order.status === "PENDING") {
    const paymentIntentId = await verifyStripeReturn(order.id, sessionId);

    if (paymentIntentId) {
      await markOrderPaid(order.id, paymentIntentId);
      return findReceiptOrder(order.id, userId, orgId, eventId);
    }
  }

  return order;
}

function StoreOrderReceipt({ order, storePath }: { order: StoreReceiptOrder; storePath: string }) {
  const totals = receiptTotals(order);
  const isPaid = order.status === "PAID";

  return (
    <section className="vf-section">
      <div className="vf-page-header">
        <div>
          <p className="vf-label">Order {order.id.slice(0, 8).toUpperCase()}</p>
          <h2>{isPaid ? "Order received" : "Payment is being confirmed"}</h2>
          <p className="vf-muted">
            {isPaid
              ? "Your store order is confirmed. The organizer has the order details."
              : "Stripe has returned you to vFurst, and this order will finish as soon as payment confirmation arrives."}
          </p>
        </div>
        <Badge label={order.status.replaceAll("_", " ")} variant={badgeVariant(order.status)} />
      </div>

      <div className="vf-table vf-receipt-table">
        <div className="vf-table-head">
          <span>Item</span>
          <span>Quantity</span>
          <span>Amount</span>
        </div>
        {order.items.map((item) => (
          <div key={item.id} className="vf-table-row">
            <strong>{itemName(item)}</strong>
            <span>{item.quantity}</span>
            <span>{formatCurrency(item.unitPrice * item.quantity + getSurchargeTotal(item.storeProduct?.surcharges) * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="vf-cart-summary">
        <span>Subtotal</span>
        <strong>{formatCurrency(totals.subtotal)}</strong>
        <span>Surcharges</span>
        <strong>{formatCurrency(totals.surcharges)}</strong>
        <span>Discount</span>
        <strong>-{formatCurrency(totals.discount)}</strong>
        <span>Platform fee</span>
        <strong>{formatCurrency(order.platformFee)}</strong>
        <span>Total</span>
        <strong>{formatCurrency(order.total)}</strong>
      </div>

      <div className="vf-actions">
        <Button label="Continue shopping" href={storePath} />
      </div>
    </section>
  );
}

export default async function PublicStorePage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string; session_id?: string }>;
}) {
  const [{ orgSlug }, query, session] = await Promise.all([params, searchParams, auth()]);
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }

  const event = await prisma.event.findFirst({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    },
    include: {
      storeProducts: {
        where: {
          stock: {
            gt: 0
          }
        },
        orderBy: [{ category: "asc" }, { name: "asc" }]
      }
    }
  });
  const storePath = `/${org.subdomain}/store`;
  const successOrder =
    event && query.success
      ? await resolveSuccessOrder({
          orderId: query.success,
          sessionId: query.session_id,
          userId: session?.user?.id,
          orgId: org.id,
          eventId: event.id
        })
      : null;
  const showStore = !query.success;

  const cart =
    showStore && event && session?.user?.id
      ? await prisma.cart.findUnique({
          where: {
            userId_eventId: {
              userId: session.user.id,
              eventId: event.id
            }
          },
          include: {
            items: {
              include: {
                product: true
              },
              orderBy: {
                createdAt: "asc"
              }
            },
            voucher: true
          }
        })
      : null;

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Store</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href={`/${org.subdomain}/register`} />
          <Button label="Hotel" href={`/${org.subdomain}/hotel`} />
          <Button label="Volunteer" href={`/${org.subdomain}/volunteer`} />
          <Button label="Vendor apply" href={`/${org.subdomain}/vendor-apply`} />
        </div>
      </header>

      {query.success && successOrder ? <StoreOrderReceipt order={successOrder} storePath={storePath} /> : null}

      {query.success && !successOrder ? (
        <section className="vf-section">
          <h2>Order lookup unavailable</h2>
          <p className="vf-muted">
            Sign in with the account used at checkout, or wait a moment for Stripe confirmation before refreshing this receipt.
          </p>
          <div className="vf-actions">
            <Button label="Back to store" href={storePath} />
          </div>
        </section>
      ) : null}

      {showStore && query.cancelled ? (
        <section className="vf-section">
          <h2>Checkout cancelled</h2>
          <p className="vf-muted">No payment was captured. Your cart is still available.</p>
        </section>
      ) : null}

      {!event ? (
        <section className="vf-section">
          <h2>No published event</h2>
          <p className="vf-muted">The store opens after the organizer publishes an event.</p>
        </section>
      ) : showStore ? (
        <div className="vf-store-layout">
          <section className="vf-store-grid">
            {event.storeProducts.map((product) => {
              const images = imageUrls(product.images);
              const options = parseProductOptions(product.options);
              const price = product.price + getSurchargeTotal(product.surcharges);

              return (
                <Card key={product.id} className="vf-product-card" padding={4}>
                  {images.length > 0 ? (
                    <div className="vf-product-gallery">
                      {images.slice(0, 3).map((image) => (
                        <img key={image} src={image} alt={product.name} />
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <p className="vf-label">{product.category ?? "Store"}</p>
                    <h2>{product.name}</h2>
                    <p className="vf-muted">{product.description ?? `${product.stock} available`}</p>
                  </div>
                  <p>
                    <strong>{formatCurrency(price)}</strong>
                    {getSurchargeTotal(product.surcharges) > 0 ? <small className="vf-muted"> with surcharges</small> : null}
                  </p>
                  <form action={addToCart} className="vf-form">
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="orgSlug" value={org.subdomain} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="productId" value={product.id} />
                    {options.map((option) => (
                      <label key={option.name}>
                        {option.name}
                        <select name={`option-${option.name}`} required>
                          {option.values.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label>
                      Quantity
                      <input name="quantity" type="number" min="1" max={product.stock} defaultValue="1" />
                    </label>
                    <Button label="Add to cart" type="submit" variant="primary" />
                  </form>
                </Card>
              );
            })}
            {event.storeProducts.length === 0 ? (
              <section className="vf-section">
                <h2>No products</h2>
                <p className="vf-muted">Store products have not been published yet.</p>
              </section>
            ) : null}
          </section>
          <StoreCart
            cart={cart}
            returnPath={storePath}
            successPath={storePath}
            cancelPath={storePath}
          />
        </div>
      ) : null}
    </main>
  );
}
