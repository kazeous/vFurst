# VFurst

VFurst is an original SaaS platform for event and convention management. This repository is currently through Phase 8: application foundation, Auth.js credential access, organizations, events, server-side RBAC checks, invites, audit logs, public event pages, registration products, public registration submission, carts, orders, Stripe Checkout handoff, webhook reconciliation, offline payments, refund records, vendor applications, volunteer management, event-day check-in, and server-side email templates.

## Current Scope

Implemented through Phase 8:

- Next.js App Router scaffold
- TypeScript, Tailwind, and shadcn/ui-compatible structure
- Prisma schema for Auth.js user/session tables
- Server-only environment, database, and auth modules
- `GET /api/health`
- `GET /api/me`
- Protected dashboard shell
- Public event placeholder route
- Initial tests and architecture notes
- Credentials-based account registration and sign-in
- Organization create/read/update/list
- Organization members and invites
- Event create/read/update/list under organizations
- Event members and invites
- Invite acceptance
- Audit logs for organization/event/member/invite actions
- Public event pages for non-draft, non-archived events
- Admin registration tier/product setup
- Admin registration question setup
- Public registration submission with server-side event/product availability checks
- Authenticated event carts
- Server-priced order creation
- Stripe Checkout session creation and webhook reconciliation
- Admin-only offline mark-as-paid
- Admin refund record tracking
- Public signed-in vendor application submission
- Vendor amenities, assistants, and seating preference capture
- Event-admin vendor application review workflow
- Vendor approval order creation for vendor table products
- Server-side vendor approved-paid reconciliation when approved orders are paid
- Public volunteer application submission
- Volunteer departments with optional department leads
- Volunteer application review and assignment states
- Volunteer assignment audit logging
- Event-day registration lookup and express check-in
- Badge status and print-ready badge view
- Paid/unpaid indicator during check-in
- Cashier notes scoped to registration check-in records
- Staff-authorized manual payment marking from check-in
- Organization and event email template overrides
- Safe server-side email template preview rendering
- Server-side Resend delivery plumbing with email logs
- Invite email attempts with skipped logs when email is not configured

Not implemented yet:

- Global notes or checklist features
- Mass email workflows and email scheduling

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create an environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Update `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_URL`.

4. Start local Postgres with Docker:

   ```bash
   npm run db:start
   ```

5. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

6. Run migrations:

   ```bash
   npm run prisma:migrate
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## Boundary Rules

- Client components must not import from `src/server`.
- Secrets and database access are server-only.
- Frontend role or session displays are cosmetic only.
- Protected behavior must be enforced by backend helpers and route handlers.
- SaaS subscription entitlement logic is intentionally absent through Phase 8.
- Email rendering, delivery attempts, provider configuration, and delivery logs are server-side only.

## Phase 2 Auth Notes

- Account passwords are hashed server-side with Node `scrypt`.
- Auth.js credentials are used with JWT sessions.
- Organization and event permissions are enforced in route handlers through `src/server/rbac.ts`.
- Invite links are displayed in the admin UI only; actual invite email sending is a later email-system phase.

## Phase 3 Registration Notes

- Public event pages are available at `/events/[slug]` only when an event is not draft or archived.
- Public registration submission is allowed only when an event is `REGISTRATION_OPEN` or `LIVE`.
- Registration tiers are products with category `REGISTRATION`.
- Product availability, stock limits, archived state, visibility, and age restrictions are enforced server-side.
- Product images currently store externally hosted image URLs. Direct file uploads and S3-compatible storage are reserved for the storage phase.
- Public registrations still do not create carts, orders, payments, invoices, or paid status. Paid ticket registration will be connected in a later refinement after the order model is stable.

## Phase 4 Cart and Payment Notes

- Carts are authenticated and scoped by user/event.
- Order totals are calculated server-side from current product records.
- Stripe Checkout sessions are created server-side; the frontend receives only the Stripe-hosted checkout URL.
- Stripe webhook signatures are verified server-side using `STRIPE_WEBHOOK_SECRET`.
- Payment status is updated only by the webhook or admin-only offline payment API.
- Refunds are tracking records only in Phase 4; automated Stripe refund creation is deferred.
- Required Stripe env vars:

  ```bash
  STRIPE_SECRET_KEY="sk_test_replace_me"
  STRIPE_WEBHOOK_SECRET="whsec_replace_me"
  ```

## Phase 5 Vendor Application Notes

- Vendor applications are submitted from `/events/[slug]/vendors/apply`.
- Vendor application submission requires a signed-in user so later vendor approval orders have a server-owned account to bill.
- Event admins can review, approve, waitlist, or reject applications from the event dashboard.
- Approving an application creates an unpaid server-priced order for the requested `VENDOR_TABLE` product.
- `APPROVED_PAID` is not accepted from frontend review requests; it is set server-side when the approved order is paid by Stripe webhook or admin-only offline payment.

## Phase 6 Volunteer Management Notes

- Volunteer applications are submitted from `/events/[slug]/volunteers/apply`.
- Public volunteer applications are rate-limited and allowed only while an event is `REGISTRATION_OPEN` or `LIVE`.
- Event admins can create volunteer departments, optionally assign a department lead from existing team members, and review volunteer applicants from the event dashboard.
- Volunteer assignment states are server-validated: interested, previous experience, avoid, requested by lead, and assigned.
- Volunteer mass email, shift scheduling, and check-in workflows are deferred to later phases.

## Phase 7 Check-in and Cashier Notes

- Event check-in is available at `/dashboard/events/[eventId]/check-in`.
- Event admins and event staff can search registrations, use express mode, check attendees in, undo check-in, set badge status, and view print-ready badges.
- Check-in displays paid/unpaid state from server-side order/payment status. The frontend never decides whether an order is paid.
- Staff and admins can mark an existing unpaid order paid from check-in through the same server-side manual payment route.
- Cashier notes in Phase 7 are registration-scoped check-in notes only. The full user notes/restrictions system remains deferred.

## Phase 8 Email Template Notes

- Organization owners/admins and event admins can manage email template overrides from the dashboard.
- Template preview rendering happens through protected backend APIs using sample data.
- Email placeholders use safe `{{ path.to.value }}` replacement only; arbitrary code is never evaluated.
- Invite creation now triggers server-side email attempts and records `SENT`, `FAILED`, or `SKIPPED` logs.
- Configure email delivery with:

  ```bash
  RESEND_API_KEY="re_..."
  EMAIL_FROM="VFurst <noreply@example.com>"
  ```

- If email env vars are missing, delivery is skipped and logged. The frontend never sends mail or decides delivery status.
