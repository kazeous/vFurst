# Phase 7 Performance And Load Test

## Targets

- 500 concurrent public registration visitors.
- 50 concurrent staff check-in visitors.
- HTTP failure rate below 1%.
- 95th percentile page response time below 1.5 seconds on a properly provisioned launch stack.

## Script

Run the one-command full launch proof:

```bash
npm run test:load:launch
```

The launch proof runner:

- Loads `.env` and `.env.local`.
- Builds the web app unless `VFURST_SKIP_BUILD=1` is set.
- Seeds 1500 confirmed registrations unless `VFURST_LOAD_SEED_REGISTRATIONS` is set.
- Starts a temporary local production Next launch stack unless `VFURST_SKIP_LOCAL_SERVER=1` is set.
- Uses the configured `VFURST_WEB_REPLICAS` (six by default) behind a local round-robin proxy. Replica sizing is part of the measured launch topology, not an unlimited scale-up knob on one host.
- Applies the Prisma runtime pool policy, verifies replica demand stays within `VFURST_DB_CONNECTION_BUDGET`, and queries Postgres capacity through `DIRECT_DATABASE_URL` before build/seed work begins.
- Runs the full k6 profile with 500 registration VUs and 50 check-in VUs.
- Stops the temporary production server before exiting.

Manual debugging flow:

Seed launch-sized local data:

```bash
npm run seed:load
```

This prints `VFURST_*` environment variables for the seeded organization, event, and staff account.
When the runner falls back to Docker, loopback `VFURST_BASE_URL` values such as `http://127.0.0.1:3000` are translated to `http://host.docker.internal:3000` for the container.

Run a quick script/runtime smoke:

```bash
npm run test:load:smoke
```

The smoke profile uses 2 registration VUs, 1 check-in VU, and a relaxed p95 duration threshold under 10 seconds so local development cold compiles do not mask connectivity or rendering failures.

Run the full launch target:

```bash
npm run test:load
```

Useful environment variables:

```bash
VFURST_BASE_URL=http://127.0.0.1:3000
VFURST_LOAD_ORG_SLUG=your-org-slug
VFURST_LOAD_EVENT_ID=event-uuid
VFURST_STAFF_COOKIE="authjs.session-token=..."
VFURST_STAFF_EMAIL=load-admin@example.com
VFURST_STAFF_PASSWORD=LoadPass123!
VFURST_HOST_HEADER=localhost:3000
VFURST_REGISTRATION_VUS=500
VFURST_CHECKIN_VUS=50
VFURST_LOAD_SERVER_REPLICAS=6
VFURST_LOAD_PROFILE=full
VFURST_LOAD_SEED_REGISTRATIONS=1500
VFURST_LOAD_DB_CONNECTION_LIMIT=4
VFURST_LOAD_DB_POOL_TIMEOUT=20
VFURST_DB_CONNECTION_BUDGET=80
VFURST_SKIP_BUILD=1
VFURST_SKIP_LOCAL_SERVER=1
```

## Data setup

- Seed a published event with at least one active registration tier.
- Seed enough confirmed registrations and badges to make the check-in page representative.
- Log in as a staff user and provide either `VFURST_STAFF_COOKIE` or `VFURST_STAFF_EMAIL` / `VFURST_STAFF_PASSWORD`. The k6 script can authenticate through Auth.js when credentials are provided.
- Run the app against the same Postgres/Redis/S3/SMTP class expected for launch.

## Query optimization added in Phase 7

- Event lookup by organization, publication status, and start date.
- Cached public registration page data with filtered tier registration counts instead of loading attendee rows for capacity checks.
- Bounded staff check-in data with server-side search: the page loads at most 25 matching rows, with short-lived cache revalidation and action-driven path invalidation.
- Request-local Auth.js memoization plus one user/membership/workspace/event snapshot removes duplicate dashboard/event authorization reads without caching authorization across requests.
- Registration lookup by event/status, event/creation time, event/check-in time, and tier/status.
- Order reporting lookup by event/status/creation time and organization/status/creation time.
- Volunteer and vendor review lookup by event/status.

## Current evidence

- Docker-based k6 is available on this machine via the `grafana/k6` image.
- `npm run seed:load -- --registrations=5 --slug=load-smoke-1783436433083` seeded a smoke event and staff account.
- `npm run test:load:smoke` passed against the local Next dev server through Docker on July 7, 2026 after Docker loopback URL translation was added:
  - 0.00% `http_req_failed`
  - p95 `http_req_duration` 6.85s under the smoke-only 10s threshold
  - 81/81 checks passed
- `npm run test:load:launch` now builds the production web app directly from `apps/web`, ignores non-production `NODE_ENV` values from local dotenv files, seeds the launch-sized fixture, starts a temporary multi-replica production Next stack, and runs Docker-backed k6.
- A reduced production-server diagnostic passed on July 8, 2026 with `VFURST_LOAD_SEED_REGISTRATIONS=120`, `VFURST_REGISTRATION_VUS=20`, and `VFURST_CHECKIN_VUS=10`:
  - 0.00% `http_req_failed`
  - p95 `http_req_duration` 178.15ms
  - 21,509/21,509 checks passed
- Earlier exploratory full-target runs at the previous 1000 registration / 500 check-in VU target did not pass on the local Docker Desktop stack:
  - 97.48% `http_req_failed`
  - p95 `http_req_duration` reported as 0s because most requests failed at connection time
  - 13,007/515,019 checks passed
  - The failure mode was sustained `connect: connection refused` from Docker-backed k6 to the temporary local production server at high VU counts.
- The current Phase 7 target passed on July 8, 2026 with a 1500-registration seed, `VFURST_REGISTRATION_VUS=500`, `VFURST_CHECKIN_VUS=50`, `VFURST_LOAD_SERVER_REPLICAS=16`, and Docker-backed k6:
  - 0.00% `http_req_failed`
  - p95 `http_req_duration` 1.39s under the 1.5s threshold
  - 278,837/278,837 checks passed
  - 139,420 HTTP requests completed
- The required rerun after the July 14 shared-rate-limit change reached Docker-backed k6 outside the sandbox with the same 1500-registration, 500/50 VU, 16-replica topology, but failed the launch thresholds:
  - 94.52% `http_req_failed` (102,789 of 108,748 requests)
  - p95 `http_req_duration` 2.88s
  - 114,049/217,057 checks passed (52.54%)
  - Server evidence repeatedly reports Prisma `P2037` / Postgres `FATAL: sorry, too many clients already`. The local 16-replica topology exhausts the database connection budget before it reaches the response-time target.
  - This is a database connection-pooling/capacity blocker, not a Redis rate-limit rejection: the high-volume public registration path is not rate-limited, and the independent real-Redis multi-client regression proves the shared counter contract.
- The July 14 connection-capacity remediation adds one production Prisma singleton per process, a default four-connection pool with a 20-second pool timeout, a direct administrative datasource, and replica/budget/Postgres-capacity preflight. A diagnostic 16-replica/pool-4 run completed 87,437 requests with 0.00% HTTP failures and 174,871/174,871 checks; no `P2037` remained, but p95 was 3.16s on the local host.
- Replica/pool diagnostics and critical read paths were then tested without lowering the 500/50 VU or 1.5-second gate. The latest full diagnostic on July 14 used 1,500 seeded registrations, six web replicas, pool limit 2, pool timeout 20 seconds, and Docker-backed k6. Pool 2 was not retained because the concurrent E2E suite exposed unacceptable queuing; the supported launch default remains pool 4:
  - Postgres capacity preflight: 100 max - 3 reserved = 97 usable; 12 maximum web connections within application budget 80.
  - 0.00% `http_req_failed` across 123,831 HTTP requests; no Prisma `P2037` or replica failure.
  - 247,659/247,659 checks passed.
  - Registration p95 1.52s; check-in p95 2.49s; overall p95 1.58s.
  - The connection-exhaustion blocker is closed, but the full launch latency threshold remains failed by 80ms.

## Remaining proof

The Phase 7 target run has not passed yet after the latest material critical-path change. Prisma connection growth is now bounded and the former `P2037`/HTTP-error failure mode is gone. The next performance unit must reduce registration/check-in tail latency enough for a fresh 500-registration/50-check-in full run to meet p95 under 1.5 seconds; do not weaken the threshold or restore a pass claim from the historical July 8 baseline.
