"use client";

import { addToCart } from "@/actions/cart-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { initialPublicFormState } from "@/lib/public-form-state";
import { useActionState, useState } from "react";

type ProductOption = { name: string; values: string[] };

export function AddToCartForm({ productId, stock, options }: { productId: string; stock: number; options: ProductOption[] }) {
  const [state, formAction, isPending] = useActionState(addToCart, initialPublicFormState);
  const [quantity, setQuantity] = useState("1");

  return (
    <form action={formAction} className="vf-form">
      <input type="hidden" name="productId" value={productId} />
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
        <input
          name="quantity"
          type="number"
          min="1"
          max={stock}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      {state.error ? (
        <Alert variant="error" data-testid="add-to-cart-error">
          {state.error}
        </Alert>
      ) : null}
      <Button label={isPending ? "Adding..." : "Add to cart"} type="submit" variant="primary" isDisabled={isPending} />
    </form>
  );
}
