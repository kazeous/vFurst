# Coolify Compose deployment and arm64 CI gate — design

> **Status:** design approved in conversation on 2026-10-13 (sections 1–4); this written spec awaits review.
> **Placement:** out-of-phase infrastructure work. It does not advance Phase 1B; the next Phase 1B unit stays 1B.2.
> **Branch:** `chore/coolify-compose-deploy`, cut from `origin/staging` (`97bc517`), merged to `staging` on its own.

## 1. Intent

Staging runs as four separate Coolify resources: `postgresql-vfur`, `redis-vfur`, `v-furst:staging-web` and `v-furst:staging-worker`. Web and worker are built and deployed independently, so a commit that breaks one of them leaves the other on the new revision while the broken one stays on the old revision. The user wants the pawket model: one Coolify resource whose containers are built from one commit, and a GitHub check that builds the production images natively on arm64.

**Success means:**

- Coolify has exactly one vFurst staging resource (Docker Compose build pack) containing `postgres`, `redis`, `migrate`, `web` and `worker`.
- Every deployment builds web, worker and migrate from the same commit, in one build on the host.
- Schema synchronization runs automatically on every deployment, before web or worker start.
- A pull request into `staging` cannot be merged unless the existing CI checks and a native `linux/arm64` build of all three images pass.
- Nothing is pushed to GHCR, nothing is emulated with QEMU, and no Coolify API token or deploy webhook is stored in GitHub.

## 2. Decisions

| # | Decision |
|---|---|
| C1 | One Coolify resource with the Docker Compose build pack, source `compose.prod.yaml` on branch `staging`. PostgreSQL and Redis move into it. |
| C2 | One root `Dockerfile` with shared `deps`/`build` stages and three final targets: `web`, `worker`, `migrate`. `docker/web.Dockerfile` and `docker/worker.Dockerfile` are deleted. |
| C3 | The GitHub `ubuntu-24.04-arm` runner only verifies the build (`--output type=cacheonly`). It pushes nothing. Coolify still builds on the host. |
| C4 | Coolify deploys through its GitHub App with **Auto Deploy** on `staging`. GitHub holds no Coolify token or webhook; `staging-deploy.yml` is deleted from `staging` **and** `main`. |
| C5 | The CI gate moves to merge time: a GitHub ruleset on `staging` requires a pull request and both CI checks. |
| C6 | Existing staging data is test data (identity spec §5.6), so the new PostgreSQL and Redis start empty. Nothing is dumped or restored. The four old resources are deleted after cutover. |
| C7 | Object storage (S3) and SMTP stay external. MinIO, Mailpit and the mock OIDC server are local development only. |
| C8 | Sentry source-map upload is not configured in this change: `SENTRY_AUTH_TOKEN` is never a build argument. Runtime Sentry DSNs keep working. |
| C9 | No YAML anchors in `compose.prod.yaml`. Coolify parses and rewrites the file, and the explicit per-service form is the one already proven on this Coolify host by pawket. A contract check (§6.2) keeps the duplicated web and worker environments complete. |

**Accepted trade-offs:**

- **Downtime on every deployment.** Coolify does not roll Compose deployments. Pawket recorded that Coolify removes old containers before starting new ones. A failed `migrate` or a failed start leaves staging down until a fix or a redeploy of the previous commit. Build failures do not cause downtime, and C5 stops most of them before merge.
- **No Coolify-managed database backups.** The built-in backup feature belongs to standalone database resources. Staging holds test data. Production backup is added to `docs/launch/go-live-checklist.md` as an open go-live item; it is not designed here.
- **Ungated direct pushes.** Anyone allowed to bypass the ruleset can still push straight to `staging`, and that push deploys without a gate.

## 3. Current state (verified on `staging`, 2026-10-13)

- `.github/workflows/ci.yml` runs one `verify` job on `ubuntu-latest`. `.github/workflows/staging-deploy.yml` is triggered by `workflow_run`, calls two Coolify deploy hooks with `COOLIFY_API_TOKEN` and polls the deployment API.
- Coolify builds `docker/web.Dockerfile` and `docker/worker.Dockerfile` natively on the Oracle Ampere A1 host (PR #7/#8, 2026-07-28). Each Dockerfile runs its own `npm ci` and builds the shared packages again.
- The GHCR packages `vfurst/web` and `vfurst/worker` were last produced by PR #5/#6 and have not been updated since PR #7.
- The web image does **not** run the schema chain. `apps/web` `prestart` runs `check-app-env web`, `prepare:payment-attempt-locks`, `push`, `backfill:managed-tenancy` and `backfill:payment-attempt-locks`, but the image's command runs only `check-app-env web` and `server.js`. The runbook asks the operator to run the chain by hand. The identity spec (§13) already assumes the deployed environment runs it.
- Health endpoints: web `GET /api/healthz` checks PostgreSQL and Redis and reports `COOLIFY_GIT_COMMIT_SHA`. The worker serves its health on `WORKER_HEALTH_PORT` and returns 200 only when every BullMQ worker is running.
- The worker treats empty strings as unset for optional variables (`emptyStringToUndefined` in `apps/worker/src/env.ts`).
- `kazeous/vFurst` is public, so GitHub's arm64 hosted runners are free for it.

## 4. Target topology

### 4.1 Services in `compose.prod.yaml`

| Service | Image | Restart | Ports | Health |
|---|---|---|---|---|
| `postgres` | `postgres:16-bookworm`, `command: postgres -c max_connections=100` | `unless-stopped` | none | `pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"` |
| `redis` | `redis:7-bookworm`, `command: redis-server --appendonly yes` | `unless-stopped` | none | `redis-cli ping` |
| `migrate` | `vfurst-migrate:${SOURCE_COMMIT}`, target `migrate` | `"no"` | none | none; `exclude_from_hc: true` |
| `worker` | `vfurst-worker:${SOURCE_COMMIT}`, target `worker` | `unless-stopped` | `expose: 3100` | `GET http://127.0.0.1:3100/` through `node -e fetch(...)` |
| `web` | `vfurst-web:${SOURCE_COMMIT}`, target `web` | `unless-stopped` | `expose: 3000` | `GET http://127.0.0.1:3000/api/healthz` through `node -e fetch(...)` |

- Volumes: `postgres_data` at `/var/lib/postgresql/data`, `redis_data` at `/data`.
- No service publishes a host port. Only `web` gets a Coolify domain (`https://vfurst.reyuugames.com:3000`, meaning "proxy to container port 3000").
- `worker` and `web` use `stop_grace_period: 30s` so in-flight jobs and requests can drain.
- Every `image:` is tagged with `${SOURCE_COMMIT:?Enable "Include Source Commit in Build" in Coolify}`, so a deployment without the commit fails closed.

### 4.2 Startup order

```text
postgres (healthy) ─┐
redis (healthy) ────┼─> migrate (completed successfully) ─> worker
                    └──────────────────────────────────────> web
```

`worker` and `web` each declare `depends_on` with `postgres: service_healthy`, `redis: service_healthy` and `migrate: service_completed_successfully`. `migrate` depends on `postgres: service_healthy`.

### 4.3 Environment

- **Which keys each service gets:**
  - **Web:** every key in `apps/web/.env.example`, plus `S3_PUBLIC_URL`, minus the exclusions.
  - **Worker:** every key in `apps/worker/.env.example`, plus `S3_PUBLIC_URL`, minus the exclusions.
  - **Migrate:** `NODE_ENV`, `DATABASE_URL` and `DIRECT_DATABASE_URL` only.
- **Every key falls into exactly one class:**

| Class | Compose form | Keys |
|---|---|---|
| Derived | literal | `DATABASE_URL` and `DIRECT_DATABASE_URL` = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public` (each reference in its `:?` form); `REDIS_URL` = `redis://redis:6379` |
| Fixed | literal | `NODE_ENV=production` (all); web `PORT=3000`, `HOSTNAME=0.0.0.0`, `AUTH_TRUST_HOST=true`; worker `WORKER_HEALTH_PORT=3100` |
| Required | `${VAR:?Set VAR in Coolify}` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MANAGER_URL`, `NEXT_PUBLIC_CONSOLE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`; `AUTH_URL`, `AUTH_SECRET`; `EMAIL_DELIVERY_ENCRYPTION_KEY`; `S3_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Tunable | `${VAR:-<default>}`, with the default taken from the app's `.env.example` | `NEXT_PUBLIC_APP_NAME`; `VFURST_DB_CONNECTION_LIMIT`, `VFURST_DB_POOL_TIMEOUT_SECONDS`, `VFURST_DB_CONNECTION_BUDGET`, `VFURST_WEB_REPLICAS` (default **1**, not the example's 6), `VFURST_WORKER_REPLICAS`; `VFURST_RATE_LIMIT_PREFIX` and the five `VFURST_*_RATE_LIMIT_PER_MINUTE`; `CONTROL_PLANE_INVALIDATION_CHANNEL`; `SEPAY_ENV`; `WORKER_STARTUP_TIMEOUT_MS`; the four Sentry sample rates (`NEXT_PUBLIC_SENTRY_*_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`) |
| Optional | `${VAR:-}` | `S3_ENDPOINT`, `S3_PUBLIC_URL`; `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`; `SALES_CONTACT_EMAIL`; `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`; `SEPAY_WEBHOOK_SECRET`, `SEPAY_API_TOKEN`; `CHECKOUT_TOKEN_SECRET`; `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Excluded | absent | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (build-time only, C8); `VFURST_LAUNCH_URL` (an operator-tool input that the runtime does not read) |

- The operator keeps one set of PostgreSQL credentials. `POSTGRES_PASSWORD` must be URL-safe, so the runbook generates it with `openssl rand -hex 32`.
- The required set is a superset of what `scripts/check-app-env.mjs` and `apps/worker/src/env.ts` require. It also includes the public URLs and `AUTH_URL`, because their `.env.example` defaults point at `localhost` and are wrong in any deployment.
- A key that appears in both services uses the same class in both.

## 5. Image build

### 5.1 `Dockerfile` stages

| Stage | From | Content |
|---|---|---|
| `base` | `node:24-bookworm-slim` | `ca-certificates`, `openssl` (unchanged from today) |
| `deps` | `base` | Copy `package.json`, `package-lock.json`, `turbo.json` and the `package.json` of `apps/web`, `apps/worker`, `packages/auth`, `packages/contracts`, `packages/db`, `packages/email`, `packages/tenant-context`; run `npm ci --no-audit --fund=false` once |
| `build` | `base` | Declare `ARG SOURCE_COMMIT=unknown` and one `ARG` per public build variable (§5.2); set `ENV NEXT_TELEMETRY_DISABLED=1` and `ENV COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}`; copy `node_modules` and `packages` from `deps`, then the source; build `@vfurst/contracts`, `@vfurst/email`, `@vfurst/db`, `@vfurst/web`, `@vfurst/worker` in one `RUN` |
| `web` | `base` | Today's web runner, unchanged in content: standalone bundle, `node_modules/@img`, `.next/static`, `public`, `apps/web/package.json`, `scripts/check-app-env.mjs`, `scripts/lib/env-file.mjs`; user `nextjs` (uid 1001); command `node scripts/check-app-env.mjs web && exec node apps/web/server.js` |
| `worker` | `base` | Today's worker runner, unchanged in content: `apps/worker/dist`, `apps/worker/package.json`, `packages`, `node_modules`; user `worker` (uid 1001); command `node apps/worker/dist/index.js` |
| `migrate` | `base` | Root `package.json`, `node_modules`, `packages/db` (schema, scripts, built output); non-root user; command `npm run sync --workspace @vfurst/db` |

- Each final stage also declares `ARG SOURCE_COMMIT=unknown` and sets `ENV COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}`, so `/api/healthz` and the Sentry release keep reporting the commit.
- Health checks live in `compose.prod.yaml`, not in the `Dockerfile`, so there is one definition.
- `apps/docs`, `apps/platform-manager` and `apps/tenant-web` are not copied. The last two are removed by Phase 1B anyway.
- The worker image is not slimmed in this change.

### 5.2 Public build variables

The `build` stage declares these as `ARG` only. Docker exposes `ARG` values to `RUN` as environment variables, and `next build` inlines them. They are not persisted as `ENV`.

`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MANAGER_URL`, `NEXT_PUBLIC_CONSOLE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`.

- `compose.prod.yaml` passes them to all three services' `build.args` (the shared `build` stage must be identical for all three targets, or BuildKit builds it more than once). It passes `SOURCE_COMMIT` the same way.
- The design does not rely on Coolify injecting `ARG` lines; that is a Dockerfile build pack feature.
- In Coolify each of these is still marked **Build Variable**, and the runtime-relevant ones are also passed in the web environment (`check-app-env` requires `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_ROOT_DOMAIN` at runtime).
- `build.args` use the same class as the §4.3 table: the four public URLs and the root domain use `:?`, `NEXT_PUBLIC_APP_NAME` and the sample rates default to the `apps/web/.env.example` values, and `NEXT_PUBLIC_SENTRY_DSN` defaults to empty. An absent sample rate is therefore never inlined as an empty string.

### 5.3 One definition of the schema chain

- `packages/db/package.json` gains `"sync": "npm run prepare:payment-attempt-locks && npm run push && npm run backfill:managed-tenancy && npm run backfill:payment-attempt-locks"`.
- `apps/web/package.json` `prestart` becomes `node ../../scripts/check-app-env.mjs web && npm run sync --workspace @vfurst/db`. Local behavior is unchanged.
- The chain stays non-destructive. `push` is `prisma db push --skip-generate` without `--accept-data-loss`, as identity spec §5.6 requires. A destructive schema difference makes `migrate` exit non-zero and the deployment stops before web and worker start.

### 5.4 `.dockerignore`

Add `docs`, `apps/docs`, `tests`, `.superpowers`, `.hallmark`, `.backups` and `PROGRESS.md` to the existing list. `**/.env` stays excluded, so `packages/db/.env` (local Prisma default) never enters an image.

## 6. Continuous integration

### 6.1 `.github/workflows/ci.yml`

- Triggers stay: `pull_request`, and `push` to `main` and `staging`.
- Add `permissions: contents: read` and `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

| Job | `name:` (the required-check name) | Runner | Steps |
|---|---|---|---|
| `verify` | `Lint, type-check, test, and build` (unchanged) | `ubuntu-24.04` | Today's steps, plus `npm run test:compose` and `npm run compose:validate` |
| `arm64-images` | `Production images (linux/arm64)` | `ubuntu-24.04-arm` | Checkout; `docker/setup-buildx-action`; three `docker buildx build --platform linux/arm64 --target <web/worker/migrate> --build-arg SOURCE_COMMIT=${{ github.sha }} --output type=cacheonly .` |

- The three `arm64-images` builds share the buildx builder's cache inside the job, so `deps` and `build` run once.
- There is no deploy job.
- `.github/workflows/staging-deploy.yml` is deleted.

### 6.2 `scripts/validate-compose.mjs`

Strict Docker Compose rejects Coolify's `exclude_from_hc` key, so the file cannot be validated directly. The script exports pure functions and has a small CLI:

- `projectForDocker(source)` removes the single `exclude_from_hc: true` line. It throws unless there is exactly one marker and it belongs to the `migrate` service.
- `placeholderEnvironment(source)` returns a placeholder value for every `${VAR:?…}` in the source.
- `checkEnvironmentContract(config, contracts)` takes the JSON from `docker compose config --format json` and the key lists parsed from `apps/web/.env.example` and `apps/worker/.env.example`. It returns every missing key per service, applying the §4.3 additions and exclusions.
- CLI, default mode: project the file, run `docker compose -f - config --format json` with the placeholder environment on stdin, and run the contract check. Exit non-zero on any error. Nothing is written to disk.
- CLI, `--print`: write the projected YAML to stdout for the local stack smoke (§9).
- Root scripts: `"compose:validate": "node scripts/validate-compose.mjs"` and `"test:compose": "node --test scripts/validate-compose.test.mjs"`.
- Unit tests cover:
  - marker removal;
  - zero, duplicate and misplaced markers;
  - placeholder extraction;
  - a missing web key, a missing worker key, and an excluded key that must not be reported.

The contract check is what keeps later environment changes honest. When Phase 1B adds `AUTH_AUTHENTIK_*` to `apps/web/.env.example`, CI fails until `compose.prod.yaml` carries them too.

### 6.3 Ruleset on `staging` (manual, GitHub settings)

- Target: branch `staging`.
- Rules:
  - require a pull request before merging;
  - require status checks `Lint, type-check, test, and build` and `Production images (linux/arm64)`;
  - block force pushes and deletion.
- Bypass: the user decides. The runbook states the consequence of a bypass (§2).

## 7. Cutover (manual; the runbook carries the click-by-click steps)

1. **Remove the old trigger from `main`.** Merge a pull request into `main` that only deletes `.github/workflows/staging-deploy.yml`. Until this lands, every green `staging` CI run calls the old hooks.
2. **Merge this branch into `staging`** through a pull request with both checks green. The old resources have Auto Deploy off, so the merge deploys nothing.
3. **Create the resource.** In project VFur, environment `production`, add an application:
   - Source: the Coolify GitHub App, repository `kazeous/vFurst`, branch `staging`.
   - Build pack: Docker Compose, base directory `/`, compose file `/compose.prod.yaml`.
   - Enable **Include Source Commit in Build**.
   - Keep Auto Deploy **off** for now, and keep preview deployments off.
4. **Enter the environment:**
   - `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD` from `openssl rand -hex 32`.
   - The `NEXT_PUBLIC_*` values, marked Build Variable.
   - Runtime secrets copied from the old web and worker resources. A newly generated `EMAIL_DELIVERY_ENCRYPTION_KEY` is acceptable because the database starts empty.
5. **Move the domain.** Remove `vfurst.reyuugames.com` from `v-furst:staging-web`, then set `https://vfurst.reyuugames.com:3000` on the new resource's `web` service.
6. **Deploy once by hand and check:**
   - `migrate` exited 0;
   - `worker` and `web` are healthy;
   - `curl -fsS https://vfurst.reyuugames.com/api/healthz` returns 200 with the `staging` HEAD commit;
   - `/api/v1/events` returns 401;
   - `/` returns 200.
7. **Switch over.** Turn Auto Deploy on. Stop, then delete, `v-furst:staging-web`, `v-furst:staging-worker`, `redis-vfur` and `postgresql-vfur`. The deletion is irreversible; the data is test data (C6).
8. **Clean up:**
   - delete the GitHub secrets `COOLIFY_API_TOKEN`, `COOLIFY_WEBHOOK_URL_WEB`, `COOLIFY_WEBHOOK_URL_WORKER` and, if present, `GHCR_TOKEN`;
   - revoke the Coolify API token;
   - delete the GHCR packages `vfurst/web` and `vfurst/worker`;
   - create the §6.3 ruleset.

### 7.1 Database reset (used by Phase 1B unit 1B.5)

Stop the resource, delete the `postgres_data` volume in Coolify's storage view, and deploy. `migrate` then creates the current schema on an empty database. No data-loss flag is ever added to `sync`.

## 8. Documentation

- `docs/launch/staging-coolify-setup.md` is rewritten for the Compose resource. It covers:
  - the GitHub App source;
  - environment entry, split into build variables, runtime secrets and tunables;
  - the domain and port syntax;
  - the cutover in §7 and the database reset in §7.1;
  - the ruleset;
  - smoke checks and troubleshooting: a missing `SOURCE_COMMIT`, a failed `migrate`, a `[check-app-env]` exit, an unhealthy worker, and a public variable that is not marked Build Variable.
- `docs/launch/go-live-checklist.md` gains an open item: a production PostgreSQL backup and restore drill, because the Compose topology has no Coolify-managed backups.
- `AGENTS.md`:
  - distinguish `docker-compose.yml` (local services) from `compose.prod.yaml` and `Dockerfile` (deployment);
  - add `npm run compose:validate` to Commands;
  - extend the environment rule: a new variable goes into the app's `.env.example`, the root files, **and** `compose.prod.yaml`.
- `docs/plan/verification.md`: when `Dockerfile`, `compose.prod.yaml`, `.dockerignore` or `scripts/validate-compose.mjs` change, the session gate adds `npm run test:compose` and `npm run compose:validate`.
- `PROGRESS.md` gets a session entry at closeout.
- The branch must end with no reference to `docker/web.Dockerfile`, `docker/worker.Dockerfile`, `staging-deploy`, `COOLIFY_WEBHOOK` or `COOLIFY_API_TOKEN`. Historical `PROGRESS.md` entries are exempt.

## 9. Verification

Run by the executor:

1. **Baseline.** Before any change, run `npm ci` and the serial gate `npx turbo run type-check lint test build --concurrency=1`, and record the counts.
2. `npm run test:compose` and `npm run compose:validate` pass.
3. **Each target builds locally** for the host platform (amd64): `docker buildx build --target web .`, the same for `worker` and `migrate`.
4. **Local stack smoke:**
   - Command: `node scripts/validate-compose.mjs --print | docker compose -p vfurst-compose-smoke -f - --env-file <scratch env file> up -d --build`.
   - Test environment: the scratch env file holds synthetic values only. S3 and SMTP point at unreachable placeholders, which `/api/healthz` does not probe.
   - Assertions:
     - `migrate` exited 0;
     - `postgres`, `redis`, `worker` and `web` are healthy;
     - `docker compose exec web node -e "fetch('http://127.0.0.1:3000/api/healthz')…"` returns 200 with the commit set in the env file;
     - the database has the Prisma tables.
   - Rerun `up` with the same commit and confirm that `migrate` again exits 0, which proves the chain is idempotent.
   - Finish with `down -v`. No host port is published, so this cannot collide with the pawket containers on 5432/6379.
5. **Full gate.** The full serial gate passes again, because `prestart` and `packages/db/package.json` changed.
6. **The user verifies after pushing:**
   - both CI jobs are green on the pull request, including the native arm64 run;
   - the cutover checks in §7 step 6.

## 10. Relationship to Phase 1B

- This branch merges to `staging` independently. `feat/identity-replatform` should merge `staging` at the start of its next unit, so that later environment additions (1B.2's portal settings, 1B.4's `AUTH_AUTHENTIK_*`) are caught by the contract check. Expect a `PROGRESS.md` conflict; resolve it by keeping both entries.
- Identity spec §11.1's environment-variable table gains an implied third destination, `compose.prod.yaml`. The AGENTS.md rule in §8 makes this explicit. The identity spec itself is not edited here.
- 1B.5's deployed database reset uses §7.1. The wildcard domain `*.vfurst.reyuugames.com` from identity spec §11.4 is attached to the same `web` service when 1B.5 runs.

## 11. Risks

| # | Risk | Mitigation |
|---|---|---|
| K1 | Coolify's Compose parser mishandles `exclude_from_hc`, `${VAR:?…}` or `build.target` | All three are in use by pawket on the same Coolify host. The first manual deploy (§7 step 6) is the check. |
| K2 | Three targets built concurrently on the host duplicate the `build` stage and exhaust memory | Identical `build.args` keep the shared stages identical, so BuildKit can reuse them; pawket builds three targets of one `Dockerfile` on the same host. The user reads the first deployment's build log. If the stage ran more than once, record it as a follow-up; the deployment still works, only slower. |
| K3 | Web code reads an optional variable with `??`, so an empty string from `${VAR:-}` behaves differently from unset | The executor greps `apps/web/src` and `packages/*/src` for `process.env.<optional key> ??` and reports any hit before choosing defaults. The local stack smoke boots web with the optional keys empty. |
| K4 | `migrate` fails on a destructive schema change and staging stays down | Intended fail-closed behavior. 1B.5 uses §7.1 deliberately. |
| K5 | The repository becomes private and `ubuntu-24.04-arm` stops being free | Out of scope. The job would then need a paid runner or removal. |
| K6 | `staging-deploy.yml` lingers on `main` and fires failing runs | §7 step 1 comes first in the runbook. |

## 12. Out of scope

- Pushing images to any registry, and image signing.
- Zero-downtime Compose deployments and automatic rollback.
- Production environment, backups, WAL archiving.
- Sentry source-map upload.
- Slimming the worker image.
- Running MinIO, Mailpit or the mock OIDC server in deployment.
- Any Phase 1B change.
