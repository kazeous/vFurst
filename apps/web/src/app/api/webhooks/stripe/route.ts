import {
  markOrderPaidByPaymentIntent,
  markOrderPaidWithProvider,
  markOrderRefundedByPaymentIntent
} from "@/lib/fulfillment";
import { verifyStripeWebhookEvent } from "@/lib/payments/stripe-webhook";
import {
  RATE_LIMIT_WINDOW_MS,
  STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE,
  applyFixedWindowRateLimit,
  getClientIp,
  rateLimitResponse
} from "@/lib/rate-limit";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const rate = applyFixedWindowRateLimit({
    namespace: "stripe-webhook",
    key: getClientIp(request),
    limit: STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS
  });

  if (rate.limited) {
    return rateLimitResponse(rate);
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  const verification = verifyStripeWebhookEvent(body, signature);

  if (!verification.ok) {
    if (verification.status === 503) {
      console.error("Stripe webhook rejected because signing is not configured.");
    }

    return Response.json({ error: verification.error }, { status: verification.status });
  }

  const event = verification.event;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.client_reference_id ?? session.metadata?.orderId;
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        if (orderId && paymentIntentId) {
          await markOrderPaidWithProvider(orderId, "STRIPE", paymentIntentId, {
            paymentAttemptId: session.metadata?.paymentAttemptId,
            attemptProviderReference: session.id
          });
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await markOrderPaidByPaymentIntent(
          paymentIntent.id,
          paymentIntent.metadata?.orderId,
          paymentIntent.metadata?.paymentAttemptId
        );
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

        if (paymentIntentId) {
          await markOrderRefundedByPaymentIntent(paymentIntentId);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook processing failed.", error);
    return Response.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
