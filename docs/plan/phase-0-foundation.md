# Phase 0 — Foundation & Planning (Weeks 1–3)

> **Goal**: Monorepo scaffold, database schema, CI/CD, dev environment, and architectural decisions locked in.

| Task | Files / Actions |
|------|----------------|
| Define MVP feature scope | This document ✅ |
| Database schema design | [NEW] `packages/db/prisma/schema.prisma` — all 29 product/tenant entities from the reference table, enums, indexes, and tenant isolation via `orgId`. Auth.js persistence and provider-neutral payment/settlement models are supplemental infrastructure added when those systems are built; the maintained reference records the current 41-model total. JSON fields must conform to the JSON Field Contracts section above. |
| API contract design | [NEW] `docs/api-contracts/` — OpenAPI spec for REST endpoints + webhook event schemas |
| Set up monorepo | [NEW] `turbo.json`, root `package.json` with workspaces: `apps/*`, `packages/*` |
| CI/CD pipeline | [NEW] `.github/workflows/ci.yml` — lint, type-check, test, build on PR. Runs on GitHub's own runners, no cloud account needed beyond a GitHub repo. |
| | ~~`.github/workflows/deploy.yml`~~ — **deferred**. Not created until the project actually deploys (see "Deployment — deferred" note below). Building it now with no Vercel project to target just gives Claude Code a file it can't test. |
| Local dev environment | [NEW] `docker-compose.yml` — Postgres, Redis, MinIO (S3-compatible), Mailpit (SMTP catcher) as local containers. This is what Phase 0–7 actually run against — no cloud accounts required until deployment. See "Local Development" in `00-reference.md`. |
| Dev / staging / prod envs | [NEW] `.env.example`, `.env.local` — env var templates. `.env.staging` is deferred until a staging environment exists (post-Phase 7). |
| Stripe Connect setup | **Only a free Stripe account in test mode is needed — this is not a deployment step.** Test mode requires no business verification and works immediately. Connect onboarding (Account Links, not classic OAuth) accepts `http://localhost:3000/...` as a return URL in test mode, so the full Connect flow — including test connected accounts and `application_fee_amount` — can be built and verified entirely locally. Live-mode business verification is a go-live step for Phase 7+, not a Phase 0 blocker. |
| ~~Choose and configure hosting~~ | **Deferred.** Vercel, Railway, and real AWS S3/IAM are deployment-time decisions, not build-time ones. `next dev` / `turbo dev` plus the Docker Compose stack above replace all three during Phases 0–7. |
| Initialize Next.js + shadcn/ui | [NEW] `apps/web/` — Next.js 15 app with shadcn/ui imports in `globals.css` |
| | [NEW] `apps/web/src/app/layout.tsx` — Root layout with global CSS-token styling |
| | [NEW] `apps/web/src/components/providers.tsx` — Client providers wrapper |

> [!IMPORTANT]
> **Deployment (Vercel, Railway, real AWS S3/IAM, GitHub Actions deploy step) is intentionally out of scope for Phases 0–7.** Every phase builds and verifies against the local Docker Compose stack only. Deployment setup happens as its own step after Phase 7 is verified locally, when `.env.staging`/`.env.production`, `deploy.yml`, and the real cloud resources get created. Don't let Claude Code treat missing cloud accounts as a phase blocker — check `docker-compose.yml` is up and the local `.env` is filled in instead.

---
