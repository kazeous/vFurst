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

The app still intentionally does not include cart, order, payment, email delivery, vendor, volunteer, check-in, notes, checklist, or fulfillment business logic.
