# Phase 4 Boundary Report

## Frontend Files Changed

- `src/features/public-events/public-event-client.tsx`
- `src/features/cart/cart-client.tsx`
- `src/app/events/[slug]/cart/page.tsx`
- `src/features/orders/order-detail-client.tsx`
- `src/app/orders/[orderId]/page.tsx`
- `src/features/events/event-detail-client.tsx`

## Backend/API Files Changed

- `src/app/api/events/[eventId]/cart/route.ts`
- `src/app/api/events/[eventId]/cart/items/[cartItemId]/route.ts`
- `src/app/api/events/[eventId]/orders/route.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[orderId]/route.ts`
- `src/app/api/orders/[orderId]/checkout/route.ts`
- `src/app/api/orders/[orderId]/manual-payment/route.ts`
- `src/app/api/orders/[orderId]/refunds/route.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/server/orders.ts`
- `src/server/stripe.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260523180500_phase_4_cart_orders_payments/migration.sql`

Added `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, `Refund`, and `StripeWebhookEvent`, plus order/payment/refund status enums.

## Shared Files Changed

- `src/shared/orders.ts`
- `src/shared/schemas/cart.ts`
- `src/shared/schemas/order.ts`
- `.env.example`

## Business Logic Added

- Authenticated cart per user/event.
- Server-side cart item creation, update, and removal.
- Server-priced order creation from cart with product snapshots.
- Server-side stock checks against submitted registrations and active order reservations.
- Stripe Checkout session creation.
- Stripe webhook signature verification and idempotent event storage.
- Webhook-driven order/payment paid status reconciliation.
- Admin-only offline mark-as-paid.
- Admin refund tracking records.

## Auth/Permission Enforcement

- Cart and order creation require `requireSession()`.
- Cart item reads/writes verify the cart belongs to the signed-in user.
- Attendee order detail requires order ownership, unless the user has event access.
- Event order listing requires `requireEventManager()`.
- Manual mark-as-paid requires `requireEventManager()`.
- Refund records require `requireEventManager()`.
- Stripe webhook does not use user session; it requires a valid Stripe signature and stores processed event IDs for idempotency.

## Temporary Mocks or TODOs

- Stripe Checkout is real server-side handoff, but local testing needs valid Stripe test keys.
- Refund records do not call Stripe refund APIs yet.
- Unpaid orders reserve stock until cancelled; automatic abandoned-order expiry is deferred.
- Public registration from Phase 3 remains a free registration record and is not yet converted into a paid order.
- No fulfillment, vendor, volunteer, check-in, email, notes, or checklist behavior was added.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npx prisma validate` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with local Phase 4 environment variables.
- Browser verified public store add-to-cart, cart order creation, attendee order detail, admin manual mark-as-paid, admin refund record, and order detail payment/refund display.
