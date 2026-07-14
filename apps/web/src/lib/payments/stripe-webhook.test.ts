import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { isConfiguredStripeWebhookSecret, verifyStripeWebhookEvent } from "./stripe-webhook";

const webhookSecret = "whsec_unit_test_signing_secret_1234567890";
const payload = JSON.stringify({
  id: "evt_unit_test",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_unit_test", object: "payment_intent", metadata: {} } }
});
const signer = new Stripe("sk_test_unit_webhook_signer");
const originalStripeSecretKey = process.env.STRIPE_SECRET_KEY;

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_webhook_verifier";
});

afterAll(() => {
  if (originalStripeSecretKey === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = originalStripeSecretKey;
  }
});

function signature(timestamp = Math.floor(Date.now() / 1000), signedPayload = payload) {
  return signer.webhooks.generateTestHeaderString({ payload: signedPayload, secret: webhookSecret, timestamp });
}

describe("isConfiguredStripeWebhookSecret", () => {
  it.each([undefined, "", "whsec_short", "whsec_replace_me", " whsec_valid_but_padded_1234567890"])(
    "rejects missing or placeholder secret %j",
    (value) => {
      expect(isConfiguredStripeWebhookSecret(value)).toBe(false);
    }
  );

  it("accepts a non-placeholder Stripe signing secret", () => {
    expect(isConfiguredStripeWebhookSecret(webhookSecret)).toBe(true);
  });
});

describe("verifyStripeWebhookEvent", () => {
  it("fails closed when webhook signing is not configured", () => {
    expect(verifyStripeWebhookEvent(payload, signature(), undefined)).toEqual({
      ok: false,
      status: 503,
      error: "Stripe webhook signing is not configured."
    });
    expect(verifyStripeWebhookEvent(payload, signature(), "whsec_replace_me")).toEqual({
      ok: false,
      status: 503,
      error: "Stripe webhook signing is not configured."
    });
  });

  it("rejects a missing signature", () => {
    expect(verifyStripeWebhookEvent(payload, null, webhookSecret)).toEqual({
      ok: false,
      status: 400,
      error: "Stripe signature is required."
    });
  });

  it("rejects invalid, stale, and payload-mismatched signatures", () => {
    expect(verifyStripeWebhookEvent(payload, "t=1,v1=invalid", webhookSecret).ok).toBe(false);
    expect(verifyStripeWebhookEvent(payload, signature(Math.floor(Date.now() / 1000) - 600), webhookSecret).ok).toBe(false);
    expect(verifyStripeWebhookEvent(`${payload} `, signature(), webhookSecret).ok).toBe(false);
  });

  it("returns the Stripe event only for the exact signed raw body", () => {
    const result = verifyStripeWebhookEvent(payload, signature(), webhookSecret);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt_unit_test");
      expect(result.event.type).toBe("payment_intent.succeeded");
    }
  });
});
