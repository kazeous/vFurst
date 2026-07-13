# Phase 3 — Event Store & Add-ons (Weeks 16–19)

> **Goal**: Product catalog, inventory, surcharges, discount engine, vouchers/comps, unified cart, refunds.

---

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/store/page.tsx`
Product management:
- Product CRUD: name, price, description, images (S3 upload), stock, category
- **Surcharges**: configurable per-product surcharges (shipping, handling)
- Product add-ons (e.g., size selection, color)
- Inventory tracking with low-stock alerts

##### [NEW] `apps/web/src/app/(convention)/[orgSlug]/store/page.tsx`
Public storefront (convention subdomain):
- Product grid with shadcn/ui `Card`, image gallery
- **Unified cart**: combine registration + store items in one checkout
- Shared provider-neutral checkout; Stripe uses a 1% `application_fee_amount`, while matched SePay VND orders retain the same platform fee before organizer ledger credit

##### [NEW] `apps/web/src/components/store/cart.tsx`
Shopping cart component:
- **Server-side cart** backed by `Cart` + `CartItem` database tables (not localStorage)
- Cart loaded via Server Component on page render — no SSR/hydration mismatch
- Mutations via Server Actions (`addToCart`, `removeFromCart`, `updateQuantity`)
- Works across devices (user logs in → same cart), survives incognito/storage clears
- Discount code application
- Real-time total calculation with surcharges
- Cart → Order conversion before shared checkout; CartItems become OrderItems and the cart clears only after successful provider-neutral fulfillment

> [!NOTE]
> **Why not localStorage?** Next.js App Router renders on the server first. A localStorage-based cart would render empty on the server, then hydrate with items on the client, causing a React hydration mismatch error. A DB-backed cart also enables cross-device persistence and unified cart features (registration + store in one checkout).

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/vouchers/page.tsx`
Voucher management:
- Create: percentage discount, flat discount, or **comped registration** (100% off)
- Usage limits, expiration dates, tier restrictions
- **Bulk generate**: create N codes with shared rules
- Usage tracking table

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/store/orders/page.tsx`
Order management:
- Order list with status filters
- Order detail with line items + platform fee breakdown
- **Refund flow**: Stripe refund through the platform-owned charge; SePay full refund recorded after the external bank transfer, with idempotent fulfillment and ledger reversal

##### [NEW] `apps/web/src/actions/store-actions.ts`
Server Actions: `createProduct`, `updateProduct`, `deleteProduct`, `createOrder`, `refundOrder`, `partialRefund`.

##### [NEW] `apps/web/src/actions/voucher-actions.ts`
Server Actions: `createVoucher`, `bulkGenerateVouchers`, `validateVoucher`, `applyVoucher`.

##### [NEW] `apps/web/src/actions/cart-actions.ts`
Server Actions for the DB-backed shopping cart: `addToCart`, `removeFromCart`, `updateQuantity`, `clearCart`, `convertCartToOrder`.
Used by `components/store/cart.tsx` for all cart mutations.

---
