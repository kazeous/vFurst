# Phase 2 — Attendee Registration & Hotel Booking (Weeks 10–15)

> **Goal**: Product system, attendance tiers, scheduled pricing, public registration flow, provider-neutral payments, order management, tier upgrades, add-ons, confirmation emails, **and hotel room booking**.

---

##### [NEW] `apps/web/src/app/dashboard/events/page.tsx`
Events list with filters using shadcn/ui `PowerSearch`, `Table`, `Badge` for status.

##### [NEW] `apps/web/src/app/dashboard/events/new/page.tsx`
Event creation wizard (multi-step using shadcn/ui `SegmentedControl`):
1. Basic info (name, dates, venue, description)
2. Registration types + pricing tiers
3. Settings (payment, capacity, visibility)
4. Review & publish

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/layout.tsx`
Event-scoped layout integrated into the shared organizer shell with grouped two-action navigation and focused event-day sub-layouts:
```
├── Overview
├── Registrations
│   ├── All Registrations
│   ├── Registration Types
│   └── Transfers
├── Check-In
├── Badges
├── Staff
│   ├── Overview
│   ├── Departments
│   ├── Applications      ← VolunteerApplication management
│   └── Schedule
├── Vendors
├── Store
├── Hotel
├── Vouchers
├── Raffle
├── Analytics
└── Settings
```

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/page.tsx`
Event overview dashboard with Recharts:
- Registration count trend (area chart)
- Revenue summary (stat cards)
- Capacity by tier (progress bars)
- Recent registrations feed

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/registrations/types/page.tsx`
Registration type management:
- CRUD for attendance tiers
- **Scheduled pricing engine**: define price changes by date range (early bird → regular → late)
- Capacity limits per tier
- **Add-on definitions per tier**: CRUD for `AddOnDefinition` records scoped to each `RegistrationType` (name, price, isComplimentary, maxQuantity). Different tiers can offer different add-ons.
- Drag-to-reorder display order

##### [NEW] `apps/web/src/app/(convention)/[orgSlug]/register/page.tsx`
Branded public registration flow (on convention subdomain/custom domain):
1. Ticket — select tier and show scheduled price
2. Attendee/Add-ons — collect attendee details and tier-specific additions
3. Review/Payment — apply voucher, confirm immutable event currency, and create a pending order
4. Redirect to the shared checkout; zero-value orders complete immediately
5. Confirmation page + email after provider-neutral fulfillment

##### [NEW] `apps/web/src/app/checkout/[orderId]/page.tsx`
Shared signed-token checkout for registration, store/cart, hotel, and vendor orders:
- USD card checkout through Stripe Connect destination charges
- Configured VND checkout can offer Stripe and embedded SePay VietQR
- Accessible bank-transfer fallback, three-second paid-status polling, 30-minute attempt/reservation expiry
- Provider switching is locked while an attempt is active

##### [NEW] `apps/web/src/actions/checkout-actions.ts`
Start Stripe or SePay attempts after validating the checkout token, provider readiness, amount, currency, and reservation state.

##### [NEW] `apps/web/src/app/api/payments/orders/[orderId]/status/route.ts`
Return token-authorized payment status for the checkout poller without exposing organizer or provider secrets.

##### [NEW] `apps/web/src/app/api/webhooks/stripe/route.ts`
Stripe webhook handler:
- `checkout.session.completed` / `payment_intent.succeeded` → invoke the shared atomic provider-neutral paid transition
- `charge.refunded` → invoke idempotent fulfillment reversal
- Preserve destination-charge and `application_fee_amount` metadata while keeping fulfillment provider-independent

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/registrations/page.tsx`
Registrations table:
- Search/filter by name, email, status, type
- Bulk actions (confirm, cancel, refund)
- Export to CSV
- Click-through to detail

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/registrations/[regId]/page.tsx`
Registration detail:
- Attendee info, payment status, badge preview
- Check-in status, add-ons
- **Staff notes** (`AttendeeNote` CRUD)
- Actions: resend email, cancel, refund, upgrade tier
- **Registration transfer**: initiate transfer to another user

##### [NEW] `apps/web/src/actions/registration-actions.ts`
Server Actions: `createRegistration`, `confirmRegistration`, `cancelRegistration`, `refundRegistration`, `upgradeTier`, `transferRegistration`.

---

#### Hotel Booking (Phase 2)

> [!NOTE]
> Hotel booking is built here in Phase 2 (not deferred) because it shares the registration flow's provider-neutral order/checkout pipeline. Building it alongside registration avoids duplicating payment and reservation logic later.

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/hotel/page.tsx`
Hotel management (admin):
- Create hotel blocks: hotel name, room types (single/double/suite), rates, block size, cutoff date
- View booking status per block (booked vs. available)
- Manage individual bookings (cancel, modify dates)

##### [NEW] `apps/web/src/app/(convention)/[orgSlug]/hotel/page.tsx`
Public hotel booking page (convention subdomain):
- Browse available hotel blocks and room types
- Select dates, room type
- Shared Stripe/SePay checkout with the configured per-booking platform fee
- Confirmation email with booking details

##### [NEW] `apps/web/src/actions/hotel-actions.ts`
Server Actions: `createHotelBlock`, `updateHotelBlock`, `bookRoom`, `cancelBooking`.

---
