# VFurst

VFurst is an original SaaS platform for event and convention management. This repository is currently at Phase 1: application foundation, server boundaries, Auth.js/Prisma scaffolding, and basic route protection.

## Current Scope

Implemented in Phase 1:

- Next.js App Router scaffold
- TypeScript, Tailwind, and shadcn/ui-compatible structure
- Prisma schema for Auth.js user/session tables
- Server-only environment, database, and auth modules
- `GET /api/health`
- `GET /api/me`
- Protected dashboard shell
- Public event placeholder route
- Initial tests and architecture notes

Not implemented yet:

- Organizations and events
- RBAC permissions
- Products, cart, orders, payments, or Stripe
- Vendor, volunteer, check-in, email, notes, or checklist features

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
- Payment, entitlement, RBAC, and event-domain logic are intentionally absent from Phase 1.
