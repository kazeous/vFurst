# vFurst — Convention Management SaaS

A convention/event management platform (ConCat clone). Next.js 15 monorepo, Turborepo, PostgreSQL + Prisma, Stripe Connect.

## How this project is planned

The full build plan lives in `docs/plan/`, split into one file per phase so you never need to read it all at once:

- `docs/plan/00-reference.md` — tech stack, data model (ER diagram + all 29 entities), JSON field schemas, project structure. Read this once per session alongside whichever phase you're on.
- `docs/plan/phase-0-foundation.md` through `phase-7-launch.md` — one file per build phase.
- `docs/plan/verification-and-timeline.md` — the per-phase verification checklist.

**Rule: only read the phase file for the phase you are currently building, plus `00-reference.md`. Do not read other phase files unless you're checking a cross-phase dependency (e.g. confirming an entity or action file created in an earlier phase actually exists).**

## Current status

Read `PROGRESS.md` before doing anything. It says which phase is active and what's already built. Don't trust this AGENTS.md file or the plan docs for "what's done" — they describe intent, not reality. `PROGRESS.md` and the actual repo contents are the only ground truth for what exists.

## Working rules

1. **One phase per session (or one sub-section of a phase if it's large).** Don't start the next phase in the same session just because there's room left.
2. **Verify before building.** Before creating a file the plan says is `[NEW]`, check if it already exists (`ls`, `grep`, or your file search tool). The plan is a spec, not a diff — if a previous session already built something, building it again will overwrite or duplicate it.
3. **If the plan contradicts the actual codebase, stop and flag it** rather than guessing which one is right or silently improvising a fix.
4. **End every session by updating `PROGRESS.md`** — even if the phase isn't finished. Note what's done, what's partial, and what the next session should do first.
5. **Commit after each logical unit of work** (e.g. after a working feature, not after every file). Use conventional commit messages. This makes `git log` a reliable second source of truth if `PROGRESS.md` ever falls out of sync.
6. **Run the phase's verification checklist** (see `docs/plan/verification-and-timeline.md`) before marking a phase complete in `PROGRESS.md`.

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
| `apps/platform-manager/.env.example`, `apps/tenant-web/.env.example` | Yes | Split-runtime contracts; `dev:split` injects values itself. |

`node scripts/sync-app-env.mjs` regenerates the per-app files from `.env.local`
and runs automatically on `npm run dev`. `node scripts/check-app-env.mjs <web|worker>`
validates the required set and runs from `predev`/`prestart` — never during
`next build`, so CI (which sets only `DATABASE_URL`) is unaffected. When adding a
variable, add it to the app's `.env.example` **and** to the root files, or the
sync will not carry it.

Ports in local development: `apps/web` 3000, split runtimes 3200/3201 behind the
edge proxy on 3100. Keep those ranges disjoint — `apps/web` silently retries onto
another port when 3000 is taken, while `AUTH_URL` keeps pointing at 3000.

## Commands

- `turbo run dev` — start all apps
- `turbo run build` — full build check
- `turbo run type-check` — type check across monorepo
- `turbo run lint` — lint across monorepo
- `cd packages/db && npx prisma validate` — validate schema
- `npm run test` / `npm run test:e2e` — unit/integration + E2E tests
- `npm run env:sync` — regenerate per-app env files from `.env.local`
