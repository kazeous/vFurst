import { clearCart, removeFromCart, updateQuantity } from "@/actions/cart-actions";
import { createOrder } from "@/actions/store-actions";
import { applyVoucher } from "@/actions/voucher-actions";
import { formatCurrency } from "@/lib/registration/pricing";
import { getCartSummary, getSurchargeTotal, parseProductSurcharges } from "@/lib/store/pricing";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@vfurst/db";

type CartProduct = {
  id: string;
  name: string;
  surcharges: unknown;
};

type CartItem = {
  id: string;
  itemType: string;
  refId: string;
  unitPrice: number;
  quantity: number;
  metadata: unknown;
  product: CartProduct | null;
};

type Cart = {
  id: string;
  eventId: string;
  items: CartItem[];
  voucher: { discountType: "PERCENT" | "AMOUNT"; discountValue: number; code: string } | null;
};

function selectedOptions(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("selectedOptions" in metadata)) {
    return [];
  }

  const options = (metadata as { selectedOptions?: unknown }).selectedOptions;

  if (!options || typeof options !== "object") {
    return [];
  }

  return Object.entries(options as Record<string, string>).map(([name, value]) => `${name}: ${value}`);
}

export function StoreCart({ cart, currency, returnPath, successPath, cancelPath }: { cart: Cart | null; currency: CurrencyCode; returnPath: string; successPath: string; cancelPath: string }) {
  if (!cart) {
    return (
      <section className="vf-section">
        <h2>Cart</h2>
        <p className="vf-muted">Sign in, then add products to your cart.</p>
      </section>
    );
  }

  const summary = getCartSummary(cart.items, cart.voucher);

  return (
    <section className="vf-section">
      <div className="vf-page-header">
        <div>
          <p className="vf-label">Unified cart</p>
          <h2>Cart</h2>
        </div>
        {cart.items.length > 0 ? (
          <form action={clearCart}>
            <input type="hidden" name="cartId" value={cart.id} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <Button label="Clear" type="submit" size="sm" variant="ghost" />
          </form>
        ) : null}
      </div>

      <div className="vf-stack">
        {cart.items.map((item) => {
          const surcharges = parseProductSurcharges(item.product?.surcharges);
          const options = selectedOptions(item.metadata);

          return (
            <div key={item.id} className="vf-cart-row">
              <div>
                <strong>{item.product?.name ?? item.itemType}</strong>
                <small>{formatCurrency(item.unitPrice + getSurchargeTotal(item.product?.surcharges), currency)} each</small>
                {options.length > 0 ? <small>{options.join(" / ")}</small> : null}
                {surcharges.length > 0 ? <small>{surcharges.map((surcharge) => `${surcharge.name} ${formatCurrency(surcharge.amount, currency)}`).join(", ")}</small> : null}
              </div>
              <form action={updateQuantity} className="vf-inline-form">
                <input type="hidden" name="cartItemId" value={item.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <input aria-label={`Quantity for ${item.product?.name ?? "cart item"}`} name="quantity" type="number" min="1" max="99" defaultValue={item.quantity} />
                <Button label="Update" type="submit" size="sm" />
              </form>
              <form action={removeFromCart}>
                <input type="hidden" name="cartItemId" value={item.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <Button label="Remove" type="submit" size="sm" variant="destructive" />
              </form>
            </div>
          );
        })}
        {cart.items.length === 0 ? <p className="vf-empty">Your cart is empty.</p> : null}
      </div>

      <form action={applyVoucher} className="vf-inline-form">
        <input type="hidden" name="cartId" value={cart.id} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <label>
          Discount code
          <input name="code" placeholder="CODE" defaultValue={cart.voucher?.code ?? ""} />
        </label>
        <Button label="Apply" type="submit" />
      </form>

      <div className="vf-cart-summary">
        <span>Subtotal</span>
        <strong>{formatCurrency(summary.subtotal, currency)}</strong>
        <span>Surcharges</span>
        <strong>{formatCurrency(summary.surcharges, currency)}</strong>
        <span>Discount</span>
        <strong>-{formatCurrency(summary.discount, currency)}</strong>
        <span>Platform fee</span>
        <strong>{formatCurrency(summary.platformFee, currency)}</strong>
        <span>Total</span>
        <strong>{formatCurrency(summary.total, currency)}</strong>
      </div>

      <form action={createOrder}>
        <input type="hidden" name="cartId" value={cart.id} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <input type="hidden" name="successPath" value={successPath} />
        <input type="hidden" name="cancelPath" value={cancelPath} />
        <Button label="Checkout" type="submit" variant="primary" isDisabled={cart.items.length === 0} />
      </form>
    </section>
  );
}
