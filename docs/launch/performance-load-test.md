# Phase 7 Performance And Load Test

## Targets

- 1000 concurrent public registration visitors.
- 500 concurrent staff check-in visitors.
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
- Starts a temporary local production Next server unless `VFURST_SKIP_LOCAL_SERVER=1` is set.
- Runs the full k6 profile with 1000 registration VUs and 500 check-in VUs.
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
VFURST_REGISTRATION_VUS=1000
VFURST_CHECKIN_VUS=500
VFURST_LOAD_PROFILE=full
VFURST_LOAD_SEED_REGISTRATIONS=1500
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
- A full `npm run test:load:launch` execution was attempted on July 7, 2026, but the escalation needed to start a temporary production server and run Docker-backed k6 was rejected by the approval layer before the seed/server/k6 commands ran. The proof runner is implemented for the next approved run.

## Remaining proof

The Phase 7 target run has not passed yet. The full proof still requires an approved `npm run test:load:launch` run, or an equivalent production-like app server plus `npm run test:load` with 1000 registration VUs and 500 check-in VUs.
