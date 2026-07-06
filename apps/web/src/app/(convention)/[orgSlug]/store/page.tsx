import { addToCart } from "@/actions/cart-actions";
import { StoreCart } from "@/components/store/cart";
import { auth } from "@/lib/auth";
import { getConventionOrg } from "@/lib/convention";
import { formatCurrency } from "@/lib/registration/pricing";
import { getSurchargeTotal, parseProductOptions } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function imageUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function PublicStorePage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string }>;
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

  const cart =
    event && session?.user?.id
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

      {query.success ? (
        <section className="vf-section">
          <h2>Order received</h2>
          <p className="vf-muted">Your store order is confirmed.</p>
        </section>
      ) : null}

      {query.cancelled ? (
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
      ) : (
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
            returnPath={`/${org.subdomain}/store`}
            successPath={`/${org.subdomain}/store`}
            cancelPath={`/${org.subdomain}/store`}
          />
        </div>
      )}
    </main>
  );
}
