# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. `PROGRESS.md` and the actual repository are the only ground truth for what exists; plan docs describe intent.

> **Plan v2 (2026-07-26).** The original phase 0–7 plan and the complete pre-rebuild session history were retired in the docs-v2 rebuild and live in git history (see the `docs: rebuild plan` commit). The verified baseline they produced is summarized in `docs/plan/01-current-state.md` — do not re-derive it from old history.

## Current phase

**Phase 1 — Stabilize: Complete** (`docs/plan/phase-1-stabilize.md`)

Audit Batches 0–5, unit 1.6/TST-02, the complete plain-dev walkthrough, closeout regression, and the dependency-security gate are complete. The final clean install and registry-backed audit report **0 vulnerabilities**, and the production E2E suite passes **118/118**. Batch 6 (split-runtime hardening) remains explicitly deferred/frozen pending a separate cutover decision. **Next session: begin Phase 2 only** — read `docs/plan/00-reference.md` and `docs/plan/phase-2-attendee-parity.md`, then execute only its first numbered unit; do not start Batch 6 or split-runtime cutover work.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Stabilize | Complete | Units 1.1–1.6, full plain-dev walkthrough, dependency remediation, and complete closeout regression passed; audit Batch 6 remains deferred/frozen |
| 2 — Attendee & registration parity | Not started — next | Phase 1 is complete; next session starts with the first numbered unit in the phase file |
| 3 — Commerce & product parity | Not started | Blocked on Phase 1; age rules depend on Phase 2 DOB |
| 4 — Event-day & operations parity | Not started | Depends on Phase 2 (DOB) and Phase 3 (fulfillment) items as noted |
| 5 — Registration lottery | Not started | Product contract in the phase file needs confirmation before build |
| 6 — Launch | Blocked (external) | All external evidence outstanding; see `docs/launch/go-live-checklist.md` |

Legend: Not started · In progress · Blocked · Complete (only after the phase's `verification.md` checkpoint passes and is recorded here with counts).

## Baseline evidence (2026-07-26, pre-rebuild — details in `docs/plan/01-current-state.md`)

Type-check/lint/test 32/32 tasks (133 web unit tests); build 10/10; split topology 5/5; **full E2E 88 passed / 5 failed / 6 did not run** (known: TST-01 assertions, DAT-01 teardown FK, one contention flake); 500/50 load proof passed 2026-07-14. Local Docker volumes and build caches were wiped during the rebuild — re-run gates before relying on baseline numbers.

## Session log

### 2026-10-14 — Compose build-time variable fix (out-of-phase infrastructure)

- The first manual deployment of the new Coolify Compose resource (`1ea95ea`) failed at build. The error was `required variable POSTGRES_USER is missing a value`. Coolify builds with an env file that holds only the variables ticked "Available at Buildtime", and Compose interpolates the whole file, `environment:` included. The deploy log also showed Coolify injecting an `ARG` for every build-time variable into every Dockerfile stage, including secrets such as `AWS_SECRET_ACCESS_KEY` and `STRIPE_SECRET_KEY`.
- **Fix:**
  - `compose.prod.yaml` keeps `${VAR:?}` only for `SOURCE_COMMIT` and the required `NEXT_PUBLIC_*`. The ten runtime-required keys use `${VAR:-}` and fail at container start.
  - `scripts/validate-compose.mjs` gains `checkBuildTimeRequirements`, which rejects `:?` on any other key; its tests went from **9 to 11**.
  - The runbook, spec §4.3 and K7, and AGENTS.md now say to tick "Available at Buildtime" only for `NEXT_PUBLIC_*`.
- **Verification:**
  - `npm run test:compose` **11/11**; `npm run compose:validate` (web 54, worker 26 keys).
  - With only build-time variables, `docker compose config` reproduces the Coolify error on the old file and passes on the new one.
  - The PostgreSQL empty-password fail-closed behavior was not rerun locally, because Docker Desktop was stopped.
- **Next:** after merge, untick "Available at Buildtime" on every non-`NEXT_PUBLIC_*` variable in Coolify and redeploy.

### 2026-10-13 — Single Coolify Compose deployment (out-of-phase infrastructure, executed)

- On `chore/coolify-compose-deploy`, added one shared `Dockerfile` with `web`, `worker`, and one-shot `migrate` targets; `compose.prod.yaml` starts PostgreSQL and Redis before the migration, then the two application services from the same source commit. The non-destructive DB `sync` script runs the schema preparation, push, and backfills. The Compose validator enforces the environment contract and generated service configuration. Four web reads now treat empty optional environment values as unset.
- CI retains `verify` and adds a native `linux/arm64` production-image build on `ubuntu-24.04-arm`; the retired webhook deployment workflow was removed. The staging Coolify runbook, go-live checklist, agent instructions, and verification guide now describe the single-resource deployment and manual cutover.
- Task 0 baseline: serial Turbo **37/37** (type-check 9, lint 9, test 9, build 10), **83 files / 541 tests**; boot-config PASS. Task 8: the same serial gates **37/37** (9/9/9/10), **84 files / 545 tests** (web 32 files / 194 tests), boot-config PASS, Compose tests **9/9**, and `compose:validate` passed with **web 54 / worker 26** environment keys. The K3 grep and the first two retired-reference sweeps were empty; the cutover-reference counts were **1/1**. No new warning was found against the baseline, including the exact cached Task 0 web-build output; the existing BullMQ, Next workspace-root, Serwist, and Webpack cache notices remain.
- Per-suite Task 0 → Task 8 tests: web **190 → 194** (31 → 32 files); worker **41 → 41**; platform-manager **40 → 40**; tenant-web **54 → 54**; auth **67 → 67**; contracts **29 → 29**; db **52 → 52**; email **18 → 18**; tenant-context **50 → 50**.
- Local cache-only builds of all three targets passed; worker and migrate reused cached `npm ci` and the shared build RUN. The synthetic Compose smoke from source commit `5088369f089444d2f15e04ceee76e22b0f2a7b44` had `migrate` exit 0 and PostgreSQL, Redis, web, and worker healthy. Web `/api/healthz` returned 200 with database and Redis `ok` and that exact commit; worker returned 200 with `ok:true` and five workers; the schema probe returned `t`. A second migration exited 0 on the synchronized schema, an intentional wrong-password migration exited 1, and smoke cleanup removed its project, volumes, three image tags, and scratch files. The image build logged the known BullMQ and Redis `ECONNREFUSED` noise while succeeding. The final actionlint run exited 0 with no findings after its YAML mapping fix.
- Stop points and resolutions: an initial `npm ci` EPERM succeeded on an identical escalated retry; Task 0 Turbo/SWC filesystem denial stopped the run until the user instructed continuation, then the same gates passed with escalation. The user amended the original runbook/sweep contradiction in `764d2d8` and instructed continuation. Task 7 review's backup-evidence wording was corrected in its amended commit so the manual item is not presented as an automated check.
- Final review corrected the staging recommendation for `NEXT_PUBLIC_ROOT_DOMAIN` to the canonical `vfurst.reyuugames.com` and clarified that `COPY . .` includes the two frozen split app sources in the shared build stage without building or deploying those apps. These documentation corrections did not change deployment files or runtime behavior.
- No deployment, push, PR, or external settings were changed; existing non-smoke containers and volumes were untouched. The Phase 1B work remains separate.

**Next:** the user pushes chore/coolify-compose-deploy, opens a pull request into staging, confirms both CI jobs are green, and follows docs/launch/staging-coolify-setup.md §2. Phase 1B continues on feat/identity-replatform with unit 1B.2; merge staging into it at the start of that unit.

### 2026-10-13 — Single Coolify Compose deployment: design and plan (out-of-phase infrastructure; documentation only)

- **What the user wants:**
  - Replace the four staging Coolify resources (`postgresql-vfur`, `redis-vfur`, `v-furst:staging-web`, `v-furst:staging-worker`) with one Docker Compose resource, so web and worker always run the same commit.
  - Build-check the production images natively on GitHub's `ubuntu-24.04-arm` runner, with no QEMU and no GHCR packages.
- **What the user decided:**
  - The arm64 job builds to the cache only; Coolify still builds on the host.
  - Coolify deploys through its GitHub App auto-deploy, with no API token or webhook in GitHub.
  - The CI gate becomes a `staging` ruleset that requires both checks.
  - Staging data is test data, so the new PostgreSQL and Redis start empty.
- **Findings:**
  - The pipeline already stopped using QEMU and pushing to GHCR in PR #7/#8. The two GHCR packages are stale leftovers from PR #5/#6.
  - The web image never ran the schema chain; the runbook had the operator run it by hand. A one-shot `migrate` service now runs it.
  - Four web reads mishandle an empty optional value. They are fixed in the plan's Task 1.
- **Documents on branch `chore/coolify-compose-deploy`** (cut from `origin/staging` at `97bc517`; worktree `.claude/worktrees/coolify-compose-deploy`; not pushed):
  - spec `docs/superpowers/specs/2026-10-13-coolify-compose-deploy-design.md`;
  - plan `docs/superpowers/plans/2026-10-13-coolify-compose-deploy.md`.
- **What did not happen:** no code, configuration, workflow or Coolify setting changed, and no gate ran. Phase status is unchanged.
- **Next session:** execute `docs/superpowers/plans/2026-10-13-coolify-compose-deploy.md` (Tasks 0–8) in that worktree. Phase 1B continues separately on `feat/identity-replatform` with unit 1B.2.

### 2026-10-13 — Dependency advisory remediation on `staging` (user-requested)

- New advisories since the July closeout: the lockfile went from 0 to 21 findings (1 critical in Next.js). Next moved to 15.5.27, nodemailer to 10.1.0, and the sharp, PostCSS, `brace-expansion`, `fast-uri`, and `deepmerge-ts` overrides and vitest were raised; the remainder came from a non-forced `npm audit fix`.
- The audit now shows 4 high findings, all one accepted dev-only `braces` chain inside the Next ESLint plugin; no upstream fix exists. Details and proof are in `docs/launch/security-audit.md`.
- Gates: 37/37 forced serial, boot-config PASS, split-topology 5/5, both Docker images build. Production E2E was not rerun. The Phase 1B branch must take these package changes when it merges in 1B.5.

### 2026-07-30 — Phase 2 product decisions recorded (user-requested; documentation only)

- The user confirmed the three proposed decisions before Phase 2: reusable attendee profiles with a default cap of four per account and event-configurable cap; recipient-owned, editable attendee data after a transfer so the sender's shared profile is never exposed or mutated; and `next-intl` with Vietnamese and English for portal/account/auth/email surfaces first.
- DOB is consequently collected on an attendee profile and required only when an event enables age rules. The concrete transfer behavior is recorded so Unit 2.1 can preserve profile ownership and privacy while still making the transferred attendee editable.
- No application code, database schema, generated artifact, test, or phase unit was started. Phase 2 remains **not started**; **next session must execute only Unit 2.1.**

### 2026-07-30 — Current-state reconciliation and safe product archive (user-requested)

- Reconciled the ConCat-oriented `saas-functions.md` inventory with the repository instead of treating that inventory as a statement of implemented vFurst behavior. `01-current-state.md` now reflects the Phase 1 closeout and the current runtime; the parity matrix records the actual partials and omissions, including constrained email templates, volunteer interest/lead workflow, organizer people profiles, event-site content/publishing, and the intentionally narrow read-only v1 API.
- Added the missing work to the appropriate later phases without starting them: registration templates, custom email-domain verification, and event-site content/publishing are Phase 2 units; product archive/order-lifecycle policy remains Phase 3; volunteer workflow, people profiles, and scoped v1 API expansion are Phase 4. Phase 2 itself remains **not started**.
- Replaced destructive catalog deletion with recoverable product archive. `StoreProduct.archivedAt` is indexed and was applied to the local development schema through the project-standard `prestart`/`prisma db push` chain. An archived product is hidden from the public catalog, v1 store API, and raffle selector, is removed from active carts, cannot be added/updated/converted from a stale cart, and can be restored by an organizer. Historical and provider-backed orders are deliberately retained unchanged: archive must never rewrite a payment-provider-authoritative amount or erase an order record. The unresolved unpaid-order edit/cancel policy is explicitly kept in Phase 3.
- Added focused E2E coverage for tenant-safe archive, public invisibility, and the retained second-tenant catalog. Its login helper now follows the current successful full-document post-login navigation rather than racing it with a direct `page.goto`.
- Verification passed: Prisma client generation; `npm run prestart --workspace @vfurst/web` (schema synchronized); focused `npm run test:e2e -- --grep "product catalog actions"` (**1/1**); serial `turbo run type-check lint test --concurrency=1` (**32/32** tasks; web **190/190** unit tests); and serial `turbo run build --concurrency=1` (**10/10**). The initial parallel aggregate run was discarded because independent tasks cleaned `@vfurst/db/dist` while a web suite resolved that package; the serial rerun removes that build-order race. A standalone host probe was not claimed: the execution sandbox rejected starting a new background dev server under the earlier read-only constraint, and that restriction was not bypassed.
- This is an out-of-plan documentation reconciliation and product-lifecycle safety correction requested by the user; no phase exit is claimed. **Next session must begin only Phase 2 unit 2.1.**

### 2026-07-29 — Post-login 404 navigation fix (user-requested)

- Reproduced the production defect from a signed-out browser session: a successful credentials submission wrote the session and changed the URL to `/dashboard`, but the App Router rendered its default black 404 until a manual reload; that reload immediately resolved the same account to `/platform`. Clearing cookies/cache did not address the first-navigation failure.
- Changed credentials login to let Auth.js finish writing the session cookie without issuing an App Router redirect, then perform one full-document replacement to the already-sanitized return path. This prevents reuse of the pre-login RSC tree, keeps the login page out of browser history, shows an explicit `Opening workspace...` pending state, and leaves Google/OAuth navigation unchanged.
- Strengthened tenant-containment E2E so platform admins must land directly on `/platform` and organization owners directly on `/dashboard` after the login click; the tests no longer mask a broken first render with a later `page.goto`. Focused containment passed **4/4** in dev and production modes. Production wrong-password coverage passed **1/1**, proving the accessible inline error and successful retry still work.
- Required session gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **190/190**), build **10/10**, prestart/schema preparation, and host probe **200/200/200/200/400**. The build retained only the known BullMQ dynamic-dependency warning, Serwist informational output, and Next's deliberate experimental `authInterrupts` banner. One attempted production error-flow run after a dev host probe found no `BUILD_ID`; it ran no tests and was discarded, then the web artifact was rebuilt before the green production runs.
- This was an out-of-plan authentication UX correction requested by the user; Phase 2 was not started. **Next session remains Phase 2 unit 2.1 only.**

### 2026-07-29 — Sentry access-interrupt noise fix (user-requested)

- Inspected the newest unresolved production issue, Sentry `VFURST-D` (issue `7639998311`, event `2b7c2f24207645919844d83a614772bd`) on release `ed8ca4f5a6da44b586c91b04fa4940250ddc6108`. It reported `NEXT_HTTP_ERROR_FALLBACK;403` as an unhandled `/dashboard` Server Component exception even though Next.js correctly converted that control-flow interrupt into the intentional access-denied response.
- Added one shared `beforeSend` filter to the web runtime's server, edge, and browser Sentry initialization. It suppresses only errors carrying an exact Next.js access-fallback `digest` for HTTP 401, 403, or 404; matching message text without that digest, malformed digests, 500s, and unrelated application exceptions remain reportable.
- Confirmed that the installed Sentry Next.js SDK 10.63.0 and the current upstream helper exclude redirects and 404s but do not yet classify 401/403 access interrupts, so a package-only upgrade would not correct this report. Added 11 focused regression cases covering accepted and rejected values plus event preservation.
- Required session gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **190/190**, including the new **11/11** filter cases), and build **10/10**. The build retained only the known BullMQ dynamic-dependency warning, Webpack serialization notices, Serwist informational output, and Next's deliberate experimental `authInterrupts` banner.
- This was an out-of-plan observability correction requested by the user; it does not change the dashboard's intended 403 behavior. **Next session remains Phase 2 unit 2.1 only.**

### 2026-07-29 — Organizer access-denied screen (user-requested)

- Replaced the dashboard layout's generic 404 for authenticated accounts without `OWNER`/`ADMIN` membership with Next.js' authenticated `forbidden()` interrupt and a branded 403 screen. The screen carries a large warning mark, the signed-in email, an actionable explanation of how organizer access is granted, and links back to `/account` or the product home.
- The guard now treats both public users and `MEMBER`-only users consistently while preserving the existing platform-admin redirect and owner/admin workspace. Cross-tenant owner/admin resource lookups continue to use their page-level 404 guards; the new 403 reveals no tenant inventory.
- Browser QA against the local production artifact covered 320, 375, 414, and 768 px widths: the warning hierarchy, responsive one/two-column layout, long email wrapping, and single-line action labels rendered without horizontal overflow. The temporary preview user was removed afterward.
- Focused tenant-containment E2E passed **4/4** in production mode and again **4/4** in dev mode, covering platform admin, owner, member-only, and public-account paths. The local SePay reconciliation credential continued to return the known HTTP 401 warning outside the exercised flow.
- Required session gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**), build **10/10**, prestart/schema preparation, and host probe **200/200/200/200/400**. Build output retained the known BullMQ dynamic-dependency and cold-cache Webpack serialization warnings; Next also reports the deliberately enabled `authInterrupts` API under its experimental “use with caution” banner.
- This was an out-of-plan UX correction requested by the user; Phase 2 was not started. **Next session remains Phase 2 unit 2.1 only.**

### 2026-07-29 — Production dashboard access diagnostic (user-requested)

- Used the production browser flow at `https://vfurst.reyuugames.com`: credential authentication succeeded and the session rendered `/account` for the expected user, with no browser console warnings or errors.
- The post-login default redirect to `/dashboard` rendered the intentional Next.js 404 because this account has no organization membership and is not a platform administrator. This matches `apps/web/src/app/dashboard/layout.tsx`; it is not evidence of a missing production route or deployment crash.
- Coolify and Sentry were not opened because the authenticated account page and the repository access guard supplied sufficient evidence. No application code or production data was changed. **Next session remains Phase 2 unit 2.1 only.**

### 2026-07-29 — Phase 1 verification/security closeout (complete)

- Completed the full plain-`npm run dev` walkthrough against the local Docker stack: duplicate signup retained values and rendered inline; wrong-password login stayed inline and the retry succeeded; `/account` rendered all six summary categories; central and tenant-host portals rendered; invalid registration voucher and invalid store discount stayed inline; free registration, central checkout, hotel booking, required volunteer-field validation, and organizer login/logout all behaved as specified. The browser console had no error-level entries and no blank Application Error surfaced.
- The free registration generated exactly the expected confirmation and payment-receipt messages in Mailpit. All temporary attendee, order/cart, registration, hotel, product, department, and application data created for the walkthrough was removed; the final fixture cleanup dry-run found **0 organizations / 0 users / 0 outbox events**.
- Exact plain-dev host probe passed **200/200/200/200/400** for `localhost`, `www`, `console`, `app`, and malformed `foo_bar.localhost`. The web app and worker stayed running through the walkthrough; the worker's configured local SePay reconciliation credential returned HTTP 401, an environment warning outside the exercised zero-dollar flows.
- After the reviewed dependency changes and a clean `npm ci`, the complete repository gates passed again: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**, DB **52/52**, auth **67/67**), build **10/10**, split topology **5/5**, and boot-config smoke. The build retained the known BullMQ dynamic-dependency warning; a cold cache also emitted Webpack serialization-performance notices and Serwist informational output.
- Production E2E on the remediated Next.js artifact passed **118/118, 0 failed, 0 did not run** with one worker against a dedicated temporary PostgreSQL database. Its final cleanup dry-run found **0 organizations / 0 users / 0 outbox events**, and the isolated database was deleted. An earlier post-upgrade attempt exited before running a test because boot-config had replaced the production `.next` artifact; rebuilding `@vfurst/web` restored `BUILD_ID`, so that precondition miss is not claimed as test evidence. The preceding four-worker attempt reproduced the documented registration-policy timeout at the approval click and is likewise not claimed as green.
- Registry-backed remediation upgraded Auth.js to `next-auth` 5.0.0-beta.32 / `@auth/core` 0.41.3 / Prisma adapter 2.11.3, pinned one hoisted Next.js 15.5.22 across the root peer and all three runtimes, moved PostCSS to 8.5.18 and sharp to 0.35.0, resolved `brace-expansion` to 5.0.8 and `fast-uri` to 3.1.4, and upgraded ESLint to 10.8.0 with `@eslint/js` 10.0.1 to remove the obsolete minimatch/brace 1.x chain. No `npm audit fix --force` or advisory acceptance/defer was used.
- ESLint 10 exposed two real compatibility findings: the worker now preserves caught causes when reporting badge-job failures, and the account raffle page no longer carries an overwritten initial assignment. Focused lint passed after both corrections, followed by the complete gates above.
- The clean install reported no unreviewed install-script warning; `npm ls` resolved a coherent tree; an independent `npm audit --audit-level=moderate --json` reports **0 vulnerabilities at every severity**. The earlier offline dry-run's empty advisory cache remains explicitly discarded and is not used as evidence.
- Both Node 24 bookworm production images built successfully. A post-build smoke initially proved that Next standalone tracing omitted sharp 0.35's split libvips package; `docker/web.Dockerfile` now carries the Linux builder's `@img` native packages into the runner. The rebuilt container loads **sharp 0.35.0 / libvips 8.18.3 on linux-x64**, and the worker image also builds cleanly.
- With the dependency blocker removed, the launch checker returns only the existing **10 Phase-6/external failures**: Stripe configuration (2), Sentry configuration (5), externally verified beta conventions (1), physical screen-reader evidence (1), and `VFURST_LAUNCH_URL` live verification (1). Those items continue to block public launch but do not block Phase 1.
- Phase 1 exit evidence is complete: Batches 1–5 are closed, Batch 6 remains explicitly deferred/frozen, the host probe is **200/200/200/200/400**, the eight-step plain-dev walkthrough has no blank Application Error, open-redirect write/read regressions are in the green full suite, all repository gates are green, and the moderate-level dependency audit is clean. **Next session starts Phase 2's first numbered unit only; do not start Batch 6 or split-runtime cutover work.**

### 2026-07-29 — Git branch cleanup (user-requested)

- Audited all local and `origin` branches against `main` and `staging`. Nine historical work-branch tips had trees identical to their merged commits, and `codex/operational-calm-rebuild` was already contained in both retained branches.
- Preserved the only unmerged work, `d0d073b` (`docs(plan): refresh readiness status`), by fast-forwarding local `staging` before deleting its source branch. Fast-forwarded local `main` to `origin/main`.
- Deleted 11 obsolete local branches and all 8 obsolete remote branches. Only `main` and `staging` remain locally and on `origin`; the untracked `.claude/` directory was left untouched.
- This maintenance-only session did not change application behavior or run verification gates. **Next session remains Phase 1 verification/security closeout only**: dependency remediation/acceptance plus the complete plain-`npm run dev` walkthrough.

### 2026-07-29 — Current-state documentation audit (user-requested)

- Re-ran `npm audit --audit-level=moderate`: **9 vulnerabilities (7 high, 2 critical)** remain across Auth.js (`@auth/core` through `next-auth`/the Prisma adapter), Next.js, `postcss`, `sharp`, `brace-expansion`, and `fast-uri`. The non-forced audit path reports fixes for the Auth.js/transitive utility chains; the Next.js/postcss/sharp chain requires a reviewed Next upgrade outside the currently stated dependency range.
- Re-ran `npm run check:launch`: **10 automated launch checks fail** — Stripe configuration (2), Sentry configuration (5), two externally verified beta conventions (1), physical screen-reader evidence (1), and `VFURST_LAUNCH_URL` live-route verification (1). Repository artifacts, DB/Redis/email-encryption configuration, connection budget, rate-limit quotas, security-audit status, and the recorded load proof pass the checker.
- Normalized active launch documentation from retired “Phase 7” naming to plan-v2 Phase 6, made the readiness checker require the current launch-load pass statement, and separated its automated checks from mandatory manual evidence it does not parse (deployed persona/tenant matrix, SePay Sandbox, physical badge output, production transactional email, split-runtime cutover decision, and deployed full-system audit rerun).
- Updated the runtime defect audit to reflect the deployed credential-login behavior: expected `AuthError` returns inline action state after `unstable_rethrow`, while successful Auth.js/Next redirects remain control flow. The previous query-redirect path is retained only as historical session evidence in this file.
- No phase status changed. **Next session remains Phase 1 verification/security closeout only**: dependency remediation/acceptance plus the complete plain-`npm run dev` walkthrough. Phase 2 and split-runtime Batch 6 remain blocked/frozen.


### 2026-07-28 — Corrective staging/Coolify deployment hardening (user-requested)

- Reworked `staging-deploy.yml` into independent web/worker matrix jobs (`fail-fast: false`). Both hooks are attempted after green staging CI; missing/malformed secrets fail visibly; `401`/`403` and other permanent `4xx` responses stop immediately with the Coolify response body, while network failures, `408`/`425`/`429`, and `5xx` retry up to three times. Removed the ignored `ref`/`commit` JSON payload and documented that the configured Coolify branch is authoritative.
- Replaced the invalid npmrc scoped `allow-scripts` entries with npm's supported, version-pinned root `allowScripts` policy for all seven applicable Linux dependencies. A Node 24/npm 11.16 Docker dependency build reports **no unreviewed install scripts**; the obsolete `.npmrc` warnings are gone.
- Hardened both native Dockerfile builds: recursive Docker ignore rules now exclude generated/nested `.env*` files, OpenSSL/CA certificates are present for Prisma in build and runtime stages, `SOURCE_COMMIT` is carried into build/runtime metadata, worker health defaults to port 3100, and the web standalone entrypoint runs the repository's required-env validation before listening.
- Replaced the stale GHCR/Docker Image runbook with the actual Git-repository + Dockerfile Coolify setup. It now distinguishes Next public build variables from backend runtime secrets, lists the complete web/worker startup contracts, fixes the control-plane channel, records database preparation, token recovery, default-branch workflow requirement, retry semantics, and smoke checks.
- Verification: actionlint **clean** for both workflows; local fake-Coolify smoke proved `403` makes exactly one request and `200` succeeds with its response body. Host `npm ci` passed. Forced repository gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**), build **10/10**; the final metadata-only rerun also passed **9/9, 9/9, 14/14, 10/10**. The known BullMQ warning and offline local-service `ECONNREFUSED` build noise remain unchanged.
- Docker verification: final web and worker images built successfully; the corrected web dependency stage had no pending install-script approvals; starting either image without production env exits early with the expected web contract report / `WorkerConfigurationError`. No Coolify hook was called and no token was read during verification.
- Remote rollout completed through [PR #10](https://github.com/kazeous/vFurst/pull/10) on `staging` (`4a0762d`), workflow-only [PR #11](https://github.com/kazeous/vFurst/pull/11) on `main` (`a0cb16e`), and progress [PR #12](https://github.com/kazeous/vFurst/pull/12) on `staging` (`4464590`). Staging CI #85 passed.
- Staging deploy #12 attempt 6 accepted both hooks with HTTP 200: web deployment `ymcrogsveew6r86v6s7hu459` and worker deployment `qnlaqkegt4gw6e7gst3g8abe`. After rollout, the public web smoke returned root 200 and health 200 with PostgreSQL/Redis both `ok`; the unauthenticated public API probe correctly returned 401.
- Cloudflare's basic Bot Fight Mode was the source of the earlier GitHub-runner Managed Challenges; it was disabled after a narrow host + POST + `/api/v1/deploy` WAF skip proved unable to bypass that product. The Coolify hostname remains orange-cloud proxied, so the VM origin was not exposed.
- Coolify attempt-5 logs also exposed two independent runtime blockers: missing required web variables and worker DNS failures to PostgreSQL/Redis. The user added the required web contract values and connected both applications to the predefined Coolify network before attempt 6.
- Because the old workflow reported success immediately after queueing, [PR #13](https://github.com/kazeous/vFurst/pull/13) synced rollout polling to `main` after green CI #86. The staging copy now parses each deployment UUID, waits for Coolify's terminal status, and fails on `failed`, `cancelled-by-user`, unexpected status, or timeout instead of producing a false green.
- Coolify runtime recovery then set web `AUTH_TRUST_HOST=true`, enabled source-commit build metadata for both applications, corrected the worker's PostgreSQL/Redis URLs with the exact working web credentials, and kept both applications on the predefined `coolify` network. The standard payment-lock preparation, Prisma push, and tenancy/payment backfills bootstrapped the empty staging database; no data-loss flag was used.
- Staging deploy #13 attempt 5 was the first fully converged rollout on `e6b0b96`: web deployment `xsrnk4pcs61gx5kbz11uxw4t` and worker deployment `njrge07wam62cnta3xmxl0vv` both finished, with the worker healthy after the schema bootstrap.
- Staging browser smoke then exposed a separate auth UX defect: a handled wrong-password redirect briefly rendered Next's 404 through the production proxy, although a hard reload showed the intended alert. [PR #15](https://github.com/kazeous/vFurst/pull/15) moved expected credential failures into `useActionState`, retained `unstable_rethrow` ahead of Auth.js error mapping so successful redirects remain intact, and updated the retry regression.
- Local verification for the auth fix passed web type-check, lint, **179/179** unit tests, and focused Playwright **1/1** (wrong-password inline alert followed by a successful retry). PR CI #90 and post-merge staging CI #91 both passed; PR #15 merged as `379173b`.
- Staging deploy #14 finished both matrix jobs on the exact merge commit: web `g97lt1ev29h3o1dgqiz1yaak`, worker `nko27nfy3s9a78aydkunp5im`. Coolify showed both applications Running/healthy; public health and Auth.js session returned 200, health reported PostgreSQL/Redis `ok` at `379173b`, and the live wrong-password probe stayed on `/login`, rendered the accessible alert, and did not render a 404.
- This was an out-of-plan corrective unit requested by the user; Phase 1 status is unchanged. **Next session must resume Phase 1 verification/security closeout only** (dependency advisory triage plus the plain-dev walkthrough); do not start Phase 2 or Batch 6.
- Progress [PR #16](https://github.com/kazeous/vFurst/pull/16) merged as `c16a44f`; CI #93 passed and the final docs-only staging deploy #15 finished web `lyep33o6541qlq1at9hsqowf` plus worker `g5x3posjpw2ymw3kjf1o5cun` on that exact commit. Final health/session and wrong-password smoke remained green.

### 2026-07-27 — Phase 1 unit 1.6: developer boot configuration smoke (TST-02)

- Closed TST-02 with `scripts/smoke-web-boot.mjs` and root `test:boot-config`. The smoke removes all app-contract keys from the process environment, requires the real `predev` env sync and ENV-01 startup assertion, boots a development Next server, and restores the generated web/worker env files exactly.
- CI now runs the smoke after unit tests and before `build`. Linux CI exercises the exact workspace `npm run dev` lifecycle; the controlled Windows path exercises the same `predev` assertion and Next development boot without leaving a detached process tree.
- Focused smoke passed without injected app env. Repository gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**, DB **52/52**, auth **67/67**), build **10/10**, split-topology **5/5**; only the known BullMQ warning remains.
- Full production E2E on the final application build passed **118/118, 0 failed, 0 did not run** with one worker. An earlier four-worker attempt had four concurrency/server-instability failures and is not claimed as green.
- `npm run check:launch` ran and remains red only on ten Phase-6 deployment/external checks (Stripe/Sentry configuration, beta and screen-reader evidence, live URL). `npm audit --audit-level=moderate` failed with **33 vulnerabilities: 31 high, 2 critical**; several Auth.js/Next.js advisories report no fix. No dependency change was made because it is outside TST-02.
- TST-02 is complete, but Phase 1 is **not** marked complete: the dependency audit is red and the full plain-`npm run dev` walkthrough is not yet recorded. **Next session must perform Phase 1 verification/security closeout only; it must not start Phase 2, Batch 6, split hardening, or cutover work.**

### 2026-07-27 — Phase 1 unit 1.5: organizer/platform residual actions and routing hygiene (audit Batch 5)

- Closed ERR-03 remainder, ERR-05, and RTE-03/05/08/09/10. Organizer/platform residual forms now share structured action state with a centralized `unstable_rethrow` guard: expected validation/race conditions render inline, retain values, disable while pending, and never become a masked production 500.
- Converted the audited event, voucher, hotel-block, store-product, badge-upload, member-invitation, organization/domain/lifecycle, raffle-draw, payout, email-replay, and vendor booth-payment flows. Unique/race paths (voucher duplicate, already-member, replay queued, DNS pending, draw exhausted, payout arithmetic, vendor approval race) are covered; tenant/payment invariants still throw.
- Routing now treats LAN/private/machine hosts as platform only outside production, uses `slug` rather than `subdomain` for central portal roots, rewrites dotted application paths unless the last segment has a known asset extension, keeps one middleware implementation, and rejects reserved organization slugs.
- Final bare-throw sweep: **72** action-layer sites, all classified in the audit outcome as binding security/payment invariants, authorization/state-transition guards, or lower-priority sites outside the exact Batch-5 P1/P2 register. No unreviewed ERR/RTE P1/P2 site remains.
- Plain host probe: **200/200/200/200/400**. Focused unit coverage **61/61**; staff/vendor residual E2E **6/6**; split-topology canary **5/5**. Docker/prestart passed with the schema already in sync.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **179/179**, DB **52/52**, auth **67/67**), build **10/10** packages; only the known BullMQ warning remains.
- Full production E2E on the final build: **118 passed / 0 failed / 0 did not run**. The documented registration-policy contention timeout reproduced once under four workers, then passed 3/3 in isolation and in the clean one-worker full run.
- **Next session must perform only unit 1.6 / TST-02.** Audit Batch 6 and all split-runtime hardening/cutover work remain untouched and frozen.

### 2026-07-27 — Phase 1 unit 1.4: data model and test integrity (audit Batch 4)

- Closed DAT-01, TST-01, and TST-03. The control-plane outbox FK now uses `ON DELETE SET NULL`; an organization with a lifecycle event can be deleted while its event survives with `organizationId = null`, and event receipts remain correctly owned by the surviving event.
- Updated the two stale hero accessible-name assertions and four stale visual baselines discovered by the full accessibility smoke: marketing reflects the earlier removal of “Live”, while registrations reflects the existing approval-column/“Approve selected” UI.
- Added a guarded fixture-prefix cleanup utility with dry-run/apply entry points and **19/19** unit tests. The load-proof runner invokes it before building/seeding. The local purge matched **0 organizations / 0 users / 0 outbox events** because the plan rebuild had already reset accumulated fixtures; post-suite DB checks still show zero matching fixture organizations/users.
- `prestart` passed twice consecutively (first synchronized the FK, second reported the schema already in sync). The DAT deletion regression passed, and the actual PostgreSQL constraint was confirmed as `ON DELETE SET NULL`.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (DB **52/52**, web **160/160**, auth **67/67**), build **10/10** packages, split-topology **5/5**. The only build warning is the known BullMQ dynamic-dependency warning.
- Full production E2E: **114 passed / 0 failed / 0 did not run**. Batch 5 was deliberately untouched.

### 2026-07-27 — Phase 1 unit 1.3: routing and checkout safety (audit Batch 3)

- Closed RTE-01/02/04/06/07 and CHK-01/02. Canonical/configured platform hosts are classified consistently; malformed hosts return a no-store 400; forged `x-vfurst-*` input is scrubbed and internal tenant metadata is no longer echoed in public response headers.
- Tenant-host store checkout now moves to the central checkout surface and returns to a central-path portal receipt. Checkout return paths use the strengthened shared local-path policy at write time and safe fallback at both read surfaces, including encoded slash/backslash/control-character variants.
- Portal “Powered by vFurst” and Privacy links resolve to the central host. Dashboard logout is an Auth.js server action that clears the session and returns to `/`.
- Exact plain-dev host probe: **200/200/200/200/400**. New focused E2E **5/5**; existing store authorization regression **4/4**; split-topology **5/5**. Plain-dev browser walkthrough confirmed central footer links and logout behavior.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **160/160**, auth **67/67**), build **10/10** packages; only the known BullMQ warning remains.
- Batch 4 was deliberately untouched. Full E2E was not rerun and no green claim was made; DAT-01/TST-01/TST-03 remain the next unit.

### 2026-07-27 — Phase 1 unit 1.2: public-flow structured errors (audit Batch 2)

- Closed ERR-03 (public subset) and ERR-04. The audit's "Batch 2 outcome" section carries the full conversion table and evidence.
- Added the `PublicFormState`/`PublicActionError` contract; converted registration, store add/cart/checkout, voucher apply, hotel booking, volunteer, and vendor submissions to `useActionState` with controlled client forms — invalid input renders inline, entered values are retained, submits disable while pending, and success-path `redirect()` still works through the `…Inner` + `unstable_rethrow` wrapper (ERR-05 guard landed in every converted file).
- Transfer accept/decline became redirect-with-notice: expired/used/invalid/policy outcomes land back on the decision page showing the refreshed request state; the ERR-04 revalidate-then-throw sites are gone.
- New `tests/e2e/public-flow-errors.spec.ts` (6 cases incl. the double-submitted transfer decision); `error-visibility.spec.ts` updated — voucher case asserts inline + retained values, boundary regression re-anchored to the unconverted duplicate-member invite (Batch 5). 9/9 dev mode and 9/9 production mode (structured messages are not masked in production — that is the point of the pattern).
- Touched-flow regressions green in isolation: policy 3/3, hotel 3/3, transfer/store/staff-vendor 13/13, account-registration 1/1. The six-file four-worker run reproduced the two documented contention flakes (policy deadlock at :121, hotel 120 s test timeout); both pass alone, matching pre-batch behavior. Repository gates 37/37.
- `payVendorBooth` and organizer/platform action families intentionally remain throwing until Batch 5; the dashboard boundary from Batch 1 covers them meanwhile.

### 2026-07-26 — Phase 1 unit 1.1: error visibility (audit Batch 1)

- Closed ERR-01 and ERR-02. The audit's "Batch 1 outcome" section carries the full change list and evidence.
- Added the shared `RouteError` boundary component and an `error.tsx` per surface (root, `(auth)`, `(marketing)`, `(convention)/[orgSlug]`, `account`, `dashboard`, `platform`, `checkout`); rewrote `global-error.tsx` with real copy while keeping its Sentry capture. Thrown action errors now render a readable, retryable page with a digest reference instead of a blank "Application error".
- `/login` no longer 500s on a wrong password: the inline server action catches `AuthError` and redirects to `/login?error=invalid_credentials` preserving `returnTo`; the page renders the accessible alert (platform-manager pattern).
- Added `tests/e2e/error-visibility.spec.ts`: wrong-password (no ≥500 responses, alert, `returnTo` preserved on success) and invalid-voucher boundary + working "Try again". Passed 3/3 dev-mode together with `account-registration.spec.ts`, and 2/2 in production mode where server messages are masked.
- Gates: `turbo run type-check lint test` 32/32; `turbo run build` 10/10 (known BullMQ warning). Full E2E not re-run this session — Batch 4 owns making it green; no pass claim recorded.
- Flake note for later specs: with a cold `.next`, dev-server compile latency can outlast Playwright's 5 s expect timeout; wait on the action's POST response (`waitForResponse`) before asserting, as the existing policy spec does.

### 2026-07-26 — Plan v2 rebuild (docs only; no application code changed)

- Compared the implemented product against ConCat's full public documentation and live-instance screenshots; recorded the result as `docs/plan/02-concat-parity.md` with stable backlog IDs (REG-P*/STO-P*/EVD-P*/RAF-P1).
- Rebuilt the plan around reality: `docs/plan/00-reference.md` (contracts, v2), `01-current-state.md` (verified baseline), phases 1–6 (stabilize → attendee parity → commerce parity → event-day parity → registration lottery → launch), and a consolidated `verification.md`.
- Deleted the retired plan set (phases 0–7, verification-and-timeline) and the fully superseded `docs/launch/product-gap-audit-2026-07-16.md`; kept `runtime-defect-audit-2026-07-26.md` (active Phase 1 register), the launch evidence docs, and the split-architecture records (split now frozen by standing decision).
- Rewrote `AGENTS.md` and `.agents/commands/start-phase.md` for the new structure; `PROGRESS.md` restarted (this file).
- Cleared derived caches (`.turbo`, per-app `.next`, Playwright artifacts, `node_modules/.cache`) and reset the local Docker volumes (Postgres/Redis/MinIO/Mailpit) to purge 72 orgs / 68,056 users of fixture residue; re-provisioned the schema via the standard prestart chain.
- Environment note: the `docker compose` plugin works on this machine now (verified this session); the old "legacy docker-compose only" note no longer applies.
- No gates were re-run after the cache/DB reset in this session. Next session must start with unit 1.1 and treat the first full-gate run as the fresh baseline.
