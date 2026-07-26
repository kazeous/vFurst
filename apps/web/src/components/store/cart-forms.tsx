"use client";

import { updateQuantity } from "@/actions/cart-actions";
import { createOrder } from "@/actions/store-actions";
import { applyVoucher } from "@/actions/voucher-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { initialPublicFormState } from "@/lib/public-form-state";
import { useActionState, useState } from "react";

export function CartQuantityForm({
  cartItemId,
  returnPath,
  initialQuantity,
  itemLabel
}: {
  cartItemId: string;
  returnPath: string;
  initialQuantity: number;
  itemLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(updateQuantity, initialPublicFormState);
  const [quantity, setQuantity] = useState(String(initialQuantity));

  return (
    <form action={formAction} className="vf-inline-form">
      <input type="hidden" name="cartItemId" value={cartItemId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input
        aria-label={`Quantity for ${itemLabel}`}
        name="quantity"
        type="number"
        min="1"
        max="99"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <Button label={isPending ? "Updating..." : "Update"} type="submit" size="sm" isDisabled={isPending} />
      {state.error ? (
        <Alert variant="error" data-testid="cart-quantity-error">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}

export function CartVoucherForm({ cartId, returnPath, initialCode }: { cartId: string; returnPath: string; initialCode: string }) {
  const [state, formAction, isPending] = useActionState(applyVoucher, initialPublicFormState);
  const [code, setCode] = useState(initialCode);

  return (
    <form action={formAction} className="vf-inline-form">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <label>
        Discount code
        <input name="code" placeholder="CODE" value={code} onChange={(event) => setCode(event.target.value)} />
      </label>
      <Button label={isPending ? "Applying..." : "Apply"} type="submit" isDisabled={isPending} />
      {state.error ? (
        <Alert variant="error" data-testid="cart-voucher-error">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}

export function CartCheckoutForm({
  cartId,
  returnPath,
  successPath,
  cancelPath,
  isEmpty
}: {
  cartId: string;
  returnPath: string;
  successPath: string;
  cancelPath: string;
  isEmpty: boolean;
}) {
  const [state, formAction, isPending] = useActionState(createOrder, initialPublicFormState);

  return (
    <form action={formAction} className="vf-stack">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="successPath" value={successPath} />
      <input type="hidden" name="cancelPath" value={cancelPath} />
      {state.error ? (
        <Alert variant="error" data-testid="cart-checkout-error">
          {state.error}
        </Alert>
      ) : null}
      <Button
        label={isPending ? "Preparing checkout..." : "Checkout"}
        type="submit"
        variant="primary"
        isDisabled={isEmpty || isPending}
      />
    </form>
  );
}
