# VFurst

VFurst is an original SaaS platform for event and convention management. This repository is currently through Phase 3: application foundation, Auth.js credential access, organizations, events, server-side RBAC checks, invites, audit logs, public event pages, registration products, and public registration submission.

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
- Public event pages for non-draft, non-archived events
- Admin registration tier/product setup
- Admin registration question setup
- Public registration submission with server-side event/product availability checks

Not implemented yet:

- Cart, orders, payments, or Stripe
- Vendor, volunteer, check-in, email, notes, or checklist features
- Cart/store checkout behavior
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
- Payment, entitlement, cart, order, vendor, volunteer, check-in, and email delivery logic are intentionally absent through Phase 3.

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
- Registrations do not create carts, orders, payments, invoices, or paid status in Phase 3.
