# Phase 7 PCI SAQ A Notes

## Payment architecture

- vFurst uses Stripe Checkout and Stripe Connect destination charges.
- Card numbers, expiration dates, CVC values, and wallet credentials are entered on Stripe-hosted surfaces.
- vFurst stores order totals, platform fees, Stripe Checkout/PaymentIntent references, refund state, and fulfillment state.
- Platform fees are collected through `application_fee_amount`; there is no secondary billing job that charges conventions later.

## Operational requirements

- Use HTTPS in production.
- Keep Stripe secret keys, webhook secrets, and Connect configuration in environment variables.
- Restrict dashboard access through Auth.js sessions and organization roles.
- Keep Stripe webhook signature verification enabled in production with `STRIPE_WEBHOOK_SECRET`.
- Review Stripe account and Connect onboarding status before allowing paid public registration.

## Verification

- Inspect the database schema for absence of card-number fields.
- Confirm checkout flows redirect to Stripe-hosted Checkout for paid orders.
- Confirm zero-dollar and comped flows never ask for card details.
- Confirm refunds use Stripe object IDs rather than local card data.
