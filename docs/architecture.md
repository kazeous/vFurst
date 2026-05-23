# Architecture

VFurst uses a modular monolith built on Next.js App Router.

## Boundaries

- `src/app` contains pages, layouts, and route handlers.
- `src/server` contains server-only modules for environment variables, database access, auth, authorization, payments, email, storage, audit logging, and future business services.
- `src/shared` contains schemas, constants, and types safe for both frontend and backend.
- `prisma` contains database schema, migrations, and seed code.

Client components must never import from `src/server`. Server-side route handlers and server components are responsible for enforcing protected behavior.

## Phase 1 Limits

Phase 1 established infrastructure only.

Phase 2 adds account registration/sign-in, organizations, events, org/event memberships, invites, and audit logs. All protected actions are enforced in backend route handlers through `src/server/rbac.ts`; frontend role displays are only cosmetic.

Phase 3 adds public event pages, registration-tier products, product images by URL, registration questions, attendee profiles, and public registration submission. Public submission is validated by backend route handlers; frontend validation is only cosmetic.

Phase 4 adds authenticated carts, server-priced order creation, Stripe Checkout handoff, Stripe webhook reconciliation, admin-only offline payment marking, and refund records. Frontend code never accepts or mutates payment status directly.

Phase 5 adds signed-in public vendor applications, vendor amenities, assistants, seating preferences, admin review, and server-side vendor approval order creation for `VENDOR_TABLE` products. Vendor paid state is reconciled only by backend payment paths.

Phase 6 adds public volunteer applications, volunteer departments with optional leads, and admin-managed volunteer assignment states. Volunteer email and shift scheduling remain outside the phase.

Phase 7 adds event-day check-in and cashier mode. Registration lookup, checked-in state, badge status, badge print views, cashier notes, paid/unpaid indicators, and staff-authorized manual payment actions are enforced through backend APIs.

Phase 8 adds organization/event email template overrides, safe server-side preview rendering, Resend delivery plumbing, and delivery logs. Invite email attempts are triggered by backend invite routes; missing provider configuration records skipped logs instead of faking delivery.

The app still intentionally does not include global notes/restrictions, checklist, mass email scheduling, or fulfillment business logic.
