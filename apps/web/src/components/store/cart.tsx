import { ActionStateForm } from "@/components/action-state-form";
import { clearCart, removeFromCart } from "@/actions/cart-actions";
import { CartCheckoutForm, CartQuantityForm, CartVoucherForm } from "@/components/store/cart-forms";
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
          <ActionStateForm action={clearCart}>
            <input type="hidden" name="cartId" value={cart.id} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <Button label="Clear" type="submit" size="sm" variant="ghost" />
          </ActionStateForm>
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
              <CartQuantityForm
                cartItemId={item.id}
                returnPath={returnPath}
                initialQuantity={item.quantity}
                itemLabel={item.product?.name ?? "cart item"}
              />
              <ActionStateForm action={removeFromCart}>
                <input type="hidden" name="cartItemId" value={item.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <Button label="Remove" type="submit" size="sm" variant="destructive" />
              </ActionStateForm>
            </div>
          );
        })}
        {cart.items.length === 0 ? <p className="vf-empty">Your cart is empty.</p> : null}
      </div>

      <CartVoucherForm cartId={cart.id} returnPath={returnPath} initialCode={cart.voucher?.code ?? ""} />

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

      <CartCheckoutForm
        cartId={cart.id}
        returnPath={returnPath}
        successPath={successPath}
        cancelPath={cancelPath}
        isEmpty={cart.items.length === 0}
      />
    </section>
  );
}
