# Phase 0 — Foundation & Planning (Weeks 1–3)

> **Goal**: Monorepo scaffold, database schema, CI/CD, dev environment, and architectural decisions locked in.

| Task | Files / Actions |
|------|----------------|
| Define MVP feature scope | This document ✅ |
| Database schema design | [NEW] `packages/db/prisma/schema.prisma` — all 29 entities from the Core Entities table, enums, indexes, row-level tenant isolation via `orgId`. **This includes all entities** (ApiKey, WebhookEndpoint, etc.) even if their management UI is built in a later phase — the schema is defined once upfront. JSON fields must conform to the JSON Field Contracts section above. |
| API contract design | [NEW] `docs/api-contracts/` — OpenAPI spec for REST endpoints + webhook event schemas |
| Set up monorepo | [NEW] `turbo.json`, root `package.json` with workspaces: `apps/*`, `packages/*` |
| CI/CD pipeline | [NEW] `.github/workflows/ci.yml` — lint, type-check, test, build on PR |
| | [NEW] `.github/workflows/deploy.yml` — Vercel preview + production deploys |
| Dev / staging / prod envs | [NEW] `.env.example`, `.env.local`, `.env.staging` — env var templates |
| Stripe Connect setup | Create Stripe Connect platform account, configure OAuth redirect URIs |
| Choose and configure hosting | Vercel project creation, Railway Redis instance, AWS S3 bucket |
| Initialize Next.js + Astryx | [NEW] `apps/web/` — Next.js 15 app with Astryx imports in `globals.css` |
| | [NEW] `apps/web/src/app/layout.tsx` — Root layout with `Theme` provider |
| | [NEW] `apps/web/src/components/providers.tsx` — Client providers wrapper |

---
