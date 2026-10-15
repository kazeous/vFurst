# vFurst — Convention Management SaaS

A convention/event management platform (ConCat clone, plus VND/SePay capabilities ConCat lacks). Next.js 15 monorepo, Turborepo, PostgreSQL + Prisma, Stripe Connect + SePay.

## How this project is planned (plan v2, 2026-07-26)

The plan lives in `docs/plan/`, one file per concern so you never read it all at once:

- `docs/plan/00-reference.md` — durable contracts: product/access model, money, stack, data-model pointers. Read once per session alongside the active phase.
- `docs/plan/01-current-state.md` — what is implemented and verified (dated baseline).
- `docs/plan/02-concat-parity.md` — ConCat parity matrix; the backlog IDs (`REG-P*`, `STO-P*`, `EVD-P*`, `RAF-P1`) that phases 2–5 reference.
- `docs/plan/phase-1-stabilize.md` … `phase-6-launch.md` — the six phases.
- `docs/plan/phase-1b-identity.md` — identity re-platform, between phases 1 and 2.
- `docs/superpowers/specs/2026-10-13-identity-replatform-design.md` — authoritative Phase 1B design.
- `docs/plan/verification.md` — per-session and per-phase gates.
- `docs/launch/runtime-defect-audit-2026-07-26.md` — the active defect register consumed by Phase 1.

**Rule: read `PROGRESS.md`, then `00-reference.md`, then only the active phase file — in Phase 1B also the spec sections the active unit names. Open `01`/`02`/the audit only at the rows the phase file references. Do not read other phase files except to check a cross-phase dependency.**

The pre-2026-07-26 plan (phases 0–7) and its session history are in git history only. Do not resurrect them.

## Current status

Read `PROGRESS.md` before doing anything. It says which phase and unit is active. Don't trust this file or plan docs for "what's done" — `PROGRESS.md` and the repository are the only ground truth.

## Working rules

1. **One phase unit per session** (a numbered unit in the phase file, or one audit batch in Phase 1). Don't start the next unit just because there's room left.
2. **Verify before building.** Before creating anything, check whether it exists (`ls`, grep, file search). The plan is a spec, not a diff.
3. **If the plan contradicts the codebase, stop and flag it** — never guess or silently improvise.
4. **End every session by updating `PROGRESS.md`** — status, what's partial, and a concrete "next session should" line.
5. **Commit after each logical unit** with conventional messages; `git log` is the second source of truth.
6. **Run the gates in `docs/plan/verification.md`** for the session type; never record a pass claim from a focused run.
7. **Error-handling patterns are fixed:** expected user conditions return structured form state or redirect-with-code — never bare `throw`. Tenant-isolation and payment-safety throws in the audit's "Do not change" list stay as throws.
   Organizer/platform forms use `runActionWithState`; its centralized `unstable_rethrow` guard must remain ahead of expected-error mapping so Next redirects and framework control-flow are never swallowed.

## Environment files

Next.js only reads `.env*` from the application directory, and nothing in this
repository loads the repository-root file into a process. Each runtime therefore
owns its own file. Do not assume a value in the root file reaches an app.

| File | Tracked | Role |
|---|---|---|
| `.env.local` | Yes | Local development source of truth. Edit this one. |
| `.env.example` | Yes | Full documented template. |
| `.env` | No | Personal overrides; may hold real credentials. Shadowed by `.env.local` for the sync script. |
| `apps/web/.env.example`, `apps/worker/.env.example` | Yes | Each app's key contract; also the layout template for the generated file. |
| `apps/web/.env.local`, `apps/worker/.env` | No | **Generated.** Never edit by hand. |
| `packages/db/.env` | Yes | Prisma CLI default so `prisma validate` works standalone. |

`node scripts/sync-app-env.mjs` regenerates the per-app files from `.env.local`
and runs automatically on `npm run dev`. `node scripts/check-app-env.mjs <web|worker>`
validates the required set and runs from `predev`/`prestart` — never during
`next build`, so CI (which sets only `DATABASE_URL`) is unaffected. When adding a
variable, add it to the app's `.env.example`, to the root files, **and** to
`compose.prod.yaml`, or the sync or the deployment will not carry it;
`npm run compose:validate` fails until the deployment does. In `compose.prod.yaml`
only `SOURCE_COMMIT` and `NEXT_PUBLIC_*` may use `${VAR:?}`; everything else is
`${VAR:-}`, because Coolify builds with build-time variables only. `NEXT_PUBLIC_*` values are inlined at **build** time —
runtime-only injection does nothing in production builds.

Ports in local development: `apps/web` 3000. `apps/web` silently retries onto another port when 3000 is taken, while `AUTH_URL` keeps pointing at 3000.

## Commands

- `turbo run dev` — start all apps
- `turbo run build` / `type-check` / `lint` — repo-wide gates
- `cd packages/db && npx prisma validate` — validate schema
- `npm run test` / `npm run test:e2e` — unit/integration + E2E (`E2E_PRODUCTION=1` for production mode)
- `npm run env:sync` — regenerate per-app env files from `.env.local`
- `npm run compose:validate` — check `compose.prod.yaml` and its environment contract (needs Docker)
- `docker compose up -d` (local services from `docker-compose.yml`) + `npm run prestart --workspace @vfurst/web` (runs `npm run sync --workspace @vfurst/db`)

Deployment: the root `Dockerfile` and `compose.prod.yaml` define the single Coolify resource; see `docs/launch/staging-coolify-setup.md`. `docker-compose.yml` is local development only.
