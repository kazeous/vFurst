# Staging deployment on Coolify

This runbook walks you from a green CI on `staging` to a live site at
**https://vfurst.reyuugames.com**. Follow it in order; each step lists the
expected outcome so you can stop on failure.

## 0. Prereqs (one-time)

- A Coolify host with the Traefik service installed. You should be able to
  reach `http://<coolify-host>:8000` and log in.
- A DNS provider you control for `reyuugames.com`.
- A GitHub personal access token (PAT) with `write:packages` scope. Coolify
  needs this to pull from GHCR.

## 1. GitHub secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Required | Purpose |
|--------|----------|---------|
| `GHCR_TOKEN` | yes | PAT with `write:packages`. The `staging-deploy.yml` workflow uses it to push images. |
| `COOLIFY_WEBHOOK_URL_WEB` | yes | Coolify "Deploy Hook" for the web app. |
| `COOLIFY_WEBHOOK_URL_WORKER` | yes | Coolify "Deploy Hook" for the worker app. |

`GITHUB_TOKEN` is provided automatically and is *not* enough on its own to
push to GHCR — use the PAT.

## 2. DNS

Add an `A` (or `CNAME`) record:

| Name | Type | Value |
|------|------|-------|
| `vfurst.reyuugames.com` | A | `<Coolify host public IP>` |

Propagation can take up to 5 minutes. Verify with `dig vfurst.reyuugames.com`.

## 3. Coolify: registry

Open **Coolify → Registries → Add**:

- Registry URL: `ghcr.io`
- Username: your GitHub username (`kazeous`)
- Token: the same PAT you put in `GHCR_TOKEN`. (`write:packages` is sufficient
  for pull; push from GitHub Actions uses its own credentials.)

Coolify writes a registry credential into the host's `~/.docker/config.json`,
which is what its Traefik-managed containers use.

## 4. Coolify: web application

Create a **Docker Image** type app:

1. **Source**
   - Image name: `ghcr.io/kazeous/vfurst/web:staging-latest`
2. **Port**: `3000`
3. **Domain**: `vfurst.reyuugames.com` (Coolify will create the Traefik label)
4. **Health check**: `GET /api/healthz`, expected `200`
5. **Persistent storage**: leave empty (no volumes).
6. **Resources**: start with `0.5 vCPU`, `512 MB RAM`. Raise after smoke.
7. **Env vars** (set as runtime env, not build-time):

   ```env
   NODE_ENV=production
   PORT=3000
   HOSTNAME=0.0.0.0
   NEXT_PUBLIC_APP_NAME=vFurst
   NEXT_PUBLIC_APP_URL=https://vfurst.reyuugames.com
   NEXT_PUBLIC_MANAGER_URL=https://vfurst.reyuugames.com
   NEXT_PUBLIC_CONSOLE_URL=https://vfurst.reyuugames.com
   NEXT_PUBLIC_API_URL=https://vfurst.reyuugames.com/api
   NEXT_PUBLIC_ROOT_DOMAIN=reyuugames.com

   DATABASE_URL=postgresql://<user>:<pw>@<host>:5432/vfurst?schema=public
   DIRECT_DATABASE_URL=postgresql://<user>:<pw>@<host>:5432/vfurst?schema=public
   REDIS_URL=redis://<host>:6379

   NEXTAUTH_URL=https://vfurst.reyuugames.com
   NEXTAUTH_SECRET=<generate with openssl rand -base64 32>
   AUTH_SECRET=<generate with openssl rand -base64 32>

   SENTRY_ORG=<your org slug>
   SENTRY_PROJECT=vfurst-web
   SENTRY_AUTH_TOKEN=<Sentry token if you wire this up>
   ```

8. **Deploy Hook**: click *Generate*. Coolify prints a URL like
   `https://coolify.example/api/v1/deploy?uuid=…`. Copy it into the
   `COOLIFY_WEBHOOK_URL_WEB` GitHub secret.

Click **Deploy**. The first pull takes a few minutes (image is ~150 MB). The
container should reach `Running` and `/api/healthz` should answer `200`.

## 5. Coolify: worker application

Repeat with `ghcr.io/kazeous/vfurst/worker:staging-latest`:

- **Port**: `3100` (Coolify will expose it internally; you do not need to
  publish it on the public domain).
- **Domain**: none.
- **Health check**: `GET /` on port 3100, expected `200` (worker exposes a
  minimal `/` route via `WORKER_HEALTH_PORT=3100`).
- **Env vars**:

  ```env
  NODE_ENV=production
  WORKER_HEALTH_PORT=3100
  REDIS_URL=redis://<host>:6379
  DATABASE_URL=postgresql://<user>:<pw>@<host>:5432/vfurst?schema=public
  DIRECT_DATABASE_URL=postgresql://<user>:<pw>@<host>:5432/vfurst?schema=public
  CONTROL_PLANE_INVALIDATION_CHANNEL=vfurst-control-plane
  ```

- **Deploy Hook**: generate, copy into `COOLIFY_WEBHOOK_URL_WORKER`.

Deploy once manually to confirm the worker boots without errors in the logs.

## 6. Database

If you do not have a Postgres instance yet, install one on the Coolify host:

```bash
docker run -d --name vfurst-postgres \
  -e POSTGRES_USER=vfurst \
  -e POSTGRES_PASSWORD=<random> \
  -e POSTGRES_DB=vfurst \
  -v vfurst-pgdata:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16
```

Then run the schema migration from your local machine:

```bash
DATABASE_URL=postgresql://vfurst:<pw>@<host>:5432/vfurst?schema=public \
DIRECT_DATABASE_URL=$DATABASE_URL \
npm run db:push --workspace @vfurst/db
```

Redis:

```bash
docker run -d --name vfurst-redis \
  -v vfurst-redisdata:/data \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine
```

## 7. End-to-end smoke

After both apps are `Running`:

```bash
# Should return 200 (or 503 if DB/Redis unreachable, never 404).
curl -fsS https://vfurst.reyuugames.com/api/healthz

# Should return 400 (the rate-limit probe expects an API key).
curl -i https://vfurst.reyuugames.com/api/v1/events

# Should return 200 with HTML.
curl -fsS https://vfurst.reyuugames.com/ | head -n 5
```

If the host probe shows `200/200/200/400`, staging is live.

## 8. Triggering the next deploy

Push to `staging`. The `staging-deploy.yml` workflow runs on
`workflow_run: completed` from the `CI` workflow, so it picks up the same
SHA that just passed CI. To re-trigger without a code change, run
`workflow_dispatch` from the GitHub UI.

## Troubleshooting

- **`/api/healthz` returns 503**: open the web container logs. The most
  common cause is a `DATABASE_URL` that points at the Docker host's
  `localhost` (where Postgres is not listening). Use the host's internal IP
  or a shared Docker network.
- **`ECONNREFUSED 127.0.0.1:6379` in worker logs**: same as above; point
  `REDIS_URL` at the Coolify host's LAN address.
- **Prisma `libssl/openssl` warning**: this is harmless because the image
  bundles OpenSSL. If you see actual Prisma errors, double-check that the
  `DATABASE_URL` uses TLS-compatible Postgres (or disable TLS intentionally).
