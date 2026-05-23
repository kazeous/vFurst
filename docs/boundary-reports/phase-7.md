# Phase 7 Boundary Report

## Frontend Files Changed

- `src/features/events/event-detail-client.tsx`
- `src/features/check-in/check-in-client.tsx`
- `src/features/check-in/badge-print-client.tsx`
- `src/app/dashboard/events/[eventId]/check-in/page.tsx`
- `src/app/dashboard/events/[eventId]/check-in/badges/[registrationId]/page.tsx`

## Backend/API Files Changed

- `src/app/api/events/[eventId]/check-in/route.ts`
- `src/app/api/events/[eventId]/check-in/registrations/[registrationId]/route.ts`
- `src/app/api/orders/[orderId]/manual-payment/route.ts`
- `src/server/check-in.ts`
- `src/server/rbac.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260524140000_phase_7_check_in_cashier/migration.sql`

Added `BadgeStatus`, registration `checkedInAt`, `checkedInByUserId`, `badgeStatus`, and registration-scoped `cashierNote`.

## Shared Files Changed

- `src/shared/check-in.ts`
- `src/shared/schemas/check-in.ts`
- `README.md`
- `docs/architecture.md`

## Business Logic Added

- Event-day registration lookup by registration id, attendee name, email, or tier.
- Standard and express check-in result sizes.
- Registration check-in and check-in reversal.
- Badge status updates and print-ready badge page.
- Cashier notes scoped to a registration.
- Paid/unpaid display using server-side order status only.
- Staff/admin manual payment marking for existing unpaid orders.
- Audit logs for check-in, check-in reversal, and check-in updates.

## Auth/Permission Enforcement

- Check-in lookup requires `requireEventOperator()`.
- Check-in updates require `requireEventOperator()`.
- `requireEventOperator()` allows organization owners/admins, event admins, and event staff; viewers are denied.
- Manual mark-as-paid now uses `requireEventOperator()` so authorized staff can operate cashier mode.
- Registration updates verify the registration belongs to the event before mutation.
- Badge print view reads through the protected check-in API.

## Temporary Mocks or TODOs

- QR scanning is represented by registration id lookup in Phase 7; camera scanning is deferred.
- Cashier notes are registration-scoped only; global user notes, restrictions, and bans remain deferred.
- Paid public registration from Phase 3 is still not connected to registration orders, so unpaid/unknown state is surfaced honestly.
- Badge printing is browser print view only; printer integration and badge layout templates are deferred.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma validate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with local Phase 7 environment variables.
- Browser verified check-in page access, cashier note display, check-in action, badge status transition to `PRINT_READY`, and badge print view.
