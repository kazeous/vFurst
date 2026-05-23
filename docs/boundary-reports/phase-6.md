# Phase 6 Boundary Report

## Frontend Files Changed

- `src/features/public-events/public-event-client.tsx`
- `src/features/volunteers/volunteer-application-client.tsx`
- `src/app/events/[slug]/volunteers/apply/page.tsx`
- `src/features/events/event-detail-client.tsx`

## Backend/API Files Changed

- `src/app/api/public/events/[slug]/volunteer-applications/route.ts`
- `src/app/api/events/[eventId]/volunteer-applications/route.ts`
- `src/app/api/events/[eventId]/volunteer-applications/[applicationId]/route.ts`
- `src/app/api/events/[eventId]/volunteer-departments/route.ts`
- `src/app/api/events/[eventId]/volunteer-departments/[departmentId]/route.ts`
- `src/server/volunteers.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260524120000_phase_6_volunteer_management/migration.sql`

Added `VolunteerApplication`, `VolunteerDepartment`, `VolunteerAssignment`, `VolunteerApplicationStatus`, `VolunteerPreferredContactMethod`, and `VolunteerAssignmentState`.

## Shared Files Changed

- `src/shared/volunteers.ts`
- `src/shared/schemas/volunteer.ts`
- `README.md`
- `docs/architecture.md`

## Business Logic Added

- Public volunteer applications for events that are `REGISTRATION_OPEN` or `LIVE`.
- Server-side volunteer application validation and rate limiting.
- Event-admin volunteer department creation and updates.
- Optional volunteer department lead assignment from existing event or organization members.
- Event-admin volunteer application review.
- Volunteer assignment records by department with server-validated assignment states.
- Audit logs for volunteer department and volunteer application review actions.

## Auth/Permission Enforcement

- Public volunteer application submission is intentionally public, but rate-limited per event slug and client IP.
- Public volunteer submission only accepts non-draft, non-archived events and requires `REGISTRATION_OPEN` or `LIVE`.
- Volunteer department list/create/update requires `requireEventManager()`.
- Volunteer application list/review/assignment requires `requireEventManager()`.
- Department lead assignment is validated server-side against existing event or organization membership.
- Assignment departments are validated server-side to belong to the same event as the application.

## Temporary Mocks or TODOs

- Volunteer confirmation emails and mass department emails are deferred to the email phase.
- Volunteer shift scheduling is deferred.
- Volunteer check-in and badge/cashier flows are deferred.
- The public volunteer form captures free-text availability rather than structured shift availability slots.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma validate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with local Phase 6 environment variables.
- Browser verified public volunteer entry point, volunteer application form page, admin department list, volunteer application queue, assignment state update, and audit log display.
