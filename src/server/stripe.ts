import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/server/http";

const stripeEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  AUTH_URL: z.string().url()
});

function getStripeEnv() {
  return stripeEnvSchema.parse({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    AUTH_URL: process.env.AUTH_URL
  });
}

export type StripeCheckoutLineItem = {
  name: string;
  quantity: number;
  unitAmountCents: number;
};

export async function createStripeCheckoutSession(input: {
  orderId: string;
  eventId: string;
  lineItems: StripeCheckoutLineItem[];
}) {
  const env = getStripeEnv();
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("success_url", `${env.AUTH_URL}/orders/${input.orderId}?checkout=success`);
  params.set("cancel_url", `${env.AUTH_URL}/orders/${input.orderId}?checkout=cancelled`);
  params.set("client_reference_id", input.orderId);
  params.set("metadata[orderId]", input.orderId);
  params.set("metadata[eventId]", input.eventId);

  input.lineItems.forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const body = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };

  if (!response.ok || !body.id || !body.url) {
    throw new HttpError(502, body.error?.message ?? "Unable to create Stripe Checkout session");
  }

  return { id: body.id, url: body.url };
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
  const env = getStripeEnv();

  if (!signatureHeader) {
    throw new HttpError(400, "Missing Stripe signature");
  }

  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.get("t");
  const expectedSignature = parts.get("v1");

  if (!timestamp || !expectedSignature) {
    throw new HttpError(400, "Invalid Stripe signature");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(digest, "hex");

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new HttpError(400, "Invalid Stripe signature");
  }
}
