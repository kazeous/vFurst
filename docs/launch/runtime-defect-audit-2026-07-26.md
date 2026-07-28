# Runtime defect audit and remediation plan — 2026-07-26

## Purpose and verdict

This document records a whole-system audit performed against the **running application**, not only against source code. It exists because the product owner reported persistent server errors, redirect errors, and broken functionality while using the app locally, at a point where `PROGRESS.md` claimed the repository was in good health.

**Verdict: the repository's automated gates are green and the source logic is largely correct. The reported breakage is real, and it comes from two systemic causes, not from scattered feature bugs.**

1. **No Next.js application in this monorepo loads any `.env` file.** The env files live at the repo root; Next.js reads them from the app directory. Nothing calls `dotenv`. The E2E runner passes environment variables directly through `spawn`, which is why the automated suite never observed this. Manual `npm run dev` runs with almost no configuration.
2. **Server Actions throw plain errors for ordinary user conditions, and the only error boundary in the repository renders no message.** Every recoverable mistake — a wrong password, a mistyped voucher, a sold-out tier — becomes a blank "Application error" page.

Everything else found is real but secondary, and several items are consequences of these two.

This audit does **not** reopen the external launch evidence gates already tracked in `go-live-checklist.md`, `beta-program.md`, `sepay-rollout.md`, and `accessibility-audit.md`. Those remain open and unchanged.

## Evidence base

All findings below were reproduced or verified directly on 2026-07-26 against the local Docker Compose stack (PostgreSQL, Redis, MinIO, Mailpit) with the schema synchronised via `npm run prestart --workspace @vfurst/web`.

| Check | Result |
|---|---|
| `turbo run type-check` | Pass (9/9 tasks) |
| `turbo run lint` | Pass (9/9 tasks) |
| `turbo run test` | Pass (14/14 tasks; 133 web unit tests) |
| `turbo run build` | Pass (10/10 packages); the known BullMQ dynamic-dependency warning remains |
| `E2E_PRODUCTION=1 npm run test:e2e` (full suite) | **91 passed, 4 failed, 4 did not run** |
| Browser walkthrough (register → login → account → public portal → registration flow) | Two blank-error-page failures reproduced |
| `curl` host-classification probes against `next dev` | Reserved subdomains and LAN hostnames return 404; underscore hostname returns 500 |
| Controlled re-run with environment injected on a second port | Tenant subdomain routing returns **200**, proving the routing code is correct and the environment is the fault |

The static code sweep behind the severity counts covered `apps/web/src/actions/**` (181 `throw new Error`, 128 bare `.parse()`), all `route.ts` handlers, all `(auth)`/`(convention)`/`account`/`dashboard`/`platform`/`checkout` route groups, `apps/platform-manager/**`, `apps/tenant-web/**`, `packages/auth`, `packages/tenant-context`, `packages/contracts`, and `scripts/split/**`.

## Severity model

| Level | Meaning |
|---|---|
| **P0** | Blocks normal use of the application, or is a security defect. Fix before any other work. |
| **P1** | Ordinary user input produces a server error or a wrong destination. |
| **P2** | Race condition, stale-tab, or operator-only path produces the same failure. |
| **P3** | Correctness or hygiene issue with no current user-visible impact. |

Findings that are **intentional design** are listed in "Do not change" at the end. Cross-tenant authorization throws are deliberate and must keep throwing.

---

# Defect register

## ENV — Environment and configuration

### ENV-01 — No application loads an `.env` file (P0)

**Symptom.** Running `npm run dev` and using the app produces server errors on every paid flow, 404 on every tenant subdomain, and a worker that never starts.

**Root cause.** Next.js loads `.env*` from the project directory it is invoked in. `apps/web/`, `apps/worker/`, `apps/platform-manager/`, and `apps/tenant-web/` contain **no** `.env` or `.env.local` file — only `apps/platform-manager/.env.example` and `apps/tenant-web/.env.example`. The real files are `D:\GitHub\vFurst\.env` and `.env.local` at the repo root, and no code in the repository calls `dotenv` or `loadEnvConfig`. Turborepo does not inject env files either. The only reason database access works at all is that `packages/db/.env` exists and the Prisma CLI/client picks it up.

**Evidence.**

- `npm run dev` then `curl -H "Host: registration-org-a-1784211024827-24552.localhost:3000" http://127.0.0.1:3000/` → **404**.
- The same request against a second `next dev` started with `NEXT_PUBLIC_ROOT_DOMAIN=localhost` injected → **200**.
- The dev server log shows `Shared rate limit unavailable for payment:registration. Error: REDIS_URL is required for shared rate limiting.` while root `.env` defines `REDIS_URL=redis://localhost:6379`.
- `apps/worker` exits at startup with `WorkerConfigurationError` naming eight missing variables.

**Consequences, each independently reported as a bug.**

| Missing variable | Observed failure |
|---|---|
| `NEXT_PUBLIC_ROOT_DOMAIN` | Falls back to `vfurst.reyuugames.com` (`apps/web/src/lib/tenant-host-policy.ts:3`). Every tenant subdomain 404s locally. |
| `REDIS_URL` | `apps/web/src/lib/redis-rate-limit.ts:71` throws; the rate limiter fails closed, so registration, cart checkout, hotel booking, and vendor booth payment all 500. |
| `VFURST_DB_CONNECTION_LIMIT`, `VFURST_DB_POOL_TIMEOUT_SECONDS` | Prisma runs unbounded; the connection budget contract in `00-reference.md` is not applied. |
| `EMAIL_DELIVERY_ENCRYPTION_KEY` | Worker refuses to start; no email, badge, webhook, or reconciliation job runs. |
| `AWS_*`, `S3_BUCKET_NAME` | Same worker startup failure; uploads unverifiable. |
| `NEXT_PUBLIC_APP_URL`, `AUTH_URL` | Absolute redirects fall back to hardcoded `http://localhost:3000` (`central-url.ts:4`, `payments/stripe.ts:18`, `stripe-actions.ts:92`, `organization-invitation-email.ts:5`). If the dev server takes another port, login and checkout redirect to a dead port. |

**Fix.**

1. Create `apps/web/.env.local` and `apps/worker/.env` (both git-ignored), or add an explicit loader to the dev scripts that reads the repo-root file. Prefer per-app files: it matches how each app already validates its own environment, and it keeps the split runtimes independent.
2. Add the variables that are missing from the root `.env.local` entirely: `EMAIL_DELIVERY_ENCRYPTION_KEY` (base64 32-byte), `CHECKOUT_TOKEN_SECRET`, `SEPAY_ENV`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_API_TOKEN`, `SMTP_SECURE`, `SALES_CONTACT_EMAIL`, `NEXT_PUBLIC_MANAGER_URL`, `NEXT_PUBLIC_CONSOLE_URL`, `NEXT_PUBLIC_API_URL`.
3. Add a startup assertion in `apps/web` equivalent to `apps/worker/src/env.ts`, so a missing variable fails loudly at boot instead of silently degrading to a production-domain fallback.
4. Remove or implement `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL`. They are defined in all three env files, point at `/api/stripe/return` and `/api/stripe/refresh` which do not exist, and are read nowhere — the real values are built inline at `stripe-actions.ts:95`.

**Verification.**

```bash
npm run dev
```

- `curl -H "Host: <activeOrgSubdomain>.localhost:3000" http://127.0.0.1:3000/` returns 200 and renders that organization's portal.
- The dev log contains no `REDIS_URL is required` line, and `docker exec vfurst-redis-1 redis-cli --scan --pattern '*rate*'` shows a key after one registration attempt.
- `@vfurst/worker:dev` reaches its ready state instead of `WorkerConfigurationError`.
- Registering for a free tier completes and the confirmation email appears in Mailpit at `http://localhost:8025`.

### ENV-02 — `.env.example` documents variables that no `.env.local` carries (P2)

`CHECKOUT_TOKEN_SECRET` and `EMAIL_DELIVERY_ENCRYPTION_KEY` are required by the documented contract in `00-reference.md` but absent from the working local file. `packages/db/.env` duplicates `DATABASE_URL` with a different lifecycle from the root file, so the two can silently diverge. Fold this into the ENV-01 fix and note the ownership of each file in `README`/`AGENTS.md`.

---

## ERR — Error handling and production 500s

### ERR-01 — The only error boundary renders no message (P0)

**Root cause.** `apps/web/src/app/global-error.tsx:15` renders `<NextError statusCode={0} />`. There is no `error.tsx` and no `not-found.tsx` in **any** route group — not `(auth)`, `(marketing)`, `(convention)`, `account`, `dashboard`, `platform`, or `checkout`. Every thrown error escalates to that boundary, which displays "Application error: a client-side exception has occurred" and nothing else.

**Why it multiplies every other defect.** 118 form bindings across the app pass a Server Action straight to `action={...}`; only three forms use `useActionState` (`register-form.tsx`, `api-key-create-form.tsx`, `webhook-create-form.tsx`). So a thrown error has no local surface and no global message. Careful, user-friendly error strings exist throughout the action layer and **none of them can reach a user**.

**Fix.** Add an `error.tsx` per route group that renders the message, a retry control, and a route-appropriate escape hatch (back to portal / back to dashboard / back to account). Keep `global-error.tsx` for the truly unrecoverable case, but give it real copy instead of `statusCode={0}`. This is one file per group and converts roughly 180 blank pages into readable, retryable ones before any action is rewritten.

**Verification.** Trigger any known-throwing action (an invalid voucher is the quickest) and confirm the page shows the message and a working retry, and that Sentry still receives the exception.

### ERR-02 — A wrong password on `/login` returns HTTP 500 (P0)

**Reproduced.** Submitting a valid email with a wrong password produced `POST /login?registered=1&returnTo=%2Fdashboard 500` and a blank page.

**Root cause.** `apps/web/src/app/(auth)/login/page.tsx:14-22` defines `loginWithCredentials` with no `try`/`catch`. `authorize()` in `lib/auth.ts` returns `null` for a bad credential, which makes Auth.js v5 `signIn` throw `CredentialsSignin`. Nothing catches it, and `LoginPage` has no `error` search-param handling.

**Fix.** Handle credentials through client form action state. The server action must call `unstable_rethrow(error)` first so successful Auth.js/Next redirects remain framework control flow, then map expected `AuthError` to the accessible inline credential message and rethrow anything else so real failures still reach Sentry. This supersedes the initial query-redirect implementation, which produced a transient client-router 404 behind the staging proxy even though a hard reload rendered the intended page.

**Verification.** Wrong password stays on `/login`, shows an accessible error, preserves `returnTo`, and the server log records no 500. Correct password still redirects to `returnTo`. Add a Playwright regression alongside the existing auth specs.

### ERR-03 — Ordinary public-flow input produces blank error pages (P1)

**Reproduced.** An invalid voucher code in the registration flow produced a blank "Application error" page. This was re-tested on a server with `REDIS_URL` correctly configured — the rate limiter passed and created its Redis key — so this is an independent defect, not a symptom of ENV-01.

**Root cause.** Expected user conditions are signalled with `throw`. The sweep found **41 P1-class sites** and about 46 P2-class sites. The highest-traffic ones:

| Flow | Location | Condition |
|---|---|---|
| Registration | `apps/web/src/actions/registration-actions.ts:59,63,67,73` | Voucher not found / expired / usage limit reached / wrong tier |
| Registration | `apps/web/src/lib/registration-policy.ts:100` | "That registration tier is sold out." |
| Registration | `apps/web/src/lib/registration-policy.ts:83` | Per-account registration limit reached |
| All paid flows | `apps/web/src/lib/rate-limit.ts:209` | Double-clicking any "Continue to payment" / "Checkout" button |
| All paid flows | `apps/web/src/lib/payments/platform.ts:125` | "Payments are temporarily unavailable for this event." |
| Store cart | `apps/web/src/actions/cart-actions.ts:106,188,277` | Insufficient stock on add, quantity change, and checkout |
| Store cart | `apps/web/src/actions/voucher-actions.ts:174,187,191,195` | Any bad discount code, including an empty submit |
| Hotel | `apps/web/src/actions/hotel-actions.ts:172,186` | Past booking cutoff / room type sold out |
| Volunteer | `apps/web/src/actions/staff-actions.ts:386` | A required custom form field left blank |
| Vendor | `apps/web/src/actions/vendor-actions.ts:184` | Product description shorter than 10 characters |
| Vendor | `apps/web/src/lib/vendor/document-upload-policy.ts` | Wrong file type, size, or signature |
| Transfers | `apps/web/src/actions/registration-transfer-actions.ts:161,251,266,309,326,335` | Clicking an emailed transfer link twice or after expiry |
| Members | `apps/web/src/lib/organization-invitations.ts:58` | Inviting an email that is already a member |
| Raffle | `apps/web/src/actions/phase5-actions.ts:894,921` | Prize fully awarded / no eligible entries left |
| Platform | `apps/web/src/actions/platform-actions.ts:204` | "The required DNS ownership record is not visible yet." |

`organization-invitations.ts:58` deserves emphasis: it is structurally identical to the duplicate-signup bug fixed in commit `aaaa645`, in the same "record already exists" shape, and it was missed by that fix.

**Fix.** Two patterns, both already present in the codebase.

- **Pattern A — structured state.** For forms that stay on the page: exported state type, `(previousState, formData) => Promise<State>` signature, `return` instead of `throw`, plus a `P2002` catch where a unique race is possible. Reference implementation: `apps/web/src/actions/auth-actions.ts:44-102` with `apps/web/src/app/(auth)/register/register-form.tsx`.
- **Pattern B — redirect with an error code.** For actions that must redirect (registration, hotel booking, volunteer/vendor submission, cart checkout), because `useActionState` and `redirect()` do not compose cleanly. Reference implementation: `apps/web/src/actions/invitation-actions.ts:40-53` with `app/(auth)/invitations/[token]/page.tsx:11-17,66`.

Sweep the 128 bare `.parse()` calls to `safeParse` plus a structured return in the same pass.

**Verification.** For each converted action: the invalid input renders an inline message on the same page, the form retains what the user typed, the submit button is disabled while pending, and no 500 appears in the server log. Add one Playwright case per flow (invalid voucher, sold-out tier, insufficient stock, past cutoff, missing volunteer field, already-a-member invite).

### ERR-04 — `revalidatePath` discarded by a following `throw` (P2)

`apps/web/src/actions/registration-transfer-actions.ts:265` and `:333` call `revalidatePath("/account/transfers")` and then `throw`. A throwing Server Action does not flush queued revalidations, so the state change **is** committed to the database but the UI never refreshes — the recipient sees a blank error page for an operation that actually succeeded. Fold into the ERR-03 conversion of that file.

### ERR-05 — No `unstable_rethrow` guard anywhere (P3)

No current instance swallows `NEXT_REDIRECT` — every `redirect()` in the action layer sits outside its function's `try` blocks, verified across `checkout-actions.ts`, `saas-actions.ts`, `org-actions.ts`, and `payment-actions.ts`. But there are zero uses of `unstable_rethrow` or an `isRedirectError` guard, so the first `try { … redirect() … } catch` anyone writes will silently break. Add the guard to the shared error-handling helper introduced by ERR-01/ERR-03 and note it in `AGENTS.md`.

---

## RTE — Routing and redirects

### RTE-01 — Reserved subdomains 404 the entire host (P1)

**Reproduced with `curl`:**

| Host | Result |
|---|---|
| `www.vfurst.reyuugames.com` | **404** |
| `console.vfurst.reyuugames.com` | **404** |
| `app.vfurst.reyuugames.com` | 200 |
| `localhost:3000` | 200 |

**Root cause.** `apps/web/src/lib/platform-hosts.ts:43` accepts only `classifyTenantHost(...).kind === "platform"`. The shared policy returns `"reserved-platform"` for the labels declared at `tenant-host-policy.ts:37` (`api`, `app`, `console`, `manager`, `www`), and the hardcoded set at `platform-hosts.ts:27` contains only the root and `app.<root>`. So `www`, `console`, and `manager` fall through to the tenant branch, become a slug, and 404. This persists after ENV-01 is fixed — `www.localhost:3005` still returned 404 in the controlled re-run.

`console.<root>` is the hostname the split migration plans to serve the organizer console from, so this blocks that cutover as well.

**Fix.** Accept both `"platform"` and `"reserved-platform"` in `isPlatformHostname`, and drive the whole decision from `getTenantHostPolicy()` rather than the parallel hardcoded set.

**Verification.** Re-run the host probe table above; `www`, `console`, and `manager` return 200 on the marketing/platform surface. Add unit cases to `platform-hosts` covering each reserved label plus a genuine tenant subdomain.

### RTE-02 — A malformed `Host` header returns 500 on every URL (P1)

**Reproduced.** `curl -H "Host: foo_bar.localhost:3000" http://127.0.0.1:3000/` → **500**.

**Root cause.** `apps/web/middleware.ts:7` calls `normalizeHostname` with no `try`/`catch`. After the shared-package extraction, that function throws `InvalidTenantHostError` for an empty host, an underscore, a leading-hyphen label, a label over 63 characters, or a control character. The matcher covers essentially every request, so the edge function throws and the whole request 500s. `apps/tenant-web/src/middleware.ts:31-33` already handles this correctly and returns 400.

**Fix.** Wrap `getHostname` in `try`/`catch`, return `400` for `InvalidTenantHostError`, and mirror tenant-web's handling.

**Verification.** The underscore host returns 400, an empty `Host` returns 400, and normal hosts are unaffected. Add a middleware unit test per malformed shape.

### RTE-03 — Non-`localhost` development hostnames 404 (P2)

`192.168.1.20:3000` → 404 and `MY-PC:3000` → 404, both reproduced. `platform-hosts.ts:27` recognises only `localhost` and `127.0.0.1` as loopback aliases; a LAN IP passes DNS-label validation and is treated as a custom domain. This blocks testing from a phone or tablet on the same network. `scripts/split/host-routing.mjs:54` already lists `[::1]` — align the two. Add `::1`, `0.0.0.0`, private-range IPv4 literals, and the machine hostname when `NODE_ENV !== "production"`.

### RTE-04 — Portal footer links break on tenant hosts (P2)

`apps/web/src/components/convention/portal-shell.tsx:62` renders `<Link href="/privacy">`. On a tenant subdomain or custom domain, middleware rewrites `/privacy` to `/{slug}/privacy`, which has no route → 404. The same line's "Powered by vFurst" link to `/` silently returns to the portal home instead of the marketing site. Line 38 in the same file shows the correct pattern (`getCentralAppUrl(...)`). Fix both to absolute central URLs.

### RTE-05 — Client-derived portal root breaks when `slug !== subdomain` (P2)

`apps/web/src/lib/portal-path.ts:1-13` returns `""` for any pathname not starting with `/{subdomain}`, and cannot distinguish "on the tenant host" from "on the central host under a different prefix". `getConventionOrg` resolves a segment by **either** `subdomain` or `slug` (`convention.ts:45`), and nothing keeps the two columns equal after creation. For an org with `slug = "my-con"` and `subdomain = "sample-con"`, visiting `/my-con/register` server-renders `/sample-con/...` links while every client component resolves to `/register` — the central signup page. Either enforce `slug === subdomain` at write time, or pass the resolved root from the server instead of re-deriving it on the client.

### RTE-06 — Dashboard "Log out" is a dead-end GET (P2)

`apps/web/src/components/dashboard/app-shell.tsx:293` is `<Link href="/api/auth/signout">`. Auth.js v5 does not sign out on GET and no `pages.signOut` is configured, so the user lands on Auth.js's unstyled built-in confirmation page. `apps/web/src/app/account/layout.tsx:21-24` shows the correct pattern — a server action calling `signOut({ redirectTo: "/" })`.

### RTE-07 — Middleware trusts inbound `x-vfurst-*` headers (P2, security-adjacent)

The platform-host branch at `middleware.ts:14-21` returns `NextResponse.next()` without deleting caller-supplied `x-vfurst-org-host` / `x-vfurst-org-slug` / `x-vfurst-domain-mode`, and `getConventionPortalRootForRequest` (`convention.ts:23`) trusts `x-vfurst-org-host` first. A crafted request therefore controls portal-root generation. `apps/tenant-web/src/lib/request-headers.ts` already implements the scrub and has tests; port it to `apps/web`. The middleware also echoes these values onto the **response**, leaking the resolved tenant host to caches — remove that.

### RTE-08 — Any path containing a dot skips the tenant rewrite (P3)

`middleware.ts:17` uses `pathname.includes(".")` as a static-asset heuristic. A future route segment containing a dot resolves against central routes on a tenant host but works under `/{slug}/…` on the central host. Replace with a known-extension list.

### RTE-09 — Two middleware files (P3)

`apps/web/middleware.ts` and `apps/web/src/middleware.ts` both exist; the latter re-exports the former and is the one Next resolves. Behaviour is identical today, but an edit to the file Next has stopped reading is a silent routing change. Keep one.

### RTE-10 — Reserved slugs are provisionable (P3)

`org-actions.ts:19-25` has no reserved-word blocklist and copies `slug` into `subdomain`. Provisioning `slug = "www"` lets that tenant's portal claim a reserved platform host, while `getConventionUrl(org)` throws `ReservedTenantHostError` and renders a 500 on both the organizer and platform detail pages for that org forever. Add the blocklist from `tenant-host-policy.ts:37` to the slug schema.

---

## CHK — Checkout

### CHK-01 — Store checkout redirects to a non-existent route on tenant hosts (P1)

`apps/web/src/actions/cart-actions.ts:330` issues a **relative** `redirect(checkout.checkoutPath)`. Every sibling flow uses an absolute central URL — `registration-actions.ts:324`, `hotel-actions.ts:236`, `vendor-actions.ts:580` all build `${getBaseUrl()}${checkout.checkoutPath}`. `/checkout/[orderId]` exists only at the central root, so on a tenant subdomain the browser navigates to `https://<tenant>/checkout/<id>`, middleware rewrites it to `/{slug}/checkout/<id>`, and the user gets a 404 with the order left `PENDING` and inventory still reserved.

The same action's `successPath`/`cancelPath` (`store/page.tsx:237`) are computed as `/store` on a tenant host, persisted on the Order, and later consumed **on the central host** by `checkout/[orderId]/page.tsx:47` and `payment-status-poller.tsx:25` — so the post-payment "continue" link 404s too. The sibling flows correctly persist `/${org.subdomain}/…`.

**Fix.** Use `getBaseUrl()` for the redirect and persist central-form success/cancel paths, matching the other three flows.

**Verification.** From a tenant subdomain, complete a store checkout end to end: the checkout page loads, payment settles, and the confirmation link returns to the correct portal page. Repeat from the central `/{slug}/store` path. Add a Playwright case on the tenant host — the existing store specs run on the central path only, which is why this was never caught.

### CHK-02 — Open redirect via checkout return paths (P0, security)

`apps/web/src/lib/payments/checkout.ts:6-12` validates with:

```ts
if (!path.startsWith("/") || path.startsWith("//")) throw …
```

That rejects `//evil.example` but accepts `/\evil.example`, which browsers normalise to `//evil.example`. `successPath` arrives from a hidden form field (`components/store/cart.tsx:130-131`) via `String(formData.get("successPath") ?? returnPath)`, is persisted on the Order, returned by `api/payments/orders/[orderId]/status/route.ts:23`, and executed by `payment-status-poller.tsx:25` through `window.location.assign(...)` — an external navigation from a payment-confirmation page.

The repository already contains the correct guard: `isSafeLocalReturnPath` in `packages/auth/src/core.ts:123-136` rejects `\` and control characters and is correctly applied everywhere else. This one call site bypasses it.

**Fix.** Replace `safePath` with `safeLocalReturnPath` from `@vfurst/auth/core`. Validate again on read, not only on write, so any already-persisted value cannot be executed.

**Verification.** Submitting `successPath=/\attacker.example` is rejected at write time; a row manually seeded with that value is rejected at read time. Add unit cases for `/\`, `/\/`, `%5c`, and a CR/LF-containing path.

---

## DAT — Data model

### DAT-01 — Control-plane outbox permanently pins organizations (P1)

**Reproduced.** Two E2E teardowns failed with `Foreign key constraint violated on the constraint: control_plane_outbox_events_organizationId_fkey`.

**Root cause.** `packages/db/prisma/schema.prisma:394` declares `organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Restrict)`. Once any control-plane event exists for an organization, that organization can never be deleted. Production retires tenants rather than deleting them, so the user-facing impact is limited — but it breaks every test teardown and support cleanup path.

**Consequence already visible.** The local database has accumulated **72 organizations and 68,056 users** from load and E2E fixtures that could not clean themselves up.

**Fix.** Change to `onDelete: SetNull` (the column is already nullable and the event payload carries its own aggregate identity), or `Cascade` if the event history is genuinely worthless once its tenant is gone. `SetNull` is the safer default because it preserves the audit trail. Check `ControlPlaneEventReceipt` for the same pattern. Ship with a `prisma db push` and confirm the existing `prestart` chain stays idempotent.

**Verification.** `prisma.organization.deleteMany({ where: { slug } })` succeeds for an org that has emitted lifecycle events; the outbox rows survive with a null `organizationId`; the full E2E suite reaches a clean teardown. Then purge the accumulated fixture rows.

---

## TST — Test and CI integrity

### TST-01 — The full E2E suite has been red since 2026-07-17 (P1)

**Result of the full production-mode run on 2026-07-26: 91 passed, 4 failed, 4 did not run.**

Two failures are a stale assertion. Commit `6990649` ("docs(architecture): align refresh model with implementation") removed the word "Live" from the hero `aria-label` in `apps/web/src/app/page.tsx:32` as part of dropping the realtime/SSE language, but did not update the two specs asserting the old accessible name:

- `tests/e2e/home.spec.ts:10`
- `tests/e2e/launch-accessibility-smoke.spec.ts:206`

The other two failures are DAT-01.

**Why it went unnoticed.** Every session after 2026-07-17 ran only focused suites (1/1 to 6/6). `PROGRESS.md`'s last full-suite pass claim is dated 2026-07-14 against a smaller spec set. The suite has been red for nine days.

**Fix.** Update both assertions to the current accessible name, fix DAT-01, and re-run the full suite.

**Verification.** `E2E_PRODUCTION=1 npm run test:e2e` reports 0 failures and 0 skipped. Record the full count in `PROGRESS.md`.

### TST-02 — A green suite does not imply a working app (P1, process)

`scripts/run-e2e.mjs:56-70` injects `AUTH_URL`, `AUTH_SECRET`, `CHECKOUT_TOKEN_SECRET`, `SEPAY_*`, `STRIPE_*`, `REDIS_URL`, `EMAIL_DELIVERY_ENCRYPTION_KEY`, and `NEXT_PUBLIC_APP_URL` directly into the server process. This is correct for test isolation, but it means the suite has **never** exercised the configuration path a developer or a deployment actually uses. ENV-01 was invisible to it for that reason.

**Fix.** Add one smoke check that starts the app the way a developer does — no injected env — and asserts that the boot assertion from ENV-01 either passes or fails loudly. Add it to CI.

### TST-03 — Local database has no fixture isolation (P2)

72 organizations and 68,056 users persist in the development database from load-test and E2E fixtures. Teardown is best-effort and, per DAT-01, currently impossible for any org that emitted a lifecycle event. Add a fixture-prefix cleanup script (`load-*`, `phase*-smoke-*`, `*-org-a-*`, `*-org-b-*`) and run it before load proofs so measurements are not skewed by unrelated rows.

---

## SPL — Split runtime (`apps/platform-manager`, `apps/tenant-web`)

These do not affect production traffic today — `apps/web` is still the canonical serving app and `npm run dev` does not start the split runtimes. They must be resolved **before** any cutover, and one of them can break the legacy app today.

### SPL-01 — Port 3000 collision between `apps/web` and `platform-manager` (P1 for anyone running `dev:split`)

`scripts/split/host-routing.mjs:77` defaults the manager port to **3000**, the same port `apps/web` uses. `run-shells.mjs:121` passes an explicit `--port`, which disables Next's retry, so starting `dev:split` while `npm run dev` is running kills the manager and tears down tenant-web with it.

The reverse order is worse and silent: start `dev:split` first, then `npm run dev`, and `apps/web` retries onto **3002** while `AUTH_URL` still says `localhost:3000` — which now belongs to platform-manager. **Legacy `apps/web` login breaks with a manager 404.**

**Fix.** Default the manager to 3200 (or any port outside the legacy range) and document the map.

### SPL-02 — Cookie collisions on `localhost` (P2, can affect legacy)

Session cookies do not collide — `apps/web` uses the Auth.js default `authjs.session-token` and platform-manager overrides `sessionToken` to `__Host-vfurst-manager-session`. But platform-manager leaves `authjs.csrf-token`, `authjs.callback-url`, `authjs.pkce.code_verifier`, and `authjs.state` at their defaults. Cookies are shared per host **regardless of port**, so hitting platform-manager on `localhost` overwrites `apps/web`'s state cookies with values signed by a different `AUTH_SECRET`. Credential sign-in survives; a **Google OAuth flow started in one app and finished in the other fails** with a state/PKCE decryption error. Namespace every Auth.js cookie in platform-manager.

Observed during this audit: a session created on port 3000 was rejected on port 3005 because the two servers had different `AUTH_SECRET` values — the same mechanism.

### SPL-03 — `__Host-`/`Secure` cookies over plain HTTP (P2)

`packages/auth/src/core.ts:35-45` hardcodes `secure: true` with no development relaxation. Chromium and Firefox treat `*.localhost` as trustworthy so the tested path works, but on Safari, older browsers, or any non-`.localhost` hosts-file alias, the callback's `Set-Cookie` is dropped and the user enters an **infinite login loop with no error message**.

### SPL-04 — Every `dev:split` restart invalidates all sessions (P3)

`run-shells.mjs:19-34` regenerates the Ed25519 keypair, `AUTH_SECRET`, and both transaction/session secrets per process. Correct for security, but it forces a re-login on every restart and kills any in-flight handoff with an unstyled `400 {"error":"authorization_failed"}`. Persist dev-only material under `.gitignore`, or document the behaviour.

### SPL-05 — Handoff failures render bare JSON (P3)

`apps/tenant-web/src/app/auth/callback/route.ts` returns `400 {"error":"authorization_failed"}` and `auth-handoff.ts:145-148` returns `502 identity_exchange_failed` with no page, no message, and no way back. Add an error page.

### SPL-06 — `manager.localhost` may not resolve for server-to-server fetches (P2)

Browsers map `*.localhost` to loopback themselves; Node's `fetch` performs a real DNS lookup. This resolved correctly on the audited Windows machine, but it is host-dependent and will fail on machines without that behaviour, producing SPL-05's opaque 400. Point server-to-server URLs at `127.0.0.1` with an explicit `Host` header, or document the hosts-file requirement.

### SPL-07 — Unknown control-plane event types are lost silently (P2)

`packages/db/src/control-plane-outbox.ts:13-27` accepts `eventType: string` with no validation at enqueue time, while `apps/worker/src/jobs/apply-control-plane-event.ts:110` parses against a strict four-member union. A producer ahead of its worker marks the row `PUBLISHED`, so it never retries; the BullMQ job fails five times and, with `removeOnFail: false`, accumulates in Redis without bound. Validate `eventType` against the contract at enqueue time.

### SPL-08 — Worker startup is a crash loop when a dependency is down (P2)

`apps/worker/src/index.ts:270-274` runs recurring-job scheduling and the new control-plane dispatch inline during `start()`, and `dispatch-control-plane-events.ts:92` is outside any `try`. A database blip rejects `start()` → `process.exit(1)` → restart loop. Wrap startup work and let the process stay up in a degraded, retrying state.

### SPL-09 — `platform-manager` has no middleware or host allowlist (P3)

`apps/tenant-web` rejects misdirected hosts with 421 and restricts `/dashboard*` to the console host. platform-manager applies no equivalent check, so `/login` and `/api/identity/*` answer on any `Host` that reaches the port — safe only while the proxy fronts it.

### SPL-10 — Redis outage reports "invalid credentials" (P2)

`apps/platform-manager/src/lib/rate-limit.ts:96-113` returns `false` on `RateLimitUnavailableError`, deliberately indistinguishable from a bad password. With Redis down, **every** manager login reports "The email or password was not accepted." Also, `credentialAccountRateLimitPerMinute` defaults to 10 and counts attempts before password verification, so the 11th login in a minute reports the same thing. Keep the anti-enumeration property but distinguish infrastructure failure in the operator-facing log and surface a "try again shortly" message.

### SPL-11 — `apps/web` writes a `Session` row on read requests (P2)

`apps/web/src/lib/identity-session.ts:220-247` upgrades a legacy JWT in place (correctly preserving existing logins), but for RSC requests Auth.js discards the response's `Set-Cookie`, so the upgraded token is never persisted. Every server-rendered page load re-enters the compat path and runs `deleteMany` + `session.create` — a write on a GET, one new row each time. It self-heals once `SessionProvider` fetches `/api/auth/session`, but every non-browser caller (curl, uptime checks, prefetch) leaks rows that retention will not reclaim for 30 days past expiry.

---

# Remediation plan

Sequenced so that each batch is independently reviewable, leaves the repository green, and does not depend on a later batch. Follow the existing working rules in `AGENTS.md`: one batch per session, verify before building, update `PROGRESS.md` at the end of every session, commit per logical unit.

## Batch 0 — Make the application configurable (ENV-01, ENV-02)

**Why first.** Nothing else can be verified honestly until the app runs with its intended configuration. This batch alone resolves most of the reported breakage.

**Changes.** Per-app env files; missing variables added; a boot-time assertion in `apps/web`; dead Stripe Connect URL variables removed or implemented; env-file ownership documented.

**Exit criteria.**
- `npm run dev` starts web **and** worker with no configuration error.
- Tenant subdomain returns 200; a free registration completes end to end and its email lands in Mailpit.
- No `REDIS_URL is required` line in the log; a rate-limit key appears in Redis after one submission.
- `npm run check:launch` reports no *new* failures beyond the known external gates.

## Batch 1 — Make failures visible (ERR-01, ERR-02)

**Why second.** One `error.tsx` per route group converts roughly 180 blank pages into readable, retryable ones without touching a single action. `/login` is the single highest-frequency 500 in the product and the fix already exists in `platform-manager`.

**Changes.** `error.tsx` per route group with retry and a route-appropriate escape hatch; real copy in `global-error.tsx`; `loginWithCredentials` catches `AuthError` and redirects with an error code; `LoginPage` renders it.

**Exit criteria.**
- A wrong password stays on `/login` with an accessible message and no 500.
- A deliberately thrown action error renders its message with a working retry, and Sentry still receives the exception.
- New Playwright regressions for both, plus the existing auth specs still pass.

## Batch 2 — Public attendee flows (ERR-03 public subset, ERR-04)

**Scope.** Registration (voucher, sold out, per-account limit, rate limit, payments unavailable), store cart (stock, voucher, empty cart, rate limit), hotel (cutoff, sold out, dates), volunteer (required custom fields), vendor (validation, uploads), transfers (replay, expiry, self-transfer).

**Approach.** Pattern B for the redirect-shaped actions, Pattern A for the rest. Convert the file's bare `.parse()` calls in the same pass. Leave every tenant-isolation throw untouched.

**Exit criteria.** For each flow: invalid input renders inline, entered values are retained, the submit button is disabled while pending, no 500 in the log, and a Playwright case covers it. The transfer double-click case must show the refreshed `EXPIRED`/`ACCEPTED` state rather than a blank page.

## Batch 3 — Routing, redirects, and checkout safety (RTE-01, RTE-02, RTE-04, RTE-06, RTE-07, CHK-01, CHK-02)

**Why grouped.** All are host/URL correctness, all are verified by the same probe table plus one tenant-host checkout walkthrough. CHK-02 is a security fix and must not slip past this batch.

**Exit criteria.**
- The host probe table returns 200/200/200/200/400 for root, `www`, `console`, `app`, and the underscore host respectively.
- A store checkout completes from a tenant subdomain and its confirmation link resolves.
- `successPath=/\attacker.example` is rejected at write **and** read.
- Portal footer links resolve from a tenant host; dashboard logout signs out and returns to `/`.
- Forged `x-vfurst-*` headers do not alter portal-root generation, and response headers no longer echo them.

## Batch 4 — Data model and test integrity (DAT-01, TST-01, TST-03)

**Changes.** Outbox FK to `SetNull`; both hero assertions updated; fixture cleanup script; accumulated fixture rows purged.

**Exit criteria.** `E2E_PRODUCTION=1 npm run test:e2e` reports **0 failures, 0 skipped**, recorded with its count in `PROGRESS.md`. An organization that emitted lifecycle events can be deleted. `prestart` remains idempotent across two consecutive runs.

## Batch 5 — Organizer, platform, and residual actions (ERR-03 remainder, ERR-05, RTE-03, RTE-05, RTE-08, RTE-09, RTE-10)

**Scope.** Event wizard validation, voucher/hotel-block/store-product creation, badge designer uploads, member invitation (`ALREADY_MEMBER` — the direct analogue of the fixed signup bug), raffle draw exhaustion, DNS-not-yet-visible, payout ledger arithmetic, email replay. Plus the routing hygiene items and the `unstable_rethrow` guard.

**Exit criteria.** No P1/P2 entry remains in the ERR or RTE sections. A full `grep` for `throw new Error` in `apps/web/src/actions` returns only entries listed under "Do not change" or explicitly justified in review.

## Batch 6 — Split-runtime hardening (all SPL items)

**Gate.** Required before any traffic cutover; not required for the current single-runtime product. SPL-01 should be pulled forward into Batch 0 if anyone runs `dev:split` regularly, because it can break legacy `apps/web` login.

**Exit criteria.** The split verification gates already written in `docs/architecture/app-split-plan-2026-07-17.md` §"Verification gates", plus a clean `npm run test:e2e:split` and `npm run test:split-topology`.

---

# Verification protocol

## Run after every batch

```bash
npx turbo run type-check
npx turbo run lint
npx turbo run test
npx turbo run build
```

All four must pass. The BullMQ dynamic-dependency build warning is known and non-blocking; any **new** warning is not.

## Run after every batch that touches routes, actions, or hosts

```bash
docker compose up -d
npm run prestart --workspace @vfurst/web
```

then, with the app running:

```bash
for h in "localhost:3000" "www.vfurst.reyuugames.com" "console.vfurst.reyuugames.com" "app.vfurst.reyuugames.com" "foo_bar.localhost:3000"; do printf '%-40s' "[$h]"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: $h" http://127.0.0.1:3000/; done
```

Expected after Batch 3: `200 200 200 200 400`.

## Manual walkthrough — the check the automated suite does not perform

Because of TST-02, run this **without** the E2E runner, using plain `npm run dev`:

1. Register a new account; register again with the same email (must show an inline message, not a blank page).
2. Log in with a wrong password, then the correct one.
3. Open `/account` and confirm the six summary cards render.
4. Open a tenant portal by subdomain **and** by central path.
5. Run a registration with an invalid voucher code, then a valid free registration.
6. Add a store product to the cart, apply a bad discount code, then check out from the **tenant subdomain**.
7. Book a hotel room; submit a volunteer application with a required field blank.
8. Log out from the dashboard.

Every step must either succeed or show a readable message. A blank "Application error" page at any step is a batch failure.

## Full regression gate before marking any phase complete

```bash
E2E_PRODUCTION=1 npm run test:e2e
npm run check:launch
npm audit --audit-level=moderate
```

Record the exact pass/fail counts in `PROGRESS.md`. Do not record a pass claim from a focused run — that practice is what let TST-01 stay hidden for nine days.

---

# Do not change

These throw deliberately. Converting them to soft form state would weaken tenant isolation or hide genuine system failure.

- All ~40 `requireXAccess` guards in `apps/web/src/lib/dashboard-access.ts` (not-found plus permission).
- Cart/event/voucher/staff/vendor/phase5 tenant-mismatch invariants: `cart-actions.ts:264,274,283`, `voucher-actions.ts:83`, `event-actions.ts:384`, `phase5-actions.ts:114,241,315,890`, `staff-actions.ts:58,169,519,528`, `vendor-actions.ts:322,531`, `registration-actions.ts:392`.
- `stripe-actions.ts:14` (`STRIPE_SECRET_KEY` missing) and `:42` (Stripe permission).
- `checkout-actions.ts:62,79` — genuine optimistic-concurrency failures.
- Webhook 5xx responses in `api/webhooks/sepay/route.ts:103` and `api/webhooks/stripe/route.ts:84`. Providers need a 5xx to trigger redelivery.
- The `apps/api/v1` route handlers. They already return proper 4xx with error codes and need no change.

# Progress tracking

Update this table at the end of each session and mirror the summary into `PROGRESS.md`.

| Batch | Items | Status | Session date | Evidence |
|---|---|---|---|---|
| 0 — Configuration | ENV-01, ENV-02, SPL-01 | **Complete** | 2026-07-26 | See "Batch 0 outcome" below |
| 1 — Error visibility | ERR-01, ERR-02 | **Complete** | 2026-07-26 | See "Batch 1 outcome" below |
| 2 — Public flows | ERR-03 (public), ERR-04 | **Complete** | 2026-07-27 | See "Batch 2 outcome" below |
| 3 — Routing and checkout | RTE-01/02/04/06/07, CHK-01, CHK-02 | **Complete** | 2026-07-27 | See "Batch 3 outcome" below |
| 4 — Data and tests | DAT-01, TST-01, TST-03 | **Complete** | 2026-07-27 | See "Batch 4 outcome" below |
| 5 — Residual actions | ERR-03 (remainder), ERR-05, RTE-03/05/08/09/10 | **Complete** | 2026-07-27 | See "Batch 5 outcome" below |
| 1.6 — Developer boot smoke | TST-02 | **Complete** | 2026-07-27 | See "Unit 1.6 outcome" below |
| 6 — Split runtime | SPL-02…SPL-11 | Not started | | SPL-01 closed in Batch 0 |

---

# Batch 0 outcome — 2026-07-26

**ENV-01, ENV-02, and SPL-01 are closed.**

## What changed

Each runtime now owns its environment file, which is the mechanism Next.js
actually supports and the convention `apps/platform-manager` and `apps/tenant-web`
already used. To keep a single editable source, the per-app files are derived
rather than hand-maintained.

| Change | File |
|---|---|
| Per-app key contracts, also used as the generated file's layout | `apps/web/.env.example`, `apps/worker/.env.example` |
| Derives `apps/web/.env.local` and `apps/worker/.env` from the root `.env.local`; silently no-ops when that file is absent, so deployments are unaffected | `scripts/sync-app-env.mjs` |
| Fails startup with a per-variable explanation of the consequence; runs from `predev`/`prestart`, never during `next build` | `scripts/check-app-env.mjs` |
| Shared env parser with dotenv precedence — real process variables always win | `scripts/lib/env-file.mjs` |
| Loads `apps/worker/.env` before `./env.js` validates it, because `tsx`/`node` do not read env files automatically | `apps/worker/src/load-env.ts` |
| `predev`/`prestart` wiring and an `npm run env:sync` entry point | root, `apps/web`, `apps/worker` `package.json` |
| Added the previously absent `EMAIL_DELIVERY_ENCRYPTION_KEY`, `CHECKOUT_TOKEN_SECRET`, `SEPAY_*`, `SMTP_SECURE`, `SALES_CONTACT_EMAIL`, and the manager/console/api URLs | `.env.local`, `.env.example` |
| Removed `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` — read nowhere, and they named two routes that do not exist | `.env.local`, `.env.example` |
| Split runtimes moved off the legacy 3000/3001 ports to 3200/3201 (SPL-01) | `scripts/split/host-routing.mjs`, both split `package.json`, `apps/platform-manager/src/lib/env.ts`, its env test |
| Env-file ownership table and the port map | `AGENTS.md` |
| Production note that `EMAIL_DELIVERY_ENCRYPTION_KEY` must match across web and worker, and that root-level files reach nothing | `docs/launch/go-live-checklist.md` |

## Evidence

- `curl -H "Host: <activeOrgSubdomain>.localhost:3000" http://127.0.0.1:3000/` returns **200** under a plain `npm run dev`. It returned 404 before this batch.
- A password-reset request produced a `DELIVERED` `EmailDelivery` row and a real message in Mailpit. That single path proves the worker starts, both `EMAIL_DELIVERY_ENCRYPTION_KEY` values match, Redis is reachable, and SMTP works — all of which failed before.
- `vfurst:rate-limit:auth:password-reset:<hash>` appears in Redis, so the shared limiter is live instead of failing closed.
- All six BullMQ queues register their metadata in Redis; `WorkerConfigurationError` no longer occurs.
- `turbo run type-check lint test` — 32/32 tasks. `turbo run build` — 10/10. `npm run test:split-topology` — 5/5.
- Full E2E after the batch: **88 passed, 5 failed, 6 did not run.** No regression: four failures are the pre-existing TST-01/DAT-01 pair scheduled for Batch 4, and the fifth (`registration-policy.spec.ts:121`) is the documented four-worker contention flake — it passes 3/3 in 9.8 s with `--workers=1`. The transient sixth failure introduced mid-batch is described below and is fixed.

## Consequence discovered while verifying, and how it was handled

Adding `NEXT_PUBLIC_APP_URL` to the app's env file changed E2E behaviour, because
**Next.js inlines every `NEXT_PUBLIC_*` variable into the bundle at build time,
including in server code.** `scripts/run-e2e.mjs` injects its own value at
runtime, which silently stopped taking effect in production mode: transfer
emails carried the built-in `http://localhost:3000` while the test asserted the
injected `http://127.0.0.1:3000`.

This was a latent trap in the harness, not a fault introduced by the batch — it
was only invisible while the variable was absent at build time. The harness host
is now `localhost`, matching the value the app is built with, and both
`scripts/run-e2e.mjs` and `playwright.config.ts` carry a comment stating the
constraint. Anyone deploying must build with the correct `NEXT_PUBLIC_*` values;
setting them only at runtime does nothing.

## Deliberately left for later batches

`www.*` and `console.*` still return 404 (RTE-01) and a `Host` header containing
an underscore still returns 500 (RTE-02). Both were re-confirmed after this batch
and belong to Batch 3.

---

# Batch 1 outcome — 2026-07-26

**ERR-01 and ERR-02 are closed.**

## What changed

| Change | File |
|---|---|
| Shared route-level error boundary UI: generic copy (server messages are masked in production), `error.digest` reference code, "Try again" via `reset()`, and a route-appropriate escape hatch | `apps/web/src/components/route-error.tsx` |
| One `error.tsx` per surface: root (also catches group-layout errors and ungrouped routes), `(auth)` → `/login`, `(marketing)` → `/`, `(convention)/[orgSlug]` → history back (portal roots are host-relative; an absolute link would be wrong on one of the two host forms), `account` → `/account`, `dashboard` → `/dashboard`, `platform` → `/platform`, `checkout` → `/account/orders` | `apps/web/src/app/**/error.tsx` (8 files) |
| `global-error.tsx` renders real copy (inline-styled — it replaces the root layout, so `globals.css` is unavailable), keeps the Sentry capture, offers retry and a hard `location.assign("/")` escape | `apps/web/src/app/global-error.tsx` |
| `loginWithCredentials` calls `unstable_rethrow` before mapping expected `AuthError` to `LoginFormState`; the client `LoginForm` uses `useActionState` to render an accessible inline alert without changing the URL, while successful redirects and unexpected failures keep their framework/Sentry paths | `apps/web/src/app/(auth)/login/page.tsx`, `login/login-form.tsx` |
| Playwright regression: wrong password stays on `/login` with the alert, zero ≥500 responses, correct password then honors `returnTo`; an invalid voucher during registration renders the boundary (not a blank page) and "Try again" recovers to the flow start | `tests/e2e/error-visibility.spec.ts` |

Route `error.tsx` files intentionally do **not** re-capture to Sentry: server-side
exceptions are already reported through `onRequestError` in `instrumentation.ts`,
and `global-error.tsx` covers client-side render crashes.

## Evidence

- Focused Chromium E2E: `error-visibility.spec.ts` + `account-registration.spec.ts` — 3/3 in dev mode; `error-visibility.spec.ts` 2/2 in production mode (`E2E_PRODUCTION=1`), where server error messages are masked and the generic boundary copy renders.
- Dev-server log during the run shows `[auth][error] CredentialsSignin` being caught (no 500), and the voucher throw arriving at the boundary with its digest logged.
- `turbo run type-check lint test` 32/32 tasks; `turbo run build` 10/10 (known BullMQ warning only).
- Corrective staging verification on 2026-07-28: the original query redirect reproduced a transient Next 404 behind Cloudflare/Coolify; PR #15 moved the error to action state. Focused Playwright passed **1/1** (wrong password inline, then correct-password retry honors `returnTo`), live staging stayed on `/login` with the alert and no 404, and Auth.js session returned 200.

## Notes for later batches

- ERR-03 remains: the boundary makes thrown action errors readable, but inline structured state (values retained, field-level messages) is still Batch 2's conversion work.
- The E2E runner starts a dev server that overwrites `.next`; production-mode runs need a fresh `next build` first. Worth folding into TST-02's CI smoke design.

---

# Batch 2 outcome — 2026-07-27

**ERR-03 (public subset) and ERR-04 are closed.** Every public attendee flow now reports expected conditions as structured form state (Pattern A) or a redirect-with-notice (Pattern B); none of them reach the error boundary or a blank page.

## Contract introduced

- `lib/public-form-state.ts` — client-safe `PublicFormState` (`{ error?: string }`).
- `lib/public-action-error.ts` — `PublicActionError` for expected, user-correctable conditions raised inside libs, plus `publicActionErrorMessage()` which also recognizes the pre-existing `RegistrationPolicyError` and `RateLimitExceededError`. Tenant-isolation invariants stay plain throws (the "Do not change" list is untouched).
- Converted actions keep their body as an `…Inner` function and wrap it in `try { … } catch { unstable_rethrow; map-to-state; rethrow }`, so success-path `redirect()` still works and unexpected errors still reach the boundary/Sentry. This also lands the ERR-05 `unstable_rethrow` guard in every converted file.
- Because structured state is returned data — not a thrown error — the messages are **not masked in production**; this was verified with production-mode Playwright runs.

## Converted per flow (Pattern A = `useActionState` + controlled client form)

| Flow | Action(s) | Form |
|---|---|---|
| Registration | `createRegistration` (voucher/tier/comped/parse → state; policy/rate-limit/payments via mapper) | `registration-flow.tsx` (alert `registration-error`, submits disabled while pending, step/client state retained) |
| Store add | `addToCart` | new `components/store/add-to-cart-form.tsx` |
| Cart | `updateQuantity`, `applyVoucher`, `createOrder` (checkout: empty-cart/stock → `PublicActionError`) | new `components/store/cart-forms.tsx` (quantity/voucher/checkout sub-forms; `cart.tsx` composes them) |
| Hotel | `bookRoom` (cutoff/room-type/sold-out/not-found → expected) | new `hotel/booking-form.tsx` |
| Volunteer | `submitVolunteerApplication` (required custom field → expected) | new `volunteer/volunteer-form.tsx` (controlled dynamic `formSchema` fields) |
| Vendor | `submitApplication` + upload policy + file-count limit → `PublicActionError` | new `vendor-apply/vendor-apply-form.tsx` (values retained; file inputs excepted by nature) |
| Transfers (Pattern B) | `acceptRegistrationTransfer` / `declineRegistrationTransfer` redirect to `/account/transfers/[id]?token=…&notice=accepted\|declined\|expired\|used\|invalid\|ineligible\|policy`; the decision page renders the notice above the refreshed status. The ERR-04 revalidate-then-throw sites are gone — expired/committed outcomes now revalidate and redirect, so the recipient always sees the real state. |
| Libs | `assertPaidCheckoutAvailable` and the vendor document-upload policy now raise `PublicActionError` |

`payVendorBooth` and the organizer-side action families intentionally remain for Batch 5.

## Evidence

- New `tests/e2e/public-flow-errors.spec.ts` (6/6): mid-flow sold-out tier, cart quantity above stock, hotel past-cutoff, required volunteer field (whitespace bypasses client validation), too-short vendor description with values retained, and the double-submitted transfer decision landing on `notice=invalid` with the ACCEPTED status visible — no boundary, no blank page.
- Updated `tests/e2e/error-visibility.spec.ts` (3/3): wrong-password login; invalid voucher now asserted **inline** with the entered code retained and resubmit enabled; the boundary regression re-anchored to a deliberately unconverted organizer action (duplicate member invite, Batch 5's `ALREADY_MEMBER` case).
- Both specs pass in dev mode (9/9) and production mode (9/9).
- Touched-flow regressions: `registration-policy` 3/3, `hotel-resource-authorization` 3/3, `registration-transfer` + `store-resource-authorization` + `staff-vendor-resource-authorization` 13/13, `account-registration` 1/1. Two failures under a six-file four-worker run reproduced the **documented contention flakes** (`registration-policy.spec.ts:121` Postgres deadlock; hotel spec 120 s test-timeout) and pass 3/3 each in isolation — same behavior as recorded before this batch.
- Repository gates: `turbo run type-check lint test build` 37/37.

---

# Batch 3 outcome — 2026-07-27

**RTE-01, RTE-02, RTE-04, RTE-06, RTE-07, CHK-01, and CHK-02 are closed.** Batch 4 was not started: there is no schema/FK change, stale hero assertion change, fixture-cleanup utility, or accumulated-fixture purge in this unit.

## What changed

- The legacy middleware now recognizes the configured platform hosts and the canonical production root/reserved hosts through the shared tenant-host classifier. Invalid `Host` values fail closed with a no-store structured 400 instead of reaching a 500.
- Middleware removes every caller-supplied `x-vfurst-*` request header before platform pass-through or tenant rewrite. Tenant metadata is rebuilt from the validated host for the internal request only and is no longer copied to public response headers.
- Tenant-store checkout sends the user to the central `/checkout/[orderId]` surface and persists central-path confirmation/cancellation targets. The shared return-path guard rejects backslashes, protocol-relative paths, encoded separators, and encoded control characters at write time; both the status API and paid checkout page replace unsafe legacy values with `/account/orders` at read time.
- Portal “Powered by vFurst” and Privacy links now resolve on the central host. Dashboard logout is a real Auth.js server action and redirects to `/` after clearing the session.
- `isSafeLocalReturnPath` now validates both the raw and decoded representation, covering the CHK-02 encoded-path variants for every caller of the shared auth helper.

## Evidence

- Plain `npm run dev` host probe: `localhost:3000` **200**, `www.vfurst.reyuugames.com` **200**, `console.vfurst.reyuugames.com` **200**, `app.vfurst.reyuugames.com` **200**, `foo_bar.localhost:3000` **400**.
- New focused unit coverage: middleware host/header safety, platform-host classification, checkout return-path write/read policy, and shared auth return-path cases — **27/27**. The full web unit gate is **160/160** and the auth package gate is **67/67**.
- New `tests/e2e/routing-checkout-safety.spec.ts` — **5/5**: exact host matrix; central portal links plus forged-header isolation/no response echo; dashboard logout; tenant-host checkout remaining on the central checkout surface and returning to its central-path receipt; malicious submitted and persisted success paths rejected/fallbacked at both read surfaces.
- Existing `store-resource-authorization.spec.ts` regression — **4/4**. Split-topology canary — **5/5**.
- Plain-dev browser walkthrough confirmed tenant footer links resolve to `http://localhost:3000/` and `/privacy`, and dashboard logout clears the session and returns to the marketing root. The temporary organization, user, and provider fixture created for this walkthrough were removed by exact identifier after verification.
- Route/action bootstrap gates passed: `docker compose up -d`; `npm run prestart --workspace @vfurst/web` with the schema already in sync.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks, build **10/10** packages. The only build warning is the pre-existing BullMQ dynamic-dependency warning.
- The full E2E suite was intentionally not rerun and no green claim is recorded: the known DAT-01/TST-01/TST-03 failures remain owned by Batch 4.

---

# Batch 4 outcome — 2026-07-27

**DAT-01, TST-01, and TST-03 are closed.** Batch 5 was not started; organizer, platform, and residual action handling remains exactly where Batch 3 left it.

## What changed

- `ControlPlaneOutboxEvent.organization` now uses `onDelete: SetNull`. The nullable foreign key no longer pins an organization, while the event payload and aggregate fields preserve the durable audit identity. `ControlPlaneEventReceipt` remains a child of the event with `onDelete: Cascade`, so it needed no organization-FK change.
- The home and accessibility-smoke specs assert the current hero accessible name. The marketing home visual baselines were refreshed to the already-shipped “Event day”/“Recent arrivals” copy. Once that stale first failure was removed, the same smoke exposed older registrations baselines; those were refreshed to the already-shipped approval column and “Approve selected” action from the registration-policy work.
- `packages/db/scripts/cleanup-test-fixtures.mjs` provides dry-run-by-default and explicit `--apply` cleanup for `load-*`, `phase*-smoke-*`, `*-org-a-*`, and `*-org-b-*` organizations plus their synthetic users. It refuses non-local database hosts, deletes in a transaction, proves captured outbox rows detach before removing local fixture event history, and has **19/19** focused unit tests including transaction ordering and retention assertions.
- Root `fixtures:cleanup` / `fixtures:cleanup:dry-run` commands and the DB workspace command expose the utility. `scripts/run-launch-load-proof.mjs` now applies cleanup before the proof builds or seeds, preventing unrelated fixture residue from skewing measurements.
- `tests/e2e/control-plane-outbox-retention.spec.ts` creates an organization with an outbox event, deletes the organization, and verifies that the event survives with `organizationId = null` and its aggregate/payload identity intact.

## Evidence

- Prisma schema validation passed. The cleanup utility's focused tests passed **19/19**.
- Cleanup dry-run and apply each matched **0 organizations / 0 users / 0 outbox events**: the 2026-07-26 plan rebuild had already purged the historical residue. After the full suite, PostgreSQL still contains only the two local baseline organizations/users and **0** rows matching the specified fixture prefixes/load-user patterns.
- `npm run prestart --workspace @vfurst/web` passed twice consecutively: the first run synchronized the FK and the second reported the schema already in sync. Direct PostgreSQL inspection reports `control_plane_outbox_events_organizationId_fkey ... ON DELETE SET NULL`.
- The focused organization-deletion regression passed; the refreshed accessibility visual smoke then passed normally without update mode.
- Repository gates passed: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (DB **52/52**, web **160/160**, auth **67/67**), build **10/10** packages, and split-topology **5/5**. The only build warning is the pre-existing BullMQ dynamic-dependency warning.
- Full production-mode E2E (`E2E_PRODUCTION=1 npm run test:e2e`) completed with **114 passed, 0 failed, 0 did not run**. This is the first clean full-suite result since TST-01 was introduced and satisfies Batch 4's no-failure/no-skipped exit criterion.

---

# Batch 5 outcome — 2026-07-27

**ERR-03 (remainder), ERR-05, RTE-03, RTE-05, RTE-08, RTE-09, and RTE-10 are closed.** Batch 6 was not started: no split-runtime implementation, cutover work, or `test:e2e:split` work was performed.

## Structured organizer, platform, and residual actions

- Added the client-safe `ActionFormState`, shared `ActionStateForm`, `ExpectedActionError`, and `runActionWithState`. The helper calls `unstable_rethrow` before mapping known expected conditions, so redirects keep working and unexpected/auth/security/system failures still reach the route boundary and Sentry. `AGENTS.md` now requires this helper for organizer/platform forms.
- `ActionStateForm` constructs `FormData` from the live form before dispatch, retains uncontrolled values after an error, exposes an accessible alert/status, and disables the whole fieldset while pending.
- Converted event creation/wizard/settings, voucher create/bulk, hotel-block create/update, store-product create/update and image validation, badge-template uploads, member invitations, organization provisioning/settings/custom-domain requests, organization lifecycle/resend-owner actions, DNS verify/activate, payout recording, raffle draw, event/platform email replay, and the deferred public `payVendorBooth` action.
- Expected races now stay inline: duplicate voucher codes, already-member invitations, replay already queued, DNS not yet visible, raffle prize/draw exhaustion, payout amount above the selected ledger balance, and vendor approval changing before booth payment. Tenant/resource mismatches, payment concurrency, and configuration failures remain hard failures.
- Badge image layers are selected immediately when created, so the upload field is usable without first finding and clicking the new canvas layer. Public cart option validation now uses the existing public structured-error mapper.

## Routing hygiene

- Development-only platform aliases now include `::1`, `0.0.0.0`, private IPv4 ranges, and the machine hostname; production deliberately rejects that shortcut so LAN/custom hosts cannot silently become platform hosts.
- Central portal paths use the organization `slug`, while hosted subdomain/custom-domain links stay root-relative; `slug !== subdomain` is covered end to end.
- The tenant rewrite bypass now recognizes only known file extensions on the last path segment. Dotted application routes still rewrite.
- Only `apps/web/src/middleware.ts` remains. The duplicate root middleware implementation was removed and tests import the file Next resolves.
- Organization provisioning rejects the shared reserved labels (`api`, `app`, `console`, `manager`, `www`) before persistence.

## Residual `throw new Error` review

The final action-layer sweep contains **72** bare throws. None is an unreviewed Batch-5 P1/P2 site:

| Group | Files | Why it remains a hard failure in this unit |
|---|---|---|
| Binding do-not-change list | `cart-actions`, `checkout-actions`, `event-actions`, `hotel-actions`, `phase5-actions`, `registration-actions`, `staff-actions`, `stripe-actions`, `vendor-actions`, `voucher-actions` | Tenant/resource mismatches, Stripe configuration/permission, and optimistic payment concurrency are the audit's explicit security/payment invariants. |
| Authorization and state-transition integrity | `invitation-actions`, `org-actions`, `payment-actions`, `phase5-actions`, `registration-actions`, `registration-transfer-actions`, `saas-actions`, `staff-actions`, `store-actions`, `vendor-actions` | Stored-resource authorization, irreversible lifecycle/refund/print/check-in/transfer transitions, and cross-record ownership checks must not be softened or exposed as trusted client state. |
| Payment/provider availability | `checkout-actions`, `payment-actions`, `store-actions`, `vendor-actions` | Provider-disabled, refund-eligibility, and ledger/order ownership failures fail closed to protect money movement; only the audited payout arithmetic and vendor pre-payment race became inline. |
| Outside the Batch-5 P1/P2 defect register | `auth-actions`, `branding-actions`, the registration-type/add-on maintenance sites in `event-actions`, and admin CRUD validation in `org-actions`, `phase5-actions`, `registration-actions`, `registration-transfer-actions`, `saas-actions`, `staff-actions`, `store-actions`, and `vendor-actions` | These lower-priority identity/organizer maintenance validations were reviewed but are not among ERR-03's Batch-5 remainder. They retain the readable Batch-1 route boundary; this outcome does not claim inline UX for them or expand the unit beyond the recorded register. |

## Evidence

- Focused unit coverage for middleware, platform hosts, slug/subdomain portal roots, action mappings, and upload policy passed **61/61** before the full web gate; the final web unit gate is **179/179**.
- Batch-5 focused E2E covered event wizard validation, hotel/voucher/store/badge uploads, existing-member invitation, raffle exhaustion, DNS visibility, payout arithmetic, email replay races, slug/subdomain links, LAN-host environment policy, and vendor booth-payment races. The final staff/vendor focused run passed **6/6**.
- Plain start host probe returned `localhost` **200**, `www` **200**, `console` **200**, `app` **200**, malformed underscore host **400**. Route/action bootstrap passed with Docker services running and `prestart` reporting the schema already in sync.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **179/179**, DB **52/52**, auth **67/67**), build **10/10** packages. The only build warning is the pre-existing BullMQ dynamic-dependency warning.
- Split-topology canary passed **5/5** without changing either split runtime.
- Full production-mode E2E on the final build (`E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`) completed with **118 passed, 0 failed, 0 did not run**. A prior four-worker run reproduced the documented registration-policy contention timeout; that file passed **3/3** in isolation and again inside the clean full run.

---

# Unit 1.6 outcome — 2026-07-27

**TST-02 is closed.** Batch 6 was not started: no split-runtime implementation, cutover work, or `test:e2e:split` work was performed.

## What changed

- `scripts/smoke-web-boot.mjs` removes every application key declared by `apps/web/.env.example` from the boot process environment. The `predev` lifecycle must derive the per-app env files from the tracked repository-root `.env.local`, and the smoke requires the exact `[check-app-env] @vfurst/web configuration is complete.` assertion before accepting the boot.
- On the Linux CI runner, the smoke starts the exact `npm run dev --workspace @vfurst/web` command and requires Next's ready signal. The Windows path runs the same npm `predev` lifecycle and then prepares/listens with the Next development server API so the harness can shut down without leaving a detached `next dev` child tree.
- The smoke snapshots and restores `apps/web/.env.local` and `apps/worker/.env`, including removing files that did not exist before the run. It therefore cannot leak generated local configuration into the subsequent CI build.
- Root `test:boot-config` exposes the check. CI runs it after tests and before `build`, so the production build always replaces the dev `.next` output noted after Batch 1.

## Evidence and Phase 1 closeout state

- `npm run test:boot-config` passed on Windows: the env sync ran, the ENV-01 boot assertion fired, and Next listened on loopback without injected application configuration. `node --check scripts/smoke-web-boot.mjs` and `git diff --check` passed.
- Repository gates passed: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **179/179**, DB **52/52**, auth **67/67**), build **10/10** packages, and split-topology **5/5**. The only build warning is the pre-existing BullMQ dynamic-dependency warning.
- Full production-mode E2E on the final application build completed with **118 passed, 0 failed, 0 did not run** under one worker. The preceding four-worker run had four concurrency/server-instability failures and was not recorded as a pass.
- `npm run check:launch` ran and reported the ten still-open deployment/external gates owned by Phase 6 (Stripe, Sentry, beta evidence, physical screen-reader evidence, and a live launch URL).
- `npm audit --audit-level=moderate` is **red** with **33 vulnerabilities (31 high, 2 critical)**, including Auth.js and Next.js advisories that currently report no fix. No dependency update was attempted in this tightly scoped unit.
- Phase 1 therefore remains **In progress** even though TST-02 itself is complete: the repository-wide dependency audit is not green, and the complete plain-`npm run dev` manual walkthrough was not closed in this session. The next session must be Phase 1 verification/security closeout only; it must not start Batch 6 or Phase 2.
