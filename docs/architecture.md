# Architecture

VFurst uses a modular monolith built on Next.js App Router.

## Boundaries

- `src/app` contains pages, layouts, and route handlers.
- `src/server` contains server-only modules for environment variables, database access, auth, authorization, payments, email, storage, audit logging, and future business services.
- `src/shared` contains schemas, constants, and types safe for both frontend and backend.
- `prisma` contains database schema, migrations, and seed code.

Client components must never import from `src/server`. Server-side route handlers and server components are responsible for enforcing protected behavior.

## Phase 1 Limits

Phase 1 establishes infrastructure only. It intentionally does not include organization, event, RBAC, payment, email, vendor, volunteer, check-in, notes, checklist, or dashboard business logic.
