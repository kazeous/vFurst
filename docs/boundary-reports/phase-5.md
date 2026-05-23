# Phase 5 Boundary Report

## Frontend Files Changed

- `src/features/public-events/public-event-client.tsx`
- `src/features/vendors/vendor-application-client.tsx`
- `src/app/events/[slug]/vendors/apply/page.tsx`
- `src/features/events/event-detail-client.tsx`

## Backend/API Files Changed

- `src/app/api/public/events/[slug]/vendor-applications/route.ts`
- `src/app/api/events/[eventId]/vendor-applications/route.ts`
- `src/app/api/events/[eventId]/vendor-applications/[applicationId]/route.ts`
- `src/app/api/orders/[orderId]/manual-payment/route.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/server/vendors.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260524100000_phase_5_vendor_applications/migration.sql`

Added `VendorApplication`, `VendorAmenity`, `VendorAssistant`, `VendorSeatingPreference`, and `VendorApplicationStatus`.

## Shared Files Changed

- `src/shared/vendors.ts`
- `src/shared/schemas/vendor.ts`
- `README.md`
- `docs/architecture.md`

## Business Logic Added

- Signed-in vendor applicants can submit applications for public, non-draft events while applications are open.
- Vendor application payloads capture business details, requested table product, amenities, assistant, seating preferences, and placement notes.
- Event admins can list and review applications.
- Admin approval creates a server-priced unpaid order for the requested `VENDOR_TABLE` product.
- Vendor applications move from `APPROVED_UNPAID` to `APPROVED_PAID` only when the linked approved order is paid server-side.
- Admin review actions write audit log records.

## Auth/Permission Enforcement

- Public vendor application submission requires `requireSession()`.
- Public vendor application submission rate limits per event slug and client IP.
- Admin vendor application list and review require `requireEventManager()`.
- Approval order creation validates the requested product belongs to the same event and has category `VENDOR_TABLE`.
- Vendor `APPROVED_PAID` cannot be set through the review request schema; it is enforced by payment reconciliation in server routes.

## Temporary Mocks or TODOs

- Vendor application confirmation email is deferred to the email phase.
- Vendor dashboard and vendor self-service status page are deferred.
- Multiple assistants can be represented by the backend model, but the Phase 5 public form exposes one assistant row to keep the MVP focused.
- Vendor booth map placement and fulfillment are deferred.
- Public vendor application submission requires sign-in; unauthenticated applications are intentionally not supported in Phase 5.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma validate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with local Phase 5 environment variables.
- Browser verified public vendor application entry point, vendor form table selection, admin vendor queue, approval order creation, offline payment marking, and server-side `APPROVED_PAID` sync.
