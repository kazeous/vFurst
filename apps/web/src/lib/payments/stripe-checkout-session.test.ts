import { describe, expect, it } from "vitest";
import { resolveStripeCheckoutSession } from "./stripe-checkout-session";

describe("resolveStripeCheckoutSession", () => {
  it("settles a completed session even when Stripe no longer exposes a checkout URL", () => {
    expect(
      resolveStripeCheckoutSession({
        payment_intent: { id: "pi_paid" } as never,
        payment_status: "paid",
        status: "complete",
        url: null
      })
    ).toEqual({ type: "paid", paymentIntentId: "pi_paid" });
  });

  it("keeps an incomplete session in local confirmation instead of throwing", () => {
    expect(
      resolveStripeCheckoutSession({
        payment_intent: null,
        payment_status: "unpaid",
        status: "complete",
        url: null
      })
    ).toEqual({ type: "pending" });
  });

  it("preserves an open Stripe URL for a new or resumable attempt", () => {
    expect(
      resolveStripeCheckoutSession({
        payment_intent: null,
        payment_status: "unpaid",
        status: "open",
        url: "https://checkout.stripe.com/c/pay/cs_test"
      })
    ).toEqual({ type: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test" });
  });
});
