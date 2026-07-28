# Staging deployment on Coolify

This runbook takes a green `staging` CI run to the web application at
**https://vfurst.reyuugames.com** and its background worker. Coolify clones the
repository and builds the two Dockerfiles natively; GitHub Actions does not
build images and GHCR is not part of this deployment path.

## 0. Security recovery

- Revoke any Coolify API token that has appeared in chat, an issue, a log, or a
  screenshot. Treat it as compromised even if it was only visible briefly.
- Create the replacement token from a user in the **same Coolify team** as both
  staging resources. It needs the `deploy` ability; add `read` only if it is
  also used for read-only API diagnostics.
- Store the raw token only. Do not include `Bearer ` in the secret value.
- Prefer an IP allowlist when the caller has stable egress. GitHub-hosted
  runners do not have one small stable IP, so `Anywhere` may be necessary for
  this workflow; in that case keep the token deploy-only and rotate it.

## 1. GitHub secrets

In **Settings -> Secrets and variables -> Actions**, configure exactly these
repository secrets:

| Secret | Value |
|---|---|
| `COOLIFY_API_TOKEN` | Raw Coolify API token, without quotes or a `Bearer ` prefix |
| `COOLIFY_WEBHOOK_URL_WEB` | Web resource Deploy Hook, including `/api/v1/deploy?uuid=...&force=false` |
| `COOLIFY_WEBHOOK_URL_WORKER` | Worker resource Deploy Hook, including `/api/v1/deploy?uuid=...&force=false` |

Delete the obsolete `GHCR_TOKEN` secret after confirming no other workflow in
the repository uses it. Do not paste secret values into Actions variables or
commit them to this file.

The `workflow_run` trigger only works when
`.github/workflows/staging-deploy.yml` exists on the repository's **default
branch**. Merge the workflow there even though the application source branch
being deployed is `staging`.

## 2. Shared infrastructure

Provision PostgreSQL, Redis, and S3-compatible object storage as Coolify
resources or as externally managed services. Put them on a network reachable
from both applications. Do not use `localhost` in an application connection
URL unless that service actually runs inside the same container.

Before the first application deploy, synchronize the database from a trusted
checkout that can reach PostgreSQL:

```bash
export DATABASE_URL='postgresql://<user>:<password>@<host>:5432/vfurst?schema=public'
export DIRECT_DATABASE_URL="$DATABASE_URL"
npm run prepare:payment-attempt-locks --workspace @vfurst/db
npm run push --workspace @vfurst/db
npm run backfill:managed-tenancy --workspace @vfurst/db
npm run backfill:payment-attempt-locks --workspace @vfurst/db
```

The standalone web image validates configuration before starting, but it does
not run schema changes. Run the same database chain before a release that
changes the Prisma schema or its backfills.

## 3. Coolify web application

Create an **Application** from the repository through a Coolify GitHub App or a
deploy key with read access to the private repository.

| Setting | Value |
|---|---|
| Branch | `staging` |
| Build pack | `Dockerfile` |
| Base directory | `/` |
| Dockerfile location | `/docker/web.Dockerfile` |
| Port exposes | `3000` |
| Domain | `https://vfurst.reyuugames.com` |
| Health check | `GET /api/healthz`, expected `200` |
| Auto deploy | Off; the gated GitHub workflow is the deploy trigger |

In **Advanced**, leave **Inject Build Args to Dockerfile** enabled. Enable
**Include Source Commit in Build** so Coolify passes `SOURCE_COMMIT`; the image
uses it as `COOLIFY_GIT_COMMIT_SHA` for health metadata and Sentry releases.

### Web build variables

These values are public by design and are inlined by Next.js. Mark every one as
both **Build Variable** and **Runtime Variable**. A runtime-only value is too
late and leaves the previously built value in the browser bundle.

```env
NEXT_PUBLIC_APP_NAME=vFurst
NEXT_PUBLIC_APP_URL=https://vfurst.reyuugames.com
NEXT_PUBLIC_MANAGER_URL=https://vfurst.reyuugames.com
NEXT_PUBLIC_CONSOLE_URL=https://vfurst.reyuugames.com
NEXT_PUBLIC_API_URL=https://vfurst.reyuugames.com/api
NEXT_PUBLIC_ROOT_DOMAIN=reyuugames.com
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.02
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

If Sentry source-map upload is enabled, `SENTRY_ORG` and `SENTRY_PROJECT` are
build variables and `SENTRY_AUTH_TOKEN` is a build secret. Do not expose the
auth token as `NEXT_PUBLIC_*` or leave it in image metadata.

### Web runtime variables

Mark backend credentials **Runtime Variable only**. The following is the
minimum startup contract plus the staging connection budget:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

DATABASE_URL=postgresql://<user>:<password>@<host>:5432/vfurst?schema=public
DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/vfurst?schema=public
VFURST_DB_CONNECTION_LIMIT=4
VFURST_DB_POOL_TIMEOUT_SECONDS=20
VFURST_DB_CONNECTION_BUDGET=80
VFURST_WEB_REPLICAS=1
VFURST_WORKER_REPLICAS=1

REDIS_URL=redis://<host>:6379
EMAIL_DELIVERY_ENCRYPTION_KEY=<base64-encoded-32-byte-key>

S3_BUCKET_NAME=<bucket>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
S3_ENDPOINT=<only-for-S3-compatible-services-such-as-MinIO>
S3_PUBLIC_URL=<optional-public-asset-base-url>

AUTH_URL=https://vfurst.reyuugames.com
AUTH_SECRET=<random-secret>
AUTH_TRUST_HOST=true
CHECKOUT_TOKEN_SECRET=<random-secret>
```

The email encryption key must be generated as 32 bytes encoded in canonical
base64, for example `openssl rand -base64 32`, and must match the worker.
Payment, SMTP, rate-limit, and monitoring values remain part of the production
contract; copy the applicable keys from `apps/web/.env.example` rather than
inventing alternate names such as `NEXTAUTH_URL` or `NEXTAUTH_SECRET`.

Save the environment, deploy once manually, then generate/copy the web Deploy
Hook into `COOLIFY_WEBHOOK_URL_WEB`.

## 4. Coolify worker application

Create a second Application from the same repository.

| Setting | Value |
|---|---|
| Branch | `staging` |
| Build pack | `Dockerfile` |
| Base directory | `/` |
| Dockerfile location | `/docker/worker.Dockerfile` |
| Port exposes | `3100` |
| Domain | None |
| Health check | `GET /` on port `3100`, expected `200` |
| Auto deploy | Off; the gated GitHub workflow is the deploy trigger |

Leave **Inject Build Args to Dockerfile** enabled and enable **Include Source
Commit in Build** here as well. Configure these as **Runtime Variable only**:

```env
NODE_ENV=production
WORKER_HEALTH_PORT=3100

DATABASE_URL=postgresql://<user>:<password>@<host>:5432/vfurst?schema=public
DIRECT_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/vfurst?schema=public
VFURST_DB_CONNECTION_LIMIT=4
VFURST_DB_POOL_TIMEOUT_SECONDS=20

REDIS_URL=redis://<host>:6379
CONTROL_PLANE_INVALIDATION_CHANNEL=vfurst:control-plane:invalidations
EMAIL_DELIVERY_ENCRYPTION_KEY=<same-value-as-web>

S3_BUCKET_NAME=<same-bucket-as-web>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
S3_ENDPOINT=<only-for-S3-compatible-services-such-as-MinIO>
NEXT_PUBLIC_APP_URL=https://vfurst.reyuugames.com
```

Add the SMTP and SePay keys from `apps/worker/.env.example` when those jobs are
enabled. The worker validates its required environment at import time and exits
with a precise `WorkerConfigurationError` when a required key is missing.

Deploy once manually and confirm the health endpoint and queue startup in the
logs. Then put its generated hook in `COOLIFY_WEBHOOK_URL_WORKER`.

## 5. Gated deploy flow

Push to `staging` and wait for the `CI` workflow to pass. `Staging deploy` then
runs web and worker as independent matrix jobs, so one failure does not prevent
the other hook from being attempted.

Each call is `POST <deploy-hook>` with
`Authorization: Bearer <COOLIFY_API_TOKEN>`. The hook's `uuid` selects the
resource; Coolify deploys the branch configured on that resource. The workflow
records the CI SHA as trace evidence but does not claim that the API pins that
SHA.

Retry behavior is deliberate:

- `401` or `403`: fail immediately; fix the token, team membership, ability, or
  API access policy.
- Other non-retryable `4xx`: fail immediately and show the response body.
- Network failures, `408`, `425`, `429`, and `5xx`: retry up to three times.

For a manual retry, run the workflow from the `staging` ref in the GitHub UI.
Do not call the production hook while testing this staging path.

## 6. End-to-end smoke

After both applications are healthy:

```bash
# 200 when PostgreSQL and Redis are reachable; never 404.
curl -fsS https://vfurst.reyuugames.com/api/healthz

# 400 because the public API rate-limit probe has no API key.
curl -i https://vfurst.reyuugames.com/api/v1/events

# 200 with HTML.
curl -fsS https://vfurst.reyuugames.com/ | head -n 5
```

Also inspect the Coolify deployment log and verify its source commit matches the
successful `staging` CI SHA before declaring the deploy complete.

## Troubleshooting

- **Webhook `401`**: token is absent, malformed, revoked, or stored with an
  extra `Bearer ` prefix/quotes. Replace `COOLIFY_API_TOKEN` with the raw token.
- **Webhook `403`**: the token was accepted but lacks deploy access to the
  resource's team, or the API access policy rejected the runner. Retrying the
  same request will not help.
- **Webhook `404`/`422`**: regenerate the Deploy Hook and confirm the resource
  UUID. Do not hand-edit the UUID or use a legacy `token=` hook.
- **Build has the wrong public URL/domain**: the affected `NEXT_PUBLIC_*` key
  was not enabled as a Build Variable. Correct the flag and rebuild.
- **Web exits before listening**: read the `[check-app-env]` output and add the
  named runtime variable. The image intentionally fails fast on incomplete
  production configuration.
- **Worker health check fails**: set `WORKER_HEALTH_PORT=3100`, then resolve any
  Redis/database error reported before the health server starts.
- **`ECONNREFUSED` for PostgreSQL, Redis, or S3**: use the reachable Coolify
  service hostname/shared-network alias, not the application container's
  loopback address.
