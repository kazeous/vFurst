# VFurst

VFurst is an original SaaS platform for event and convention management. This repository is currently through Phase 2: application foundation, Auth.js credential access, organizations, events, server-side RBAC checks, invites, and audit logs.

## Current Scope

Implemented through Phase 2:

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

Not implemented yet:

- Products, cart, orders, payments, or Stripe
- Vendor, volunteer, check-in, email, notes, or checklist features
- Public registration/store behavior
- Email delivery for invites

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

4. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

5. Run migrations once migrations are created:

   ```bash
   npm run prisma:migrate
   ```

6. Start the app:

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
- Payment, entitlement, product, registration, vendor, volunteer, check-in, and email delivery logic are intentionally absent through Phase 2.

## Phase 2 Auth Notes

- Account passwords are hashed server-side with Node `scrypt`.
- Auth.js credentials are used with JWT sessions.
- Organization and event permissions are enforced in route handlers through `src/server/rbac.ts`.
- Invite links are displayed in the admin UI only; actual invite email sending is a later email-system phase.
