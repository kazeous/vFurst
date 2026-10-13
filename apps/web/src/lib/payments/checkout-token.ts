import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function checkoutSecret() {
  const secret = process.env.CHECKOUT_TOKEN_SECRET || process.env.AUTH_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("CHECKOUT_TOKEN_SECRET is not configured.");
  }

  return secret || "vfurst-local-checkout-secret";
}

export function createCheckoutToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashCheckoutToken(token)
  };
}

export function hashCheckoutToken(token: string) {
  return createHmac("sha256", checkoutSecret()).update(token).digest("hex");
}

export function verifyCheckoutToken(token: string, expectedHash: string | null | undefined) {
  if (!token || !expectedHash) {
    return false;
  }

  const actual = Buffer.from(hashCheckoutToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
