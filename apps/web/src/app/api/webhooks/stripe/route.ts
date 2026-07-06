import { markOrderPaid, markOrderPaidByPaymentIntent, markOrderRefundedByPaymentIntent } from "@/lib/fulfillment";
import { getStripe } from "@/lib/payments/stripe";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook payload.";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.client_reference_id ?? session.metadata?.orderId;
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        if (orderId) {
          await markOrderPaid(orderId, paymentIntentId);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await markOrderPaidByPaymentIntent(paymentIntent.id, paymentIntent.metadata?.orderId);
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
    const message = error instanceof Error ? error.message : "Webhook handler failed.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}

