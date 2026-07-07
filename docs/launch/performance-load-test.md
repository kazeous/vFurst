# Phase 7 Performance And Load Test

## Targets

- 1000 concurrent public registration visitors.
- 500 concurrent staff check-in visitors.
- HTTP failure rate below 1%.
- 95th percentile page response time below 1.5 seconds on a properly provisioned launch stack.

## Script

Run:

```bash
k6 run tests/load/registration-checkin.k6.js
```

Useful environment variables:

```bash
VFURST_BASE_URL=http://127.0.0.1:3000
VFURST_LOAD_ORG_SLUG=your-org-slug
VFURST_LOAD_EVENT_ID=event-uuid
VFURST_STAFF_COOKIE="authjs.session-token=..."
VFURST_REGISTRATION_VUS=1000
VFURST_CHECKIN_VUS=500
```

## Data setup

- Seed a published event with at least one active registration tier.
- Seed enough confirmed registrations and badges to make the check-in page representative.
- Log in as a staff user and provide the session cookie through `VFURST_STAFF_COOKIE`.
- Run the app against the same Postgres/Redis/S3/SMTP class expected for launch.

## Query optimization added in Phase 7

- Event lookup by organization, publication status, and start date.
- Registration lookup by event/status, event/creation time, event/check-in time, and tier/status.
- Order reporting lookup by event/status/creation time and organization/status/creation time.
- Volunteer and vendor review lookup by event/status.

## Current state

The k6 script and database indexes are committed. A full 1000/500-user pass requires a seeded launch-sized environment and the k6 binary; this local repository can validate the script and build, but cannot prove production throughput without that runtime.
