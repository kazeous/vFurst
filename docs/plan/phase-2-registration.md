# Phase 2 — Attendee Registration & Hotel Booking (Weeks 10–15)

> **Goal**: Product system, attendance tiers, scheduled pricing, public registration flow, Stripe payments, order management, tier upgrades, add-ons, confirmation emails, **and hotel room booking**.

---

##### [NEW] `apps/web/src/app/dashboard/events/page.tsx`
Events list with filters using Astryx `PowerSearch`, `Table`, `Badge` for status.

##### [NEW] `apps/web/src/app/dashboard/events/new/page.tsx`
Event creation wizard (multi-step using Astryx `SegmentedControl`):
1. Basic info (name, dates, venue, description)
2. Registration types + pricing tiers
3. Settings (payment, capacity, visibility)
4. Review & publish

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/layout.tsx`
Event-scoped layout with contextual `SideNav`:
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

##### [NEW] `apps/web/src/app/(convention)/register/page.tsx`
Public registration flow (on convention subdomain):
1. Select tier → shows scheduled price
2. Personal info form
3. Add-ons selection
4. Apply voucher/discount code
5. Stripe Checkout (via Stripe Connect, with `application_fee_amount: 100` = $1.00)
6. Confirmation page + email

##### [NEW] `apps/web/src/app/api/webhooks/stripe/route.ts`
Stripe webhook handler:
- `checkout.session.completed` → confirm registration, send confirmation email
- `payment_intent.succeeded` → mark order paid
- `charge.refunded` → update order + registration status

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
> Hotel booking is built here in Phase 2 (not deferred) because it shares the registration flow's Stripe Connect payment pipeline and the $1.00 `application_fee_amount` pattern. Building it alongside registration avoids duplicating payment logic later.

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/hotel/page.tsx`
Hotel management (admin):
- Create hotel blocks: hotel name, room types (single/double/suite), rates, block size, cutoff date
- View booking status per block (booked vs. available)
- Manage individual bookings (cancel, modify dates)

##### [NEW] `apps/web/src/app/(convention)/hotel/page.tsx`
Public hotel booking page (convention subdomain):
- Browse available hotel blocks and room types
- Select dates, room type
- Stripe Checkout with `application_fee_amount: 100` ($1.00 per booking)
- Confirmation email with booking details

##### [NEW] `apps/web/src/actions/hotel-actions.ts`
Server Actions: `createHotelBlock`, `updateHotelBlock`, `bookRoom`, `cancelBooking`.

---
