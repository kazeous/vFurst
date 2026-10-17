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
Leave the other services without domains. Since Phase 1B, every organization's
portal is served at `https://{subdomain}.vfurst.reyuugames.com`. Those hosts do
not go in this domain field: a Traefik dynamic configuration routes them to the
web container (§8).

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

**Staff identity (runtime only).** Staff sign in through the studio authentik
(`docs/launch/authentik-setup.md`). Enter `AUTH_AUTHENTIK_ISSUER=https://account.reyuugames.com/application/o/vfurst/`,
and `AUTH_AUTHENTIK_ID` / `AUTH_AUTHENTIK_SECRET` from the authentik provider page.
`VFURST_PLATFORM_ADMIN_GROUP` (default `vfurst-platform-admins`) and
`VFURST_STAFF_SESSION_MAX_AGE_SECONDS` (default `43200`, 12 hours) have Compose
defaults. Web refuses to start without the three `AUTH_AUTHENTIK_*` keys
(`[check-app-env]`). None of them is a build variable.

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

Identity and portal checks (Phase 1B; need an organization, for example one
provisioned from `/platform` with subdomain `smoke-1b`):

```bash
# 308 to the canonical portal host, keeping the query.
curl -sI "https://vfurst.reyuugames.com/smoke-1b/register?probe=1"

# 200 over the wildcard certificate.
curl -sI https://smoke-1b.vfurst.reyuugames.com/register
```

Then run the staff checklist in `docs/launch/authentik-setup.md` §5, and on the
portal host sign up with a real inbox, set a password, and register: the
`Set-Cookie` header shows `__Host-vfurst-portal` with `Secure`, `HttpOnly`, and
`SameSite=Lax`, and the sign-up server action succeeds behind the proxy.

## 7. Database reset

The Phase 1B schema drops columns and models, which the non-destructive
`sync` refuses on a populated database. For the one-time Phase 1B reset (unit
1B.5), in this order:

1. Apply the §3 staff identity keys and the §8 DNS/TLS setup.
2. Stop the resource.
3. Delete the `postgres_data` volume in Coolify's storage view.
4. Merge the Phase 1B pull request into `staging`. Auto Deploy runs `migrate`,
   which creates the current schema on the empty database.

Merging before step 3 makes `migrate` fail and leaves staging down. This
destroys staging data (test data only); do not add a data-loss flag to `sync`.

## 8. DNS and TLS for portal hosts

Portals live at `https://{subdomain}.vfurst.reyuugames.com`; the central host
stays `https://vfurst.reyuugames.com`. Reserved platform subdomains (`api`,
`app`, `console`, `manager`, `www`) never resolve to a portal.

**Chosen (2026-10-17): DNS-only wildcard with certificates from Coolify.**
Cloudflare Universal SSL does not cover a second-level wildcard, so the
`*.vfurst.reyuugames.com` record is **DNS only** (grey cloud) and TLS ends at
Coolify's Traefik. A wildcard certificate needs the Let's Encrypt **DNS-01**
challenge (HTTP-01 cannot issue wildcards), so the proxy gets a second
certificate resolver that only the portal router uses. The existing
`letsencrypt` resolver keeps HTTP-01 for every other application on the server.

1. **DNS record.** Cloudflare → `reyuugames.com` → DNS → Records → Add record:
   type `A`, name `*.vfurst`, the same IPv4 address as the `vfurst` record (add a
   matching `AAAA` if that record has one), proxy status **DNS only**.
2. **API token.** Cloudflare → My Profile → API Tokens → Create Token → Custom
   token. Permissions: *Zone · Zone · Read* and *Zone · DNS · Edit*. Zone
   resources: *Include · Specific zone · reyuugames.com*. Copy the token; it is
   shown once and goes only into the proxy configuration below.
3. **DNS-01 resolver.** Coolify → **Servers** → the server that runs vFurst →
   **Proxy** → **Configuration**. Note the Traefik image tag (`traefik:v3.x` or
   `v2.x`). In the `traefik` service, add the token under `environment:` (create
   the key if it is missing) and four flags at the end of `command:`. Leave the
   existing `letsencrypt` lines unchanged.

   ```yaml
       environment:
         - CF_DNS_API_TOKEN=<token from step 2>
       command:
         # …existing flags…
         - '--certificatesresolvers.letsencrypt-dns.acme.dnschallenge=true'
         - '--certificatesresolvers.letsencrypt-dns.acme.dnschallenge.provider=cloudflare'
         - '--certificatesresolvers.letsencrypt-dns.acme.dnschallenge.resolvers=1.1.1.1:53,1.0.0.1:53'
         - '--certificatesresolvers.letsencrypt-dns.acme.storage=/traefik/acme-dns.json'
   ```

   **Save**, then **Restart Proxy**. Every application on the server is
   unreachable for a few seconds. Edit only in this screen: Coolify overwrites
   direct edits to `/data/coolify/proxy/docker-compose.yml`.
4. **Web container name.** Open the vFurst staging resource → the `web` service
   (its logs or terminal show the container name, `web-<resource uuid>`).
5. **Portal router.** **Servers** → the server → **Proxy** → **Dynamic
   Configurations** → add `vfurst-portals.yaml`. For a Traefik v3 image:

   ```yaml
   http:
     routers:
       vfurst-portals:
         rule: 'HostRegexp(`^[a-z0-9-]+\.vfurst\.reyuugames\.com$`)'
         entryPoints:
           - https
         service: vfurst-portals
         tls:
           certResolver: letsencrypt-dns
           domains:
             - main: vfurst.reyuugames.com
               sans:
                 - '*.vfurst.reyuugames.com'
       vfurst-portals-http:
         rule: 'HostRegexp(`^[a-z0-9-]+\.vfurst\.reyuugames\.com$`)'
         entryPoints:
           - http
         middlewares:
           - vfurst-portals-https
         service: vfurst-portals
     middlewares:
       vfurst-portals-https:
         redirectScheme:
           scheme: https
     services:
       vfurst-portals:
         loadBalancer:
           servers:
             - url: 'http://web-<resource uuid>:3000'
   ```

   On a Traefik v2 image, write both rules as
   ``HostRegexp(`{subdomain:[a-z0-9-]+}.vfurst.reyuugames.com`)``. Traefik reads the
   file without a restart. The proxy reaches `web-<resource uuid>` over the
   resource network that Coolify attaches it to. If the resource is ever
   recreated, its uuid changes: update the `url`.
6. **Domain field.** The `web` service keeps only
   `https://vfurst.reyuugames.com:3000` (§2). The central host keeps its own
   HTTP-01 certificate; the apex in the wildcard certificate is harmless.
7. **Checks** (before the merge, the deployed build answers an unknown portal
   with its 404 page, which is the expected result):

   ```bash
   nslookup probe.vfurst.reyuugames.com 1.1.1.1
   curl -sI https://probe.vfurst.reyuugames.com/
   openssl s_client -connect probe.vfurst.reyuugames.com:443 -servername probe.vfurst.reyuugames.com </dev/null 2>/dev/null | openssl x509 -noout -issuer -ext subjectAltName
   ```

   Expected: the server's own IP (not a Cloudflare address); an HTTP status from
   vFurst with no TLS error; issuer Let's Encrypt and a SAN of
   `*.vfurst.reyuugames.com`. If the certificate is `TRAEFIK DEFAULT CERT`, read
   **Proxy** → **Logs** for `letsencrypt-dns` errors: a token without *Zone ·
   Read*, the wrong zone, or a resolver name typo.

Traefik terminates TLS for tenant hosts and forwards `x-forwarded-proto: https`,
which makes vFurst issue the `__Host-vfurst-portal` cookie with `Secure`. If
the central `vfurst.reyuugames.com` record stays **proxied**, set Cloudflare's
SSL/TLS mode to **Full (strict)**, so the origin also sees HTTPS.

Custom domains stay as before: each one is verified and activated from
`/platform`, and its certificate is issued per host.

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
