import { getStripe } from "@/lib/payments/stripe";
import type Stripe from "stripe";

const PLACEHOLDER_MARKERS = ["replace", "example", "your-", "..."];

export type StripeWebhookVerification =
  | { ok: true; event: Stripe.Event }
  | { ok: false; status: 400 | 503; error: string };

export function isConfiguredStripeWebhookSecret(value: string | undefined): value is string {
  if (!value || value !== value.trim() || !value.startsWith("whsec_") || value.length < 20) {
    return false;
  }

  const normalized = value.toLowerCase();
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export function verifyStripeWebhookEvent(
  rawBody: string,
  signature: string | null,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
): StripeWebhookVerification {
  if (!isConfiguredStripeWebhookSecret(webhookSecret)) {
    return { ok: false, status: 503, error: "Stripe webhook signing is not configured." };
  }

  if (!signature) {
    return { ok: false, status: 400, error: "Stripe signature is required." };
  }

  try {
    return {
      ok: true,
      event: getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
    };
  } catch {
    return { ok: false, status: 400, error: "Invalid Stripe webhook signature." };
  }
}
