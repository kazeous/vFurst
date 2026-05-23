# Phase 3 Boundary Report

## Frontend Files Changed

- `src/app/events/[slug]/page.tsx`
- `src/features/public-events/public-event-client.tsx`
- `src/features/events/event-detail-client.tsx`

## Backend/API Files Changed

- `src/app/api/public/events/[slug]/route.ts`
- `src/app/api/public/events/[slug]/products/route.ts`
- `src/app/api/public/events/[slug]/registration-questions/route.ts`
- `src/app/api/public/events/[slug]/registrations/route.ts`
- `src/app/api/events/[eventId]/products/route.ts`
- `src/app/api/events/[eventId]/products/[productId]/route.ts`
- `src/app/api/events/[eventId]/registration-questions/route.ts`
- `src/app/api/events/[eventId]/registration-questions/[questionId]/route.ts`
- `src/app/api/orgs/[orgId]/events/route.ts`
- `src/app/api/events/[eventId]/route.ts`
- `src/server/products.ts`
- `src/server/rate-limit.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260523173500_phase_3_public_registration_products/migration.sql`

Added product, product image, product option, attendee profile, registration, registration question, and registration answer models. Event slugs are now globally unique for slug-based public URLs.

## Shared Files Changed

- `src/shared/products.ts`
- `src/shared/schemas/product.ts`
- `src/shared/schemas/registration.ts`

## Business Logic Added

- Public event reads for events that are not draft or archived.
- Admin product creation, update, and archive.
- Product visibility, archive state, availability window, stock, and age helper logic.
- Admin registration question creation, update, and delete.
- Public registration submission with attendee profile, selected registration product, and custom question answers.
- Basic in-memory public registration rate limiting.

## Auth/Permission Enforcement

- Admin product and registration question writes require `requireEventManager()`.
- Admin product and registration question reads require `requireEventMember()`.
- Public event/product/question APIs expose only public-safe event fields and active public products.
- Public registration does not trust frontend state; it reloads the event, product, product counts, and questions server-side.
- Registration submission requires event status `REGISTRATION_OPEN` or `LIVE`.
- Registration product stock and age checks are enforced server-side.

## Temporary Mocks or TODOs

- Product images use externally hosted URLs only. Direct uploads and S3-compatible file storage are intentionally deferred.
- Registrations do not create carts, orders, payments, paid status, confirmation emails, or badges.
- The public-form rate limiter is process-local for MVP development and should become shared storage before horizontal scaling.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npx prisma validate` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with temporary local environment values supplied in the shell.
- Browser verification passed for admin event setup, product creation, question creation, public event rendering, and public registration submission.
