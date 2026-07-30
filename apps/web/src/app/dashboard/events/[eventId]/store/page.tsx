import { archiveProduct, createProduct, restoreProduct, updateProduct } from "@/actions/store-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { formatCurrency, formatMoneyInput } from "@/lib/registration/pricing";
import { getSurchargeTotal, parseProductOptions, parseProductSurcharges } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

function imageUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function StoreManagementPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      storeProducts: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const activeProducts = event.storeProducts.filter((product) => !product.archivedAt);
  const archivedProducts = event.storeProducts.filter((product) => product.archivedAt);
  const lowStockProducts = activeProducts.filter((product) => product.stock <= 5);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Store</p>
          <h1>Product catalog</h1>
        </div>
        <Button label="Public store" href={`/${event.org.subdomain}/store`} />
      </header>

      {lowStockProducts.length > 0 ? (
        <section className="vf-section">
          <h2>Low stock alerts</h2>
          <div className="vf-list">
            {lowStockProducts.map((product) => (
              <div key={product.id} className="vf-list-row">
                <span>{product.name}</span>
                <small>{product.stock} left</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Create product</h2>
          <ActionStateForm action={createProduct} className="vf-form" errorTestId="create-product-error">
            <input type="hidden" name="eventId" value={event.id} />
            <label>
              Name
              <input name="name" required placeholder="Convention T-shirt" />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} placeholder="Soft cotton event shirt" />
            </label>
            <div className="vf-subform-row">
              <label>
                Price
                <input name="price" type="number" min="0" step={event.currency === "VND" ? "1" : "0.01"} required />
              </label>
              <label>
                Stock
                <input name="stock" type="number" min="0" required />
              </label>
              <label>
                Category
                <input name="category" placeholder="Apparel" />
              </label>
            </div>
            <label>
              Image URL
              <input name="imageUrl" type="url" placeholder="https://..." />
            </label>
            <label>
              Upload image
              <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp" />
              <small className="vf-muted">PNG, JPEG, or WebP · up to 5 MB</small>
            </label>
            <div className="vf-subform-row">
              <label>
                Surcharge
                <input name="surchargeName" placeholder="Shipping" />
              </label>
              <label>
                Amount
                <input name="surchargeAmount" type="number" min="0" step={event.currency === "VND" ? "1" : "0.01"} />
              </label>
            </div>
            <div className="vf-subform-row">
              <label>
                Option
                <input name="optionName" placeholder="Size" />
              </label>
              <label>
                Values
                <input name="optionValues" placeholder="S, M, L, XL" />
              </label>
            </div>
            <Button label="Create product" type="submit" variant="primary" />
          </ActionStateForm>
        </div>

        <div className="vf-section">
          <h2>Inventory</h2>
          <div className="vf-stat-grid">
            <div className="vf-stat-card">
              <p className="vf-label">Products</p>
              <strong>{activeProducts.length}</strong>
              <span>Catalog items</span>
            </div>
            <div className="vf-stat-card">
              <p className="vf-label">Stock</p>
              <strong>{activeProducts.reduce((sum, product) => sum + product.stock, 0)}</strong>
              <span>Units available</span>
            </div>
          </div>
        </div>
      </section>

      <section className="vf-stack">
        {activeProducts.map((product) => {
          const surcharges = parseProductSurcharges(product.surcharges);
          const options = parseProductOptions(product.options);
          const images = imageUrls(product.images);

          return (
            <div key={product.id} className="vf-section">
              <div className="vf-page-header">
                <div>
                  <p className="vf-label">{product.category ?? "Uncategorized"}</p>
                  <h2>{product.name}</h2>
                  <p className="vf-muted">
                    {formatCurrency(product.price, event.currency)} + {formatCurrency(getSurchargeTotal(product.surcharges), event.currency)} surcharges - {product.stock} in stock
                  </p>
                </div>
                <form action={archiveProduct}>
                  <input type="hidden" name="productId" value={product.id} />
                  <Button label="Archive" type="submit" variant="destructive" size="sm" />
                </form>
              </div>
              {images.length > 0 ? (
                <div className="vf-image-strip">
                  {images.map((image) => (
                    // Organizer-provided product URLs cannot be statically allowlisted for the Next image optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={image} src={image} alt={product.name} />
                  ))}
                </div>
              ) : null}
              <ActionStateForm action={updateProduct} className="vf-form">
                <input type="hidden" name="productId" value={product.id} />
                <label>
                  Name
                  <input name="name" defaultValue={product.name} required />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={3} defaultValue={product.description ?? ""} />
                </label>
                <div className="vf-subform-row">
                  <label>
                    Price
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step={event.currency === "VND" ? "1" : "0.01"}
                      defaultValue={formatMoneyInput(product.price, event.currency)}
                      required
                    />
                  </label>
                  <label>
                    Stock
                    <input name="stock" type="number" min="0" defaultValue={product.stock} required />
                  </label>
                  <label>
                    Category
                    <input name="category" defaultValue={product.category ?? ""} />
                  </label>
                </div>
                {(surcharges.length > 0 ? surcharges : [{ name: "", amount: 0 }]).map((surcharge, index) => (
                  <div key={`${product.id}-surcharge-${index}`} className="vf-subform-row">
                    <label>
                      Surcharge
                      <input name="surchargeName" defaultValue={surcharge.name} />
                    </label>
                    <label>
                      Amount
                      <input
                        name="surchargeAmount"
                        type="number"
                        min="0"
                        step={event.currency === "VND" ? "1" : "0.01"}
                        defaultValue={formatMoneyInput(surcharge.amount, event.currency)}
                      />
                    </label>
                  </div>
                ))}
                {(options.length > 0 ? options : [{ name: "", values: [] }]).map((option, index) => (
                  <div key={`${product.id}-option-${index}`} className="vf-subform-row">
                    <label>
                      Option
                      <input name="optionName" defaultValue={option.name} />
                    </label>
                    <label>
                      Values
                      <input name="optionValues" defaultValue={option.values.join(", ")} />
                    </label>
                  </div>
                ))}
                <label>
                  Add image
                  <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp" />
                  <small className="vf-muted">PNG, JPEG, or WebP · up to 5 MB</small>
                </label>
                <Button label="Save product" type="submit" />
              </ActionStateForm>
            </div>
          );
        })}
        {activeProducts.length === 0 ? <p className="vf-empty">No active products yet.</p> : null}
      </section>

      {archivedProducts.length > 0 ? (
        <section className="vf-section">
          <h2>Archived products</h2>
          <p className="vf-muted">Archived products are hidden from the public store and removed from active carts. Existing orders remain as records.</p>
          <div className="vf-list">
            {archivedProducts.map((product) => (
              <div key={product.id} className="vf-list-row">
                <span>
                  <strong>{product.name}</strong>
                  <small>Archived {product.archivedAt?.toLocaleString()}</small>
                </span>
                <form action={restoreProduct}>
                  <input type="hidden" name="productId" value={product.id} />
                  <Button label="Restore" type="submit" size="sm" />
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
