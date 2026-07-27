import { isSafeLocalReturnPath } from "@vfurst/auth/core";

export const CHECKOUT_RETURN_PATH_FALLBACK = "/account/orders";

export function requireSafeCheckoutReturnPath(value: string) {
  if (!isSafeLocalReturnPath(value)) {
    throw new Error("Checkout return paths must be safe local application paths.");
  }

  return value;
}

export function safeCheckoutReturnPath(
  value: string | null | undefined,
  fallback = CHECKOUT_RETURN_PATH_FALLBACK
) {
  return isSafeLocalReturnPath(value ?? undefined) ? value! : fallback;
}
