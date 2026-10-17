# Phase 1B Unit 1B.5 — Closeout and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close Phase 1B.
- Prove the identity re-platform locally: full E2E, `check:launch`, audit, a fresh 500/50 k6 proof on the new identity paths, and the manual walkthrough.
- Write the authentik and DNS/TLS runbooks, plus the API, contract, and docs updates.
- Merge `feat/identity-replatform` into `staging` once, then reset the deployed database, deploy, and record the deployed smoke test.

**Architecture:** four kinds of work, in order.
1. **Code (Tasks 1–3):** server-side Sentry URL scrubbing of tokens, the load-proof harness ported to portal accounts and staff OIDC, and launch-readiness checks for the new keys.
2. **Documentation (Task 4):** new and updated runbooks and contracts.
3. **Local phase gate (Task 5):** every gate, run on the final code.
4. **Release (Tasks 6–8):** operator steps that only the user can perform (authentik admin, Cloudflare/DNS, Coolify environment and volume, PR merge), each one a stop point with an exact checklist. The deployed smoke test is driven partly by the executor and partly by the user, because staff sign-in with a real Reyuu Games account needs the user's own credentials.

**Tech Stack:** Next.js 15.5, Auth.js v5, Sentry 10, k6 (local binary or the `grafana/k6` Docker image), Coolify Compose, Cloudflare, and authentik 2025.10.3.

**Spec:** `docs/superpowers/specs/2026-10-13-identity-replatform-design.md`.
- Read §1 "Success looks like", §11 (all), §12 "Load" and "Phase gates", §13 (1B.5 row and "Merging once"), §14 "In 1B.5", and §15 (R2, R4, R5, R7, R8, R9, R10).
- Read also `docs/plan/phase-1b-identity.md` "Exit criteria" and `docs/plan/verification.md` (gate commands, the Phase 1B manual walkthrough, and the checkpoint row).

## Global Constraints

- **Branch:** `feat/identity-replatform`. Tasks 1–5 commit there and do not push.
- **`PROGRESS.md`:** only Task 5 (local evidence) and Task 8 (deployed evidence and phase completion) edit it.
- **Stop points.** Every step marked **stop and ask** or **operator step** waits for the user.
  - The executor never: enters credentials; changes authentik, Cloudflare, Coolify, or GitHub settings; deletes a volume; pushes; opens or merges a PR — unless the user's message for that step says to.
  - The user's explicit words authorize each one separately.
- **Destructive operations:**
  - The deployed database reset is an operator step (spec §5.6, §13). It happens once, before the merge.
  - `prestart`/`sync` stay non-destructive. Never add a data-loss flag.
- **No new identity behavior.** If a gate exposes a defect, fix it test-first in this unit and record it. Anything bigger is a **stop and ask**.
- **Visual and axe baselines** are regenerated only for pages whose markup changed (spec §12). At 1B.4 close, none of the five baseline surfaces had changed, so the expected action is "none". A mismatch is a **stop and ask**.
- **Load proof.**
  - It runs against a production build on loopback with the existing harness (`npm run test:load:launch`), at the thresholds already in `tests/load/registration-checkin.k6.js`: checks > 99 %, failures < 1 %, p95 < 1500 ms.
  - Do not relax a threshold. A miss is a **stop and report** with the numbers.
- **Commit attribution:** do not add a `Co-Authored-By: Claude` trailer unless the executor is Claude, which follows its own attribution rules. Use conventional commit messages.
- **Gates** run serially: `npx turbo run type-check lint test build --concurrency=1`.
- **Ports.** Pawket containers may hold 5432/6379. The mock OIDC uses 8090. A conflict is a **stop and ask**.

**Fixed values:**

| Item | Value |
|---|---|
| Deployed issuer | `https://account.reyuugames.com/application/o/vfurst/` |
| Redirect URI | `https://vfurst.reyuugames.com/api/auth/callback/authentik` |
| Back-channel logout URI | `https://vfurst.reyuugames.com/api/oidc/backchannel-logout` |
| Post-logout redirect | `https://vfurst.reyuugames.com/` |
| Admin group | `vfurst-platform-admins` |
| Portal host pattern | `https://{subdomain}.vfurst.reyuugames.com` |
| Sentry filtered query keys | `token`, `code`, `state`, `id_token_hint`, `logout_token` |
| Sentry filtered path | `/invitations/<token>` → `/invitations/[Filtered]` |
| Sentry replacement text | `[Filtered]` |
| Load seed portal cookie (HTTP) | `vfurst-portal=<token>` |
| Load seed staff subject | `load-admin-<slug>` |

## Review Focus

1. **A token or authorization code in a server error URL** (set-password, transfer, checkout, invitation, or the OIDC callback's `code`/`state`) reaching Sentry. Expected: the value is `[Filtered]` everywhere the event carries the URL. Test: `sentry-url-scrub.test.ts` (Task 1).
2. **The load harness exercising the old paths.** The registration flow must hit the portal host (no 308 hop), and check-in must use a session obtained through the mock OIDC, so p95 reflects the new paths (R9). Test: the smoke profile asserts `/api/portal/session` returns an account and check-in returns 200 (Task 2).
3. **Merging before the reset.** Auto Deploy would run `migrate` against the old schema and fail at the column drops. Expected: the volume is deleted and the environment applied **before** the merge. Test: the ordered operator checklist in Task 6, each step confirmed before the next.
4. **Server Actions behind Cloudflare/Coolify on a tenant host** (R8). Expected: a portal sign-up on `{slug}.vfurst.reyuugames.com` succeeds, so the Origin check passes with the forwarded host. Test: deployed smoke step 7 (Task 7).
5. **`__Host-` portal cookie over the proxy.** Expected: with Cloudflare SSL "Full (strict)", the portal cookie is `__Host-vfurst-portal` with `Secure`. Test: deployed smoke step 7 inspects the `Set-Cookie` header (Task 7).

---

### Task 0: Preflight and baseline

**Files:** none

- [ ] **Step 1: Confirm the branch, a clean tree, and that `staging` has not moved.**

  Run: `git branch --show-current; git status --short; git fetch origin; git rev-list --count feat/identity-replatform..origin/staging`
  Expected: `feat/identity-replatform`, no changes, and `0`. If `staging` moved, **stop and ask** (merge it in the way 1B.3 Task 0 did).

- [ ] **Step 2: Confirm the local services.**

  Run: `docker ps --format "{{.Names}} {{.Ports}}"`
  Expected: postgres, redis, minio, mailpit, and `mock-oidc` on 5432/6379/9000-9001/1025+8025/8090. Run `docker compose up -d` if any is missing.

- [ ] **Step 3: Record the baseline.**

  Run: `npx turbo run type-check lint test build --concurrency=1`, then `npm run prestart --workspace @vfurst/web` and `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  Expected: PASS, with **0 failed / 0 did not run** (1B.4 closed at 147 tests and 606 unit tests). Anything red: **stop and report**.

---

### Task 1: Server-side Sentry URL scrubbing

**Files:**
- Create:
  - `apps/web/src/lib/sentry-url-scrub.ts`
  - `apps/web/src/lib/sentry-url-scrub.test.ts`
- Modify:
  - `apps/web/src/sentry.server.config.ts`
  - `apps/web/src/sentry.edge.config.ts`

**Interfaces (`lib/sentry-url-scrub.ts`):**
- `SENSITIVE_QUERY_KEYS: readonly string[]`, the keys from the Fixed values table.
- `scrubSensitiveUrl(value: string): string`
  - Works on absolute URLs, relative paths, and bare query strings (with or without a leading `?`).
  - Replaces the value of each sensitive key with `[Filtered]`, and an `/invitations/<segment>` path segment with `/invitations/[Filtered]`.
  - Leaves everything else byte-identical.
- `scrubSentryEventUrls<T>(event: T): T`
  - Mutates and returns the event.
  - Scrubs `event.request.url`, `event.request.query_string` (string, `[key, value][]`, or object), `event.request.headers.referer` / `Referer`, and each `event.breadcrumbs[].data.url`, `.from`, and `.to`.
  - Ignores missing fields.
- **Configs:**
  - `beforeSend: (event, hint) => { const kept = filterExpectedNextHttpAccessFallback(event, hint); return kept ? scrubSentryEventUrls(kept) : null; }`
  - `beforeSendTransaction: (event) => scrubSentryEventUrls(event)` on both the server and edge configs.
  - The browser side keeps the 1B.2 token-page exclusion and is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `"filters token, code, state, id_token_hint, and logout_token values in absolute and relative URLs"`:
    - `https://acme.vfurst.reyuugames.com/set-password?token=abc&returnTo=%2F` → exactly `https://acme.vfurst.reyuugames.com/set-password?token=%5BFiltered%5D&returnTo=%2F`. Query values go through `URLSearchParams`, which encodes the brackets; a path segment keeps the literal `[Filtered]`;
    - `/api/auth/callback/authentik?code=c1&state=s1` → both filtered.
  - `"filters the invitation token path segment"`: `/invitations/AbC_123-xyz` → `/invitations/[Filtered]`.
  - `"filters string, tuple, and object query strings"`
  - `"filters referer headers and breadcrumb URLs"`
  - `"leaves URLs without sensitive values unchanged"`: `https://vfurst.reyuugames.com/dashboard?tab=events` stays identical.

- [ ] **Step 2: Run them to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/sentry-url-scrub.test.ts`
  Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement the module and wire both configs.**

- [ ] **Step 4: Verify.**

  Run: the Step 2 command, then `npm run type-check --workspace @vfurst/web` and `npm run lint --workspace @vfurst/web`
  Expected: PASS.

- [ ] **Step 5: Commit.** `feat(web): scrub tokens and authorization codes from server-side Sentry URLs`

---

### Task 2: Load proof on portal accounts and staff OIDC

**Files:**
- Create:
  - `scripts/lib/staff-oidc-login.mjs`
  - `scripts/lib/staff-oidc-login.test.mjs`
- Modify:
  - `scripts/seed-load-test.mjs`
  - `scripts/run-launch-load-proof.mjs`
  - `scripts/run-load-test.mjs` (Docker environment passthrough)
  - `tests/load/registration-checkin.k6.js`
  - `docs/launch/performance-load-test.md`
  - `package.json`: add the script `"test:load-harness": "node --test scripts/lib/staff-oidc-login.test.mjs"`. CI is unchanged; the load proof is a local launch gate.

**Interfaces:**
- **`loginStaffThroughMockOidc({ baseUrl, sub, email, groups = [], fetchImpl = fetch }): Promise<string>`** returns a `Cookie` header containing the Auth.js session cookie. It is plain HTTP with a manual cookie jar and `redirect: "manual"`:
  1. `GET {baseUrl}/api/auth/csrf` → `csrfToken` plus cookies.
  2. `POST {baseUrl}/api/auth/signin/authentik` (form `csrfToken`, `callbackUrl={baseUrl}/dashboard`) → 302 to the mock `/authorize` URL plus the PKCE and state cookies.
  3. `POST` that authorize URL with form `username=<sub>` and `claims=<JSON {email, email_verified: true, groups}>` → 302 to `/api/auth/callback/authentik?code…`.
  4. `GET` the callback with the jar → 302, and the response sets `authjs.session-token`.
  - Any other status, or a missing session cookie, throws an `Error` that names the step.
- **`scripts/seed-load-test.mjs`:**
  - **Staff:** `User` (`emailVerified` set) plus `Account { type: "oidc", provider: "authentik", providerAccountId: "load-admin-<slug>" }`. No `passwordHash`.
  - **Attendees:** `PortalAccount` rows in the organization. Registrations and orders use `portalAccountId`.
  - **One `PortalSession`** for the first attendee:
    - `token = randomBytes(32).toString("base64url")`;
    - `tokenHash = hashOpaqueToken(token)` from `@vfurst/auth/core`;
    - `authVersion` equal to the account's;
    - `expiresAt` = now + 1 day.
  - Prints, alongside the existing lines:
    - `VFURST_STAFF_SUB="load-admin-<slug>"`
    - `VFURST_PORTAL_HOST="<slug>.localhost:3000"`
    - `VFURST_PORTAL_SESSION_COOKIE="vfurst-portal=<token>"`
  - Drops `VFURST_STAFF_PASSWORD`.
- **`run-launch-load-proof.mjs`:**
  - Before seeding, `GET {AUTH_AUTHENTIK_ISSUER}/.well-known/openid-configuration`. On failure, throw "Start the mock OIDC: docker compose up -d mock-oidc".
  - After the server is reachable, call `loginStaffThroughMockOidc` with the seeded staff.
  - Pass `VFURST_STAFF_COOKIE`, `VFURST_PORTAL_HOST`, and `VFURST_PORTAL_SESSION_COOKIE` to k6, and remove `VFURST_STAFF_PASSWORD`.
- **`registration-checkin.k6.js`:**
  - **`registrationFlow`:**
    - `GET {baseUrl}/register` with `Host: VFURST_PORTAL_HOST`. Checks: 200 and "Registration" in the body.
    - Then `GET {baseUrl}/api/portal/session` with the same Host and `Cookie: VFURST_PORTAL_SESSION_COOKIE`. Checks: 200 and `account.email` present.
    - Both timings feed `registration_flow_duration`.
  - **`checkInFlow`:** unchanged, but `setup()` throws "VFURST_STAFF_COOKIE is required" when the cookie is empty. The credentials login function is deleted.
  - Thresholds unchanged.
- **`run-load-test.mjs`:** add `VFURST_STAFF_COOKIE`, `VFURST_PORTAL_HOST`, and `VFURST_PORTAL_SESSION_COOKIE` to the Docker environment list. The portal Host value is **not** rewritten to `host.docker.internal`.

- [ ] **Step 1: Write the failing harness test.** `staff-oidc-login.test.mjs` (`node:test`) uses a scripted fake `fetch` for the four hops.
  - `"forwards csrf, pkce, and state cookies and returns the session cookie"`: asserts the cookies sent on hops 2 and 4, and the claims JSON posted on hop 3.
  - `"throws naming the step when the callback sets no session cookie"`

- [ ] **Step 2: Run it to verify it fails.**

  Run: `npm run test:load-harness`
  Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement the module, the seed, the runner, the k6 script, and the passthrough.**

- [ ] **Step 4: Run the harness test.**

  Run: the Step 2 command
  Expected: PASS.

- [ ] **Step 5: Run the smoke profile on a production build.**

  Run: `VFURST_LOAD_PROFILE=smoke VFURST_LOAD_SEED_REGISTRATIONS=120 VFURST_LOAD_SERVER_REPLICAS=1 npm run test:load:launch`
  Expected:
  - every check passes;
  - `http_req_failed` is 0;
  - the summary shows the portal-session check and the check-in check both at 100 %.

  If k6 is not installed and Docker must pull `grafana/k6`, that pull is a download: **ask** before the first run.

- [ ] **Step 6: Run the full 500/50 proof.**

  Run: `npm run test:load:launch` (defaults: 1500 registrations, 500/50 VUs, `VFURST_LOAD_SERVER_REPLICAS` from the environment or 6).
  Expected: all thresholds pass. Record the following under "Current evidence" in `performance-load-test.md`, with the date, replica count, and k6 runtime (local or Docker):
  - p95 and p99 for `registration_flow_duration`, `checkin_flow_duration`, and `http_req_duration`;
  - the check rate and the failure rate.

  A threshold miss: **stop and report** the summary. Do not tune the thresholds.

- [ ] **Step 7: Commit.** `test(load): run the launch proof on portal accounts and staff OIDC`

---

### Task 3: Launch readiness knows the staff identity keys

**Files:**
- Modify:
  - `scripts/check-launch-readiness.mjs`
  - its test, if one exists (`git ls-files scripts | grep readiness`); otherwise no test file is added and the verification is the command run.

**Rules:**
- Add the type `https-url`: a valid URL whose protocol is `https:`.
- Add three required env entries:
  - `AUTH_AUTHENTIK_ISSUER` (`https-url`);
  - `AUTH_AUTHENTIK_ID` (`text`);
  - `AUTH_AUTHENTIK_SECRET` (`text`).
- Locally the issuer is `http://localhost:8090/vfurst`, so `check:launch` reports it as failing the `https-url` rule. That is one more **known external failure**: deployed-only, recorded in Task 5.

- [ ] **Step 1: Implement. Run `npm run check:launch` and read every failing item.**

  Expected: the previously known external failures, plus the new local-issuer failure; nothing else. List them all in the commit body.

- [ ] **Step 2: Commit.** `chore(launch): check the staff identity provider keys`

---

### Task 4: Runbooks, contracts, and docs

**Files:**
- Create: `docs/launch/authentik-setup.md`
- Modify:
  - `docs/launch/staging-coolify-setup.md`
  - `docs/launch/go-live-checklist.md`
  - `docs/api-contracts/openapi.yaml`, `docs/api-contracts/webhooks.yaml`, `docs/api-contracts/README.md`
  - `apps/docs/docs/api.md`, `apps/docs/docs/webhooks.md`, `apps/docs/docs/onboarding.md`
  - `docs/plan/01-current-state.md`

**Content rules:**
- **`authentik-setup.md`:** spec §11.3 item by item, as numbered admin steps.
  - Provider, application, scopes, and the `email` mapping that emits the true verification state, plus the enrollment email stage.
  - The dedicated invalidation flow with a User Logout stage; back-channel logout URI and method; the group; the application with no policy bindings.
  - Every value from the Fixed values table.
  - Subject mode: hashed user ID or UUID, and **never change it after go-live** (R10).
  - Where to read the client ID and secret, and which Coolify keys receive them.
  - **Known behaviors:** back-channel is Preview (R2); `post_logout_redirect_uri` may be ignored (R4); `email_verified` is false until configured, and invitations fail closed (R5).
  - A **smoke checklist** that matches Task 7.
- **`staging-coolify-setup.md`:**
  - §3 lists the five staff identity keys (runtime only), with sources.
  - A new **DNS and TLS** section (spec §11.4):
    - wildcard `*.vfurst.reyuugames.com` to the origin;
    - the two certificate options (Cloudflare Advanced Certificate Manager, or DNS-only records plus a Let's Encrypt DNS-01 wildcard through Coolify/Traefik), and the line "Chosen: …", left for Task 6;
    - Cloudflare SSL/TLS mode **Full (strict)**, required for the `__Host-` portal cookie;
    - the Coolify domain entry that routes wildcard hosts to `web`.
  - §6 Smoke gains the portal checks from Task 7.
  - §7 Database reset gives the 1B.5 order: apply the environment → stop the resource → delete `postgres_data` → merge → Auto Deploy runs `migrate` on the empty database.
- **`go-live-checklist.md`:** add the authentik production items (`email_verified` mapping, invalidation flow, back-channel, an immutable subject mode, the admin group membership review) and the wildcard certificate.
- **Contracts:**
  - every `userId` in `openapi.yaml` and `webhooks.yaml` gets `description: "Portal account ID of the attendee, scoped to the API key's organization (Phase 1B; formerly a platform user ID)."`;
  - the README gains a short "Identity change" note;
  - `apps/docs` api and webhooks pages say the same in one sentence;
  - onboarding step 1 says admins sign in with their Reyuu Games account, and that attendees create accounts on the event portal.
- **`01-current-state.md`:** a "Phase 1B (identity re-platform)" paragraph covering the two identity systems, the canonical portal host, and the removed central pages.

- [ ] **Step 1: Write the documents.**

- [ ] **Step 2: Verify.**
  - Run: `npm run build --workspace @vfurst/docs`
    Expected: PASS.
  - Run: `git grep -nE "manage-platform-admin|/forgot-password|/reset-password|credentials" docs/launch docs/api-contracts apps/docs/docs`
    Expected: no hit, except portal `/forgot-password` mentions.

- [ ] **Step 3: Commit.** `docs: authentik and DNS runbooks, identity contract notes`

---

### Task 5: Local phase gate

**Files:**
- Modify: `PROGRESS.md` (local evidence only) and `docs/plan/verification.md` (only if a walkthrough step names a removed page).

- [ ] **Step 1: Run every gate on a clean build.**
  - Run: `npx turbo run type-check lint test build --concurrency=1 --force`
  - Run: `npm run test:boot-config`
  - Run: `npm audit --audit-level=moderate`
    Expected: only the 4 accepted dev-only `braces` findings.
  - Run: `npm run check:launch`
    Expected: the Task 3 list.
  - Run: a fresh web build, `npm run prestart --workspace @vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
    Expected: **0 failed / 0 did not run**, and the visual baselines unchanged.

- [ ] **Step 2: Run the manual walkthrough** (`docs/plan/verification.md`, the eight Phase 1B steps under plain `npm run dev`, with the mock up). Any blank "Application error" is a failure. Record one line per step.

- [ ] **Step 3: Write the `PROGRESS.md` entry** ("1B.5 local gate"): the counts from Step 1, the Task 2 load numbers, the `check:launch` list, and the walkthrough.

- [ ] **Step 4: Commit.** `docs(progress): record the phase 1B local gate`

---

### Task 6: Release preparation (operator steps)

**Files:** `docs/launch/staging-coolify-setup.md` ("Chosen: …" line only).

Each step is done by the user. The executor prepares the exact values, waits for the user's confirmation, and records it.

- [ ] **Step 1: Stop and ask: push and open the PR.**
  - With the user's go: `git push -u origin feat/identity-replatform`, then open a PR into `staging` titled "Phase 1B: identity re-platform".
  - The body summarizes 1B.1–1B.5 and links the spec, the phase file, and the Task 5 evidence.
  - Expected: both required checks (`Lint, type-check, test, and build`, `Production images (linux/arm64)`) pass. **Do not merge.**

- [ ] **Step 2: Operator step — authentik.** The user follows `docs/launch/authentik-setup.md` §1–§N and reports:
  - the issuer URL shown by authentik, which must equal the Fixed value;
  - that the client ID and secret are ready;
  - that the group exists and contains the first platform administrator.

  The executor never sees or enters the secret.

- [ ] **Step 3: Operator step — DNS and TLS.**
  - The user chooses the certificate option. The executor records "Chosen: …" in the runbook and commits it on the branch (`docs(launch): record the wildcard certificate choice`), then pushes with the user's go.
  - The user confirms that `https://probe.vfurst.reyuugames.com/` reaches the vFurst origin. A 404 from vFurst is fine; a certificate or DNS error is not.
  - The user confirms that Cloudflare SSL is **Full (strict)**.

- [ ] **Step 4: Operator step — Coolify environment.**
  - The user sets `AUTH_AUTHENTIK_ISSUER`, `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET`, `VFURST_PLATFORM_ADMIN_GROUP`, and `VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, all runtime only.
  - The user confirms that `NEXT_PUBLIC_ROOT_DOMAIN=vfurst.reyuugames.com` is ticked "Available at Buildtime".

- [ ] **Step 5: Operator step — reset the staging database (destructive).**
  - The executor restates the effect: all staging data is deleted, and this is test data only (spec §1).
  - The user stops the resource and deletes the `postgres_data` volume in Coolify, then confirms in writing.

- [ ] **Step 6: Stop and ask: merge.** With the user's go, merge the PR (merge commit, not squash, so the unit history stays). Auto Deploy starts.

---

### Task 7: Deployed smoke test

**Files:** none (evidence goes to Task 8).

The executor runs the HTTP checks. The user performs every step that needs their Reyuu Games credentials or an inbox.

- [ ] **Step 1: Check the deploy.** In the Coolify log, `migrate` exited 0, and `web` and `worker` are healthy.
  Run: `curl -fsS https://vfurst.reyuugames.com/api/healthz`
  Expected: 200 with database and Redis `ok`, and a commit equal to the merge commit SHA.

- [ ] **Step 2: Check the public surface.**
  Run: `curl -i https://vfurst.reyuugames.com/api/v1/events` → 401; `curl -fsS https://vfurst.reyuugames.com/ | head -n 5` → HTML; `curl -sI https://vfurst.reyuugames.com/login` → 200.

- [ ] **Step 3: User — staff sign-in.**
  - The user signs in at `https://vfurst.reyuugames.com/login` with the account in the admin group and lands on `/platform`.
  - A second account outside the group lands on the 403 screen.

- [ ] **Step 4: User — organization and invitation.**
  - As admin, the user provisions an organization with subdomain `smoke-1b`, invites the second account, and accepts the invitation after verifying its email in authentik.
  - Expected: acceptance works, and with an unverified email it shows `EMAIL_UNVERIFIED`.

- [ ] **Step 5: Canonical host.**
  Run: `curl -sI "https://vfurst.reyuugames.com/smoke-1b/register?probe=1"`
  Expected: `308` with `location: https://smoke-1b.vfurst.reyuugames.com/register?probe=1`.

- [ ] **Step 6: Logout and back-channel.**
  - The user logs out from `/dashboard`: the browser passes through authentik's end-session, and the authentik session is gone.
  - The user signs in again in a second browser, then deactivates that user in authentik.
  - Expected: within a minute, the vFurst session in the second browser is signed out, because the back-channel revoked it.
  - If back-channel does not fire (R2, Preview), record it. The 12-hour cap remains the guarantee, so this is not a stop.

- [ ] **Step 7: Portal on the tenant host.**
  - The user signs up on `https://smoke-1b.vfurst.reyuugames.com/signup` with a real inbox, follows the setup link, sets a password, and registers for a free tier.
  - Expected:
    - the confirmation appears under `/account/registrations`;
    - `Set-Cookie` (read in the browser DevTools) shows `__Host-vfurst-portal; Secure; HttpOnly; SameSite=Lax`;
    - the sign-up server action succeeds (R8).
  - If SMTP is not configured on staging, **stop and report**. The portal flow cannot be proven without email.

- [ ] **Step 8: Clean up.** The user may delete `smoke-1b`, or keep it as the staging demo. Record which.

---

### Task 8: Phase 1B completion

**Files:**
- Modify:
  - `PROGRESS.md`
  - `docs/plan/phase-1b-identity.md`: a "Status: complete (date)" line. The 1B.5 row already links this plan.
  - `docs/plan/verification.md`: the Phase 1B checkpoint row marked passed, with the date.
- Then a docs-only PR into `staging`, or a direct commit if the user prefers. **Ask.**

- [ ] **Step 1: Write the `PROGRESS.md` entry** ("Phase 1B complete").
  - The Task 7 evidence: health SHA, curl results, the user-confirmed steps, the back-channel outcome, and the cookie attributes.
  - Set "Current phase" to Phase 2 "Not started — next", and Phase 1B to Complete in the status table.

- [ ] **Step 2: Stop and ask** how to land the docs: a PR into `staging`, or the user commits them.

- [ ] **Step 3: Commit.** `docs(progress): record phase 1B completion`
