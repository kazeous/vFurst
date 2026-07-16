import type Stripe from "stripe";

export type StripeCheckoutSessionOutcome =
  | { type: "paid"; paymentIntentId: string }
  | { type: "expired" }
  | { type: "pending" }
  | { type: "redirect"; url: string };

function paymentIntentId(session: Pick<Stripe.Checkout.Session, "payment_intent">) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
}

/**
 * A customer can return from Stripe after the session is complete but before
 * the webhook reaches us. Treat that state as a local confirmation flow; it
 * is not a new checkout attempt and Stripe will not provide a URL to reopen.
 */
export function resolveStripeCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "payment_intent" | "payment_status" | "status" | "url">
): StripeCheckoutSessionOutcome {
  const intentId = paymentIntentId(session);

  if (session.payment_status === "paid" && intentId) {
    return { type: "paid", paymentIntentId: intentId };
  }

  if (session.status === "expired") {
    return { type: "expired" };
  }

  if (!session.url) {
    return { type: "pending" };
  }

  return { type: "redirect", url: session.url };
}
