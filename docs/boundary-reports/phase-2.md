# Phase 2 Boundary Report

## Frontend Files Changed

- `src/app/auth/sign-in/page.tsx`
- `src/app/auth/sign-up/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/orgs/[orgId]/page.tsx`
- `src/app/dashboard/events/[eventId]/page.tsx`
- `src/app/invites/[token]/page.tsx`
- `src/features/auth/sign-in-form.tsx`
- `src/features/auth/sign-up-form.tsx`
- `src/features/organizations/dashboard-client.tsx`
- `src/features/organizations/organization-detail-client.tsx`
- `src/features/events/event-detail-client.tsx`
- `src/features/invites/invite-accept-client.tsx`

## Backend/API Files Changed

- `src/app/api/auth/register/route.ts`
- `src/app/api/orgs/route.ts`
- `src/app/api/orgs/[orgId]/route.ts`
- `src/app/api/orgs/[orgId]/members/route.ts`
- `src/app/api/orgs/[orgId]/members/[memberId]/route.ts`
- `src/app/api/orgs/[orgId]/invites/route.ts`
- `src/app/api/orgs/[orgId]/invites/[inviteId]/route.ts`
- `src/app/api/orgs/[orgId]/events/route.ts`
- `src/app/api/orgs/[orgId]/audit/route.ts`
- `src/app/api/events/[eventId]/route.ts`
- `src/app/api/events/[eventId]/members/route.ts`
- `src/app/api/events/[eventId]/members/[memberId]/route.ts`
- `src/app/api/events/[eventId]/invites/route.ts`
- `src/app/api/events/[eventId]/invites/[inviteId]/route.ts`
- `src/app/api/events/[eventId]/audit/route.ts`
- `src/app/api/invites/[token]/accept/route.ts`
- `src/server/auth/config.ts`
- `src/server/auth/session.ts`
- `src/server/http.ts`
- `src/server/password.ts`
- `src/server/rbac.ts`
- `src/server/audit.ts`
- `src/server/invites.ts`
- `src/server/slug.ts`
- `src/server/pagination.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260523172500_phase_1_2_init/migration.sql`
- `prisma/migrations/migration_lock.toml`

Added `passwordHash`, organization/event membership models, invite models, event metadata, role/status enums, and `AuditLog`.

## Shared Files Changed

- `src/shared/rbac.ts`
- `src/shared/schemas/auth.ts`
- `src/shared/schemas/organization.ts`
- `src/shared/schemas/event.ts`
- `src/shared/schemas/query.ts`
- `src/types/next-auth.d.ts`

## Business Logic Added

- Server-side account registration and credential verification.
- Organization creation with creator assigned as `OWNER`.
- Organization member list, role update, removal, and invite revoke.
- Event creation under organizations with creator assigned `EVENT_ADMIN`.
- Event member list, role update, removal, and invite revoke.
- Organization and event invite acceptance by matching signed-in email.
- Audit logs for create/update/member/invite actions.

## Auth/Permission Enforcement

- All organization, event, invite, and audit APIs call `requireSession()`.
- Organization reads require `requireOrganizationMember()`.
- Organization writes, invites, member changes, event creation, and organization audit reads require `requireOrganizationManager()`.
- Organization owner role cannot be modified or removed in Phase 2.
- Event reads require `requireEventMember()` or organization membership.
- Event writes, event invites, event member changes, and event audit reads require `requireEventManager()` or organization admin/owner membership.
- Invite acceptance verifies the signed-in account email matches the invite email.

## Temporary Mocks or TODOs

- No payment, product, registration, vendor, volunteer, check-in, email-template, or checklist behavior was added.
- Invite email delivery is not implemented yet; admins can copy invite links from the UI until the email phase.
- No self-service organization subscription/billing behavior exists.

## Verification

- `npm run prisma:generate` passed after stopping the dev server that was locking Prisma's generated Windows DLL.
- `npx prisma validate` passed with a temporary local `DATABASE_URL`.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with temporary local environment values supplied in the shell.
- Playwright was not rerun in Phase 2 because no new end-to-end test was added; the existing dashboard redirect behavior is still covered by the route protection and build checks.
