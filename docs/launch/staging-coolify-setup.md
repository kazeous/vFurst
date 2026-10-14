# Staging deployment on Coolify

Staging runs as one Coolify resource using the Docker Compose build pack. The
Coolify GitHub App deploys `staging`; a GitHub branch ruleset gates merges. CI
builds the production images natively on arm64 to the cache only, while Coolify
builds deployed images on its host. There is no GHCR, API token, or webhook.

This replaced the earlier four-resource setup on 2026-10-14; the one-time
cutover steps are in git history and `PROGRESS.md`.

## 1. Topology

| Service | Image | Restart | Ports | Health |
|---|---|---|---|---|
| `postgres` | `postgres:16-bookworm`, `command: postgres -c max_connections=100` | `unless-stopped` | none | `pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"` |
| `redis` | `redis:7-bookworm`, `command: redis-server --appendonly yes` | `unless-stopped` | none | `redis-cli ping` |
| `migrate` | `vfurst-migrate:${SOURCE_COMMIT}`, target `migrate` | `"no"` | none | none; `exclude_from_hc: true` |
| `worker` | `vfurst-worker:${SOURCE_COMMIT}`, target `worker` | `unless-stopped` | `expose: 3100` | `GET http://127.0.0.1:3100/` through `node -e fetch(...)` |
| `web` | `vfurst-web:${SOURCE_COMMIT}`, target `web` | `unless-stopped` | `expose: 3000` | `GET http://127.0.0.1:3000/api/healthz` through `node -e fetch(...)` |

`postgres_data` persists at `/var/lib/postgresql/data` and `redis_data` at
`/data`. No service publishes a host port; only `web` gets a domain. `worker`
and `web` have a 30-second stop grace period.

```text
postgres (healthy) ──> migrate (completed successfully) ─┐
postgres (healthy) ────────────────────────────────────────┼─> worker and web
redis (healthy) ───────────────────────────────────────────┘
```

`migrate` waits for healthy PostgreSQL. Both `worker` and `web` wait for
healthy PostgreSQL and Redis **and** successful completion of `migrate`.

Coolify removes old containers before starting a Compose deployment, so
staging has downtime on every deployment. A failed build leaves the old stack
running; a failed migration or start leaves staging down until a fix or
redeployment of the previous commit. The Compose database has no
Coolify-managed backups. Staging holds test data; production PostgreSQL
backups and a restore drill are a [go-live item](go-live-checklist.md).

## 2. Create the Compose resource

| Setting | Value |
|---|---|
| Source | Coolify GitHub App |
| Repository | `kazeous/vFurst` |
| Branch | `staging` |
| Build pack | Docker Compose |
| Base directory | `/` |
| Docker Compose location | `/compose.prod.yaml` |
| Include Source Commit in Build | On |
| Auto Deploy | Off for the first manual deployment; on after smoke passes |
| Preview deployments | Off |

Set `https://vfurst.reyuugames.com:3000` on the **web** service. The `:3000`
means Coolify proxies to container port 3000; it does not publish a host port.
Leave the other services without domains.

## 3. Environment

Enter values in the Coolify resource environment. Shared web and worker keys
must have the same value.

**Build time versus runtime.** Tick **Available at Buildtime** only on the ten
`NEXT_PUBLIC_*` keys. Every other key, and every secret in particular, is
**runtime only**. Coolify writes the build-time keys into the build's env file
and also injects an `ARG` for each of them into every Dockerfile stage. A
secret left at build time therefore ends up in the image's build metadata, and
changing any build-time key reruns `npm ci` and the full build.
`compose.prod.yaml` follows the same rule: only `SOURCE_COMMIT` and
`NEXT_PUBLIC_*` use `${VAR:?}`, which fails the build when they are missing.
Runtime keys use `${VAR:-}`. When one of those is missing, the build still
succeeds and the container refuses to start: PostgreSQL without its password,
web through `[check-app-env]`, and the worker through
`WorkerConfigurationError`. `npm run compose:validate` rejects `${VAR:?}` on any
other key.

**Build variables.** Mark all ten `NEXT_PUBLIC_*` keys as **Build Variable**;
Next.js inlines them during the image build. The URL and root-domain values
also reach the web runtime, and `NEXT_PUBLIC_APP_URL` reaches the worker runtime.
The four public URLs and root-domain key are required; the rest have defaults in
`compose.prod.yaml`.

| Key | Suggested staging value or source |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | `vFurst` |
| `NEXT_PUBLIC_APP_URL` | `https://vfurst.reyuugames.com` |
| `NEXT_PUBLIC_MANAGER_URL` | `https://vfurst.reyuugames.com` |
| `NEXT_PUBLIC_CONSOLE_URL` | `https://vfurst.reyuugames.com` |
| `NEXT_PUBLIC_API_URL` | `https://vfurst.reyuugames.com/api` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `vfurst.reyuugames.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry public DSN, or empty |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Compose default or chosen rate |
| `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | Compose default or chosen rate |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | Compose default or chosen rate |

**Required runtime values.** Compose does not enforce these at build time, so
check that each one is set before deploying. Enter `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, `AUTH_URL`, `AUTH_SECRET`,
`EMAIL_DELIVERY_ENCRYPTION_KEY`, `S3_BUCKET_NAME`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Use
`AUTH_URL=https://vfurst.reyuugames.com`. Generate the URL-safe database
password with `openssl rand -hex 32`; generate `AUTH_SECRET` and the shared
email key independently with `openssl rand -base64 32`. Object storage and SMTP
are external services; take their values from the provider.

**Tunables and optional values.** See `compose.prod.yaml` for defaults and
empty optional values before overriding connection pools, replica counts,
rate limits, Sentry rates, Stripe/SePay, SMTP, or S3 endpoint settings.
`VFURST_WEB_REPLICAS=1` is the Compose default for staging.
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are excluded from
this deployment's build and runtime.

`DATABASE_URL`, `DIRECT_DATABASE_URL`, and `REDIS_URL` are derived in
`compose.prod.yaml`; **do not enter them** in Coolify. `NODE_ENV`, web port and
hostname, worker health port, and `AUTH_TRUST_HOST` are fixed there as well.

## 4. Branch ruleset

In GitHub repository settings, create a ruleset targeting `staging`. Require
a pull request before merging and these exact status check names:

- `Lint, type-check, test, and build`
- `Production images (linux/arm64)`

Block force pushes and deletion. The user decides who may bypass the ruleset;
a direct push by a bypass actor can deploy to staging without the CI gate.

## 5. Deploy flow

Merge a pull request into `staging` after both checks pass. The GitHub App
notifies Coolify, where Auto Deploy starts one build of the `web`, `worker`,
and `migrate` targets from the same source commit. PostgreSQL and Redis become
healthy, then `migrate` runs `npm run sync --workspace @vfurst/db`. Once it
exits successfully, `worker` and `web` start; they also require healthy
PostgreSQL and Redis.

If the image build fails, the old stack keeps running. Once Coolify replaces
the containers, a non-zero `migrate` exit prevents web and worker from
starting; staging stays down until a corrected deployment or a redeploy of
the previous commit succeeds.

## 6. Smoke

Confirm `migrate` exited 0 and both application services are healthy. Then:

```bash
# 200 with PostgreSQL and Redis healthy, and the deployed source commit.
curl -fsS https://vfurst.reyuugames.com/api/healthz

# 401 because this public API endpoint requires an API key.
curl -i https://vfurst.reyuugames.com/api/v1/events

# 200 with HTML.
curl -fsS https://vfurst.reyuugames.com/ | head -n 5
```

Compare the commit in `/api/healthz` and the Coolify deployment log with the
successful `staging` HEAD CI SHA. Do not mark the deployment complete if they
differ.

## 7. Database reset

For the planned Phase 1B unit 1B.5 staging reset, stop the resource, delete
the `postgres_data` volume in Coolify's storage view, then deploy. `migrate`
creates the current schema on the empty database. This destroys staging data;
do not add a data-loss flag to `sync`.

## Troubleshooting

- **Missing `SOURCE_COMMIT`:** Enable **Include Source Commit in Build** on
  the resource, then redeploy.
- **Build fails with `required variable … is missing a value`:** A
  `NEXT_PUBLIC_*` key is missing or is not ticked **Available at Buildtime**.
  If the named key is not `NEXT_PUBLIC_*` or `SOURCE_COMMIT`,
  `compose.prod.yaml` is using `${VAR:?}` where it should use `${VAR:-}`. Fix
  the file, not the Coolify setting.
- **`postgres` unhealthy right after the first deploy:** `POSTGRES_PASSWORD`,
  `POSTGRES_USER`, or `POSTGRES_DB` is empty at runtime. Set it, delete the
  `postgres_data` volume if it was created empty, and redeploy.
- **`migrate` exited non-zero:** Read the `migrate` container log. If Prisma
  refuses a destructive schema change, review the change and the backup or
  migration procedure; do not add `--accept-data-loss` to `sync`.
- **`[check-app-env]` exit:** Read the named missing web runtime variable in
  the log, set it in Coolify, and redeploy.
- **Worker unhealthy:** Check its log for startup, database, and Redis errors;
  confirm its health endpoint on port 3100 before redeploying.
- **Wrong public value in the browser:** Mark its `NEXT_PUBLIC_*` key as a
  **Build Variable** and rebuild so Next.js inlines the corrected value.
- **Cloudflare `Flexible` SSL redirect loop:** Follow the SSL mode guidance in [go-live-checklist.md](go-live-checklist.md).
