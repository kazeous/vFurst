# Phase 1B Unit 1B.3 — Attendee Domain on Portal Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** move every attendee-owned record and flow from the central `User` to the tenant's `PortalAccount`. At the end, attendees register, pay, transfer, and view their records only on their portal host. Staff still sign in with the current central credentials.

**Architecture:**
- **Schema.** Ten business models swap their attendee column for a composite foreign key `(orgId, portalAccountId) → PortalAccount(orgId, id)`. The column renames are deliberate, so every attendee call site stops compiling.
- **Request primitives.** One module (`lib/portal-context.ts`) resolves the host organization and the portal account for pages and actions.
- **Canonical host.** The middleware moves to the Node.js runtime and sends every portal `GET` to the canonical portal host with a 308.
- **Navigation.** Portal actions never call `redirect()`. They return a `redirectTo`, and a shared client hook performs one full-document navigation (spec §7.7).
- **Moved surfaces.** The central `/account` moves under `(convention)/[orgSlug]/`, and `/checkout` moves to its own route group `(checkout)/[orgSlug]/` (amendment F4). The central `/transfer` landing page is deleted.

**Tech Stack:** Next.js 15.5 App Router (Server Actions, Node.js-runtime middleware, ISR), Prisma 6 / PostgreSQL composite foreign keys, Vitest, Playwright, and Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-identity-replatform-design.md`.
- Read §5.1, §5.3 (including the 2026-10-15 amendment), §5.5, §5.6, §7.1 (including "Where the redirects run"), §7.7 (including "Static pages and route handlers"), §7.8–§7.10, §8.1–§8.6, §9 (S1, S2, S3, S11, S12), §12, and the §13 1B.3 row.
- The 1B.2 plan (`docs/superpowers/plans/2026-10-14-phase-1b-unit-2-portal-identity-foundation.md`) built the libraries this plan consumes: `portal-session.ts`, `portal-account.ts`, `portal-accounts.ts`, `portal-request.ts`, and `portal-url.ts`.

## Global Constraints

- **Branch and order.**
  - Work on `feat/identity-replatform` and run the tasks strictly in order. Do not push or merge.
  - Precondition: PR #27 (`fix(e2e): restore a green full production suite`) is merged into `staging`. Task 0 merges `staging` into this branch.
- **`PROGRESS.md`:** only Task 12 edits it.
- **Stop points:** wherever a step says **stop** or **ask**, stop and report; do not improvise.
- **Commit attribution:** do not add a `Co-Authored-By: Claude` trailer. Use conventional commit messages.
- **Red window (expected).**
  - From Task 4 (schema) until the end of Task 10, `npm run type-check` fails outside the files a task owns.
  - Each task in that window passes its own Vitest files and a **scoped type-check**: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "<owned paths>"` prints nothing. The task names the exact pattern.
  - Task 10 restores the full serial gates. Do not "fix" another task's files early.
- **Attendee E2E is expected to be red from Task 2 until Task 11.** Run only the focused specs each task names. Task 11 migrates the suite, and Task 12 runs the full gate.
- **Destructive schema change:**
  - The local database is reset exactly once, in Task 4, with the documented command (spec §5.6). Run it only after the localhost check in that step.
  - `prestart` stays non-destructive: never add `--accept-data-loss` or `--force-reset` to any script.
- **Navigation rule (spec §7.7).** No server action that can run on a portal host calls `redirect()`.
  - It returns `{ redirectTo }`, where the value is a same-host path or a payment-provider URL.
  - The client navigates with `useActionRedirect` (Task 3).
  - Staff actions on the central host keep `redirect()`.
- **Writes to the ten moved models** set the scalars `orgId` and `portalAccountId` (or `winnerAccountId` / `recipientAccountId`).
  - Never write `portalAccount: { connect }` or use `disconnect`. The relation shares `orgId`, and `disconnect` would try to null it.
  - To clear `recipientAccountId`, set it to `null` directly.
- **Resource ownership.**
  - A stored resource whose `orgId` differs from the host organization is `notFound()` (`assertPortalResourceOrg`).
  - Queries for the signed-in attendee's own records filter by both `orgId` and `portalAccountId`.
- **Out of scope:**
  - **Staff identity, until 1B.4:** central `/login`, `/register`, `/forgot-password`, `/reset-password`, the Credentials and Google providers, `User.passwordHash`, and the E2E helper `tests/e2e/support/credentials-login.ts`.
  - **Deferred to 1B.5:** the k6 scripts, `scripts/seed-load-test.mjs`, `docs/api-contracts/*`, and `apps/docs`.
- **ISR contract.**
  - `/[orgSlug]/register` stays 15-second ISR (`●` in the build route table). It must not read `headers()` or `cookies()`, directly or through any helper it calls.
  - Any per-user state on it comes from a private no-store request.
- **Error handling (AGENTS.md rule 7):**
  - expected conditions return form state;
  - state actions keep the existing `…Inner` + `unstable_rethrow` + `publicActionErrorMessage` wrapper, like `createRegistration`.
- **Gates** run serially: `npx turbo run type-check lint test build --concurrency=1`.
- **Ports.** Pawket containers may hold 5432/6379. Ask the user before stopping them.
- **Copy.** New UI and email copy is English. Use exactly the strings this plan gives.
- **Client boundary.** No `"use client"` file imports the server-side modules `@/lib/portal-paths`, `portal-context`, `portal-account`, `portal-accounts`, `portal-request`, or `portal-session`, or `@/lib/return-to`. Server pages compute hrefs and pass them as props (amendment F3).
  - The existing pure helper `@/lib/portal-path` (singular, no imports; used by `PortalLink` and `PortalNav`) is allowed in client components (amendment F6).
  - The Task 3 Step 4 grep is the authoritative check.
- **Visual baselines** are not regenerated in this unit (amendment F4). A baseline mismatch is a stop.

**Fixed values:**

| Constant | Value |
|---|---|
| Canonical redirect status and methods | 308; `GET` and `HEAD` only |
| `PORTAL_HOST_CACHE_TTL_MS` | `15_000` (cache hits only) |
| `PORTAL_HOST_CACHE_MAX_ENTRIES` | `1_000` (evict the oldest entry) |
| Portal login path | `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}` |
| Portal sign-up path | `/signup?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}` |
| `GET /api/portal/session` headers | `cache-control: private, no-store, max-age=0`, `x-content-type-options: nosniff` |
| `GET /api/portal/session` body | `{ "account": { "email": string, "name": string \| null } \| null }` |
| Transfer link | `getPortalUrl(org, "/account/transfers/{id}?token={raw}")` |
| E2E attendee password | `PortalE2EPass123!` (`E2E_PORTAL_PASSWORD`) |

**Amendments after the preflight review (2026-10-15).** The review is in `.superpowers/sdd/2026-10-15-phase-1b-unit-3-attendee-domain-on-portal-accounts/preflight-review.md`. Task 0 passed: 29/29 gate tasks, 512 unit tests, full production E2E 127/0/0.

| ID | Finding | Amendment |
|---|---|---|
| F1 | Task 5's red test had nothing to rename: `registration-policy.test.ts` never calls `assertRegistrationCapacity` | Task 5 Step 1 adds two `assertRegistrationCapacity` tests with a mocked `tx` |
| F2 | Task 10's raffle test had no ownership field to rename | Task 10 Step 1 renames the three raffle-policy inputs and adds one ownership-query test |
| F3 | The client `PortalAccountGate` would import server modules (`@vfurst/auth/core` pulls in `bcryptjs` and `node:crypto`) | Path helpers move to the pure `lib/portal-paths.ts` (Task 1). The gate takes `loginHref` and `signupHref` props (Task 3). A grep guard runs in Task 3 Step 4 |
| F4 | Checkout under `(convention)/[orgSlug]` would gain the portal chrome and break its visual baselines | Checkout lives in `app/(checkout)/[orgSlug]/…` with unchanged markup (Task 7). Task 10 Step 3 stops if Next.js rejects the route groups. Task 11 never regenerates baselines |
| F5 | Task 2 stop: the existing `apps/web/middleware.test.ts` calls `middleware` synchronously (14 type errors after the async change) | Task 2 adapts that file: `async`/`await` plus a mocked lookup that returns `null`, with no assertion changes. The new portal tests stay in `apps/web/src/middleware.test.ts` |
| F6 | Task 3 stop: the prose "`@/lib/portal-*`" also covered the existing pure client helper `lib/portal-path.ts`, which the Step 4 grep excludes | The prose now names the server modules exactly. `portal-path.ts` (singular, no imports) stays allowed in client code, and the grep is unchanged |

**Decisions recorded in the spec on 2026-10-15** (read them; do not re-derive):

1. `RegistrationTransferRequest.requesterUserId` stays a staff `User` column. Only the recipient moves (§5.3).
2. The canonical-host redirects run in Node.js-runtime middleware (§7.1).
3. The register page's account gate reads `GET /api/portal/session`, and the middleware sets the tenant headers on tenant-host `/api/*` requests (§7.7).
4. The central `/transfer` landing page is deleted, and transfer links go straight to the portal account area (§7.9).
5. `getConventionPortalRoot*` are removed, and the central auth fallbacks become `/dashboard` (§8.2).

## Review Focus

1. **Cross-tenant identifiers through a valid portal.** Organization A's attendee, signed in on A's host, posts organization B's `eventId`, `blockId`, `orderId`, or transfer request. Expected: not found, never a 500 from the composite foreign key. Tests:
   - the `assertPortalResourceOrg` unit test (Task 1);
   - the E2E "a registration posted with another organization's event is not found" (Task 11).
2. **A session that expires mid-flow.** Submitting a portal form signed out lands on the **same host's** `/login?returnTo=<page>` and never on the central login. Tests:
   - the `getPortalActionContext` unit test (Task 1);
   - the E2E "a signed-out registration submit returns to this portal's sign-in" (Task 11).
3. **Payment returns.** A Stripe or SePay return lands on the canonical portal host, and the success path is portal-relative. Tests:
   - the `getPortalCheckoutUrls` unit test with an active custom domain (Task 7);
   - the E2E checkout-host assertions in the migrated `routing-checkout-safety` and the new `portal-attendee` specs (Task 11).
4. **Walk-in email variants.** A cashier enters ` Walk.In@Example.COM `. It must reach the same `PortalAccount` that `/signup` later claims, never a duplicate. Tests:
   - the `findOrCreatePortalAccount` unit test (Task 1);
   - the E2E walk-in claim (Task 11).
5. **Organization deletion with portal-owned business rows** (registrations, orders, carts, transfers with a recipient) still cascades (DAT-01 with `NoAction`). Test: `portal-ownership-integrity.spec.ts` (Task 4).

---

### Task 0: Preflight and baseline

**Files:** none until Step 2's merge commit.

- [ ] **Step 1: Confirm the branch, a clean tree, and the precondition.**

  Run: `git branch --show-current; git status --short; git fetch origin; git log --oneline -1 origin/staging; git log origin/staging --oneline | grep -c "restore a green full production suite"`
  Expected: `feat/identity-replatform`, no changes, and a count of at least `1`. If the count is `0`, PR #27 is not merged: **stop and ask**.

- [ ] **Step 2: Merge `staging`.**

  Run: `git merge --no-ff origin/staging`
  - Expected conflicts: `PROGRESS.md` and possibly `.env.local` / `.env.example`.
    - In `PROGRESS.md`, keep both sides' session entries in date order, newest first, and keep this branch's "Current phase" block.
    - In the env files, take `staging` (it removed `STRIPE_PUBLISHABLE_KEY` and `STRIPE_CONNECT_CLIENT_ID`) and keep any portal keys this branch added.
  - Any other conflict: **stop and report** with the file list.
  - Then run `node scripts/sync-app-env.mjs`.

- [ ] **Step 3: Confirm the database and Redis ports.**

  Run: `docker ps --format "{{.Names}} {{.Ports}}"`
  Expected: the vFurst containers (postgres, redis, minio, mailpit). If pawket holds 5432 or 6379, **stop and ask**.

- [ ] **Step 4: Record the baseline gates.**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected: PASS. Record the per-package test counts. If red, **stop and report**.

- [ ] **Step 5: Record the baseline full E2E.**

  Run: `npm run prestart --workspace @vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  - Expected: **0 failed / 0 did not run**: PR #27's 118 tests plus 1B.2's 9 portal tests.
  - Record the counts and the build's `(convention)/[orgSlug]` route table: `/[orgSlug]/register` is `●`, the others are `ƒ`.
  - If anything fails, **stop and report**. 1B.3 must start from green.

---

### Task 1: Portal request primitives (server)

**Files:**
- Create:
  - `apps/web/src/lib/portal-paths.ts` (pure; amendment F3);
  - `apps/web/src/lib/portal-context.ts`.
- Modify:
  - `apps/web/src/lib/portal-account.ts` (add two functions);
  - `apps/web/src/lib/portal-accounts.ts` (add `findOrCreatePortalAccount`).
- Test:
  - Create: `apps/web/src/lib/portal-paths.test.ts` and `apps/web/src/lib/portal-context.test.ts`.
  - Modify: `apps/web/src/lib/portal-accounts.test.ts`.

**Interfaces:**
- Consumes (1B.2):
  - `getConventionOrg(orgSlug)` (`lib/convention.ts`);
  - `getRequestPortalOrg()` (`lib/portal-request.ts`);
  - `getPortalAccount(org)` and `requirePortalAccount(org, returnTo)` (`lib/portal-account.ts`);
  - `PortalAccountSummary` (`lib/portal-session.ts`);
  - `safeReturnTo` (`lib/return-to.ts`);
  - `assertPublicAccountEmail`, `normalizePublicAccountName`, `shouldUpdatePublicAccountName` (`@vfurst/auth/public-account`);
  - `normalizeIdentityEmail` (`@vfurst/auth/core`).
- Produces (`lib/portal-paths.ts`):
  - `portalLoginPath(returnTo: string): string` and `portalSignupPath(returnTo: string): string`. Formats are in the Fixed values table.
  - The module imports only `safeReturnTo` from `@/lib/return-to`. Server pages, including the ISR register page, import it to build hrefs.
  - No client component imports it. `@/lib/return-to` re-exports `@vfurst/auth/core`, which imports `bcryptjs` and `node:crypto`.
- Produces (`lib/portal-context.ts`; it imports the path helpers from `lib/portal-paths.ts`):
  - `type PortalContext = { org: Organization; account: PortalAccountSummary }`
  - `getPortalPageContext(orgSlug: string): Promise<{ org: Organization; account: PortalAccountSummary | null }>`:
    - `notFound()` when `getConventionOrg` returns null;
    - `notFound()` when `getRequestPortalOrg()` is null or has a different `id`;
    - otherwise `account = await getPortalAccount(org)`.
  - `requirePortalPageContext(orgSlug: string, returnTo: string): Promise<PortalContext>`: the same, then `requirePortalAccount(org, returnTo)`. A relative render redirect is correct here (spec §7.7 forbids it only in actions).
  - `getPortalActionContext(returnTo: string): Promise<PortalContext | { redirectTo: string }>`:
    - org = `getRequestPortalOrg()`, `notFound()` when null;
    - with no account, returns `{ redirectTo: portalLoginPath(returnTo) }`.
  - `isPortalRedirect(value: PortalContext | { redirectTo: string }): value is { redirectTo: string }`
  - `assertPortalResourceOrg(resourceOrgId: string, org: { id: string }): void`: `notFound()` on mismatch.
- Produces (`lib/portal-account.ts`):
  - `assertPortalAccountEmail(account: Pick<PortalAccountSummary, "email">, submittedEmail: string): void`. It delegates to `assertPublicAccountEmail`.
  - `syncPortalAccountName(account: PortalAccountSummary, submittedName: string): Promise<PortalAccountSummary>`. It updates `portalAccount.name` only when `shouldUpdatePublicAccountName` is true, and selects `{ id, orgId, email, name }`.
- Produces (`lib/portal-accounts.ts`):
  - `findOrCreatePortalAccount(client: Pick<Prisma.TransactionClient, "portalAccount">, input: { orgId: string; email: string; name: string | null }): Promise<PortalAccountSummary>`
    - Use `upsert` on `orgId_email` with `normalizeIdentityEmail(input.email)`, `update: {}`, and `create: { orgId, email, name }`.
    - Then, if the stored name is null and `input.name` trims to non-empty, set it.
    - Never write `passwordHash`, `emailVerifiedAt`, or `authVersion`.

- [ ] **Step 1: Write the failing tests.**
  - `portal-paths.test.ts`:
    - `"portalLoginPath keeps a local return path and falls back to / for an external one"`: `portalLoginPath("/account/orders")` is `/login?returnTo=%2Faccount%2Forders`, and `portalLoginPath("https://evil.example/")` is `/login?returnTo=%2F`.
    - `"portalSignupPath encodes the return path"`: `portalSignupPath("/register")` is `/signup?returnTo=%2Fregister`.
  - `portal-context.test.ts` mocks `@/lib/convention`, `@/lib/portal-request`, `@/lib/portal-account`, and `next/navigation`. The `notFound` and `redirect` mocks throw tagged errors.
    - `"page context is not found when the host organization differs from the route organization"`
    - `"page context returns the organization and a null account for a signed-out visitor"`
    - `"requirePortalPageContext redirects a signed-out visitor to the same-host login"`: asserts `requirePortalAccount` is called with `(org, "/account")`.
    - `"action context returns redirectTo instead of redirecting when signed out"`: equals `{ redirectTo: "/login?returnTo=%2Fregister" }`, and the `redirect` mock is not called.
    - `"action context is not found off a portal host"`
    - `"assertPortalResourceOrg rejects another organization's resource as not found"`
  - `portal-accounts.test.ts` adds:
    - `"findOrCreatePortalAccount creates an unclaimed account with a normalized email"`: upsert `where.orgId_email.email === "walk.in@example.com"` for input `" Walk.In@Example.COM "`. The create data has no `passwordHash` key.
    - `"findOrCreatePortalAccount returns an existing claimed account without touching its password"`: there is no `update` call besides the empty upsert update.
    - `"findOrCreatePortalAccount fills a missing name but never overwrites one"`

- [ ] **Step 2: Run them to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/portal-paths.test.ts src/lib/portal-context.test.ts src/lib/portal-accounts.test.ts`
  Expected: FAIL (the modules and the functions are missing).

- [ ] **Step 3: Implement the interfaces above.**

- [ ] **Step 4: Run the tests and the web gates.**

  Run: `npx vitest run src/lib/portal-paths.test.ts src/lib/portal-context.test.ts src/lib/portal-accounts.test.ts`, then `npm run type-check --workspace @vfurst/web` and `npm run lint --workspace @vfurst/web`
  Expected: PASS.

- [ ] **Step 5: Commit.** `feat(web): add portal page and action context helpers`

---

### Task 2: Canonical portal host in Node.js middleware

**Files:**
- Create:
  - `apps/web/src/lib/portal-canonical.ts` (pure);
  - `apps/web/src/lib/portal-host-directory.ts` (cached lookup).
- Modify:
  - `apps/web/src/middleware.ts`;
  - `apps/web/middleware.test.ts`, the existing Phase 1 host-safety tests (amendment F5). Each test becomes `async` and `await`s `middleware(...)`. The file adds `vi.mock("./src/lib/portal-host-directory", () => ({ lookupPortalHostOrganization: vi.fn().mockResolvedValue(null) }))`, so tenant requests take the unchanged rewrite path. Every existing assertion stays as it is.
- Test (create):
  - `apps/web/src/lib/portal-canonical.test.ts`
  - `apps/web/src/lib/portal-host-directory.test.ts`
  - `apps/web/src/middleware.test.ts`
  - `tests/e2e/portal-canonical-host.spec.ts`

**Interfaces:**
- Consumes:
  - `getPortalUrl(org, path)` and `PortalUrlOrganization` (`lib/portal-url.ts`);
  - `getCanonicalTenantHostname` (`@vfurst/tenant-context`);
  - `getTenantHostPolicy()` (`lib/tenant-host-policy.ts`);
  - `getRootDomain()`, `isPlatformHostname()`, `normalizeHostname()` (`lib/platform-hosts.ts`).
- Produces (`portal-canonical.ts`):
  - `CENTRAL_ROUTE_SEGMENTS: ReadonlySet<string>`, initially:
    `api`, `dashboard`, `docs`, `platform`, `login`, `register`, `forgot-password`, `reset-password`, `invitations`, `dmca`, `features`, `pricing`, `privacy`, `request-access`, `terms`, `account`, `checkout`, `transfer`, `monitoring`.
    - The last four stay after Tasks 7–9 delete those routes. That is harmless, because a deleted route has no organization.
  - `centralPortalCandidate(pathname: string): { key: string; portalPath: string } | null`
    - `/{seg}/rest` gives `{ key: seg.toLowerCase(), portalPath: "/rest" }`, and `/{seg}` gives `portalPath: "/"`.
    - Returns null for `/`, for a central segment, and for a segment that starts with `_`.
  - `portalHostKey(hostname: string, rootDomain: string): string`: the subdomain label for `*.{root}`, otherwise the full hostname (custom domain).
  - `canonicalPortalRedirect(input: { requestHostname: string | null; portalPath: string; search: string; org: PortalUrlOrganization }): string | null`
    - `requestHostname: null` means a central-path request, which always redirects.
    - Otherwise it returns `getPortalUrl(org, portalPath + search)` when `requestHostname` differs from the canonical hostname, and null when they match.
- Produces (`portal-host-directory.ts`):
  - `type PortalHostOrganization = PortalUrlOrganization & { id: string }`
  - `PORTAL_HOST_CACHE_TTL_MS`, `PORTAL_HOST_CACHE_MAX_ENTRIES`
  - `lookupPortalHostOrganization(key: string, now?: number): Promise<PortalHostOrganization | null>`
    - Uses the same `where` as `getConventionOrg`: status `ACTIVE`, then `customDomain` when the key has a dot, otherwise `subdomain` or `slug`.
    - Selects `id`, `subdomain`, `customDomain`, and `customDomainStatus`.
    - Caches hits only.
  - `clearPortalHostCache(): void`, for tests.
- Produces (`middleware.ts`):
  - `export async function middleware(request: NextRequest): Promise<NextResponse>`
  - `config = { matcher: [unchanged], runtime: "nodejs" }`

**Middleware behavior, in order:**
1. Invalid host → the existing 400.
2. `/_next` and known static assets → `next()`, unchanged.
3. `/api/*`:
   - on a tenant host, set `x-vfurst-org-host`, `x-vfurst-org-slug`, and `x-vfurst-domain-mode` (the same values the rewrite path sets) on the request headers and call `next()` with no rewrite;
   - on a platform host, `next()`.
4. Platform host:
   - for `GET`/`HEAD`, when `centralPortalCandidate` matches and the lookup finds an organization, return a 308 to `canonicalPortalRedirect({ requestHostname: null, … })`;
   - otherwise `next()`.
5. Tenant host:
   - for `GET`/`HEAD`, look up `portalHostKey(hostname)`; when the organization exists and `canonicalPortalRedirect` returns a URL, return a 308;
   - otherwise rewrite exactly as today.

- [ ] **Step 1: Spike the runtime before anything else.**
  1. Change only the `config` to add `runtime: "nodejs"`.
  2. Make `middleware` `async` and `await` one `prisma.organization.count()` inside a `try`.
  3. Run `npx turbo run build --filter=@vfurst/web` and `npm run start --workspace @vfurst/web`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`.

  Expected: the build succeeds and the probe returns `200`. If the build or the start fails (Prisma in the middleware bundle, standalone tracing, or Sentry middleware wrapping), **stop and report** the error. Do not fall back to another design. Revert the spike lines before Step 2.

- [ ] **Step 2: Write the failing tests.**
  - `portal-canonical.test.ts`:
    - `"every static top-level app route is a central segment"`
      - Read `apps/web/src/app` with `fs.readdirSync(…, { withFileTypes: true })`. Expand `(group)` folders one level, and skip `[orgSlug]` and files.
      - Assert that each remaining directory name is in `CENTRAL_ROUTE_SEGMENTS`.
    - `"central portal candidate keeps the suffix and rejects central and internal segments"`: `/acme/register` → `{ key: "acme", portalPath: "/register" }`, `/acme` → `/`, while `/dashboard/x`, `/_next/x`, and `/` → null.
    - `"redirects a central-path request to the subdomain host with the query"`: org `{ subdomain: "acme", customDomain: null, customDomainStatus: null }` with `NEXT_PUBLIC_APP_URL=http://localhost:3000` gives `http://acme.localhost:3000/register?x=1`.
    - `"redirects a subdomain request to an active custom domain"`: `customDomain: "tickets.acme.test"`, `customDomainStatus: "ACTIVE"`, host `acme.localhost` → `http://tickets.acme.test:3000/register`.
    - `"redirects an inactive custom-domain request back to the subdomain"`: status `VERIFIED`, host `tickets.acme.test` → `http://acme.localhost:3000/register`.
    - `"leaves a canonical host alone"` → null.
    - `"a slug host that differs from the subdomain redirects to the subdomain"`: host `acme-slug.localhost` for org subdomain `acme`.
  - `portal-host-directory.test.ts`, mocking `@vfurst/db`:
    - `"caches a hit for the TTL and queries again after it expires"`
    - `"does not cache a miss"`
    - `"evicts the oldest entry beyond the size cap"`
    - `"looks up custom domains by customDomain and labels by subdomain or slug, active only"`
  - `middleware.test.ts`, mocking `lookupPortalHostOrganization`. Build `NextRequest` objects and read the status, `location`, `x-middleware-rewrite`, and `x-middleware-request-x-vfurst-org-slug`:
    - `"sets tenant headers on a tenant-host API request without rewriting"`
    - `"redirects a central-path portal GET with 308 and keeps the query"`
    - `"does not redirect a central-path POST"`
    - `"does not look up central routes"`: `/dashboard` makes no lookup call.
    - `"redirects a tenant GET to the active custom domain"`
    - `"rewrites a canonical tenant request as before"`
  - `tests/e2e/portal-canonical-host.spec.ts`, creating its own organizations:
    - `"a central-path portal URL redirects to the portal host with 308 and keeps the query"`
      - `const response = await page.goto("http://localhost:3000/{sub}/register?probe=1")`;
      - `response.request().redirectedFrom()?.response()` has status 308;
      - `page` URL is `http://{sub}.localhost:3000/register?probe=1`.
    - `"a slug host redirects to the canonical subdomain host"`: the organization has `slug: "{sub}-slug"` and `subdomain: "{sub}"`.
    - `"a central route is not treated as a portal"`: `/pricing` returns 200 on `localhost:3000`.

- [ ] **Step 3: Run the unit tests to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/portal-canonical.test.ts src/lib/portal-host-directory.test.ts src/middleware.test.ts`
  Expected: FAIL.

- [ ] **Step 4: Implement the three modules.** `portal-canonical.ts` must not import `next/headers` or Prisma.

- [ ] **Step 5: Run the unit tests and the web gates.**

  Run: the Step 3 command, then `npm run type-check --workspace @vfurst/web` and `npm run lint --workspace @vfurst/web`
  Expected: PASS.

- [ ] **Step 6: Run the focused E2E on a fresh production build.**

  Run: `npx turbo run build --filter=@vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1 tests/e2e/portal-canonical-host.spec.ts tests/e2e/portal-auth.spec.ts`
  Expected: all pass. (The 1B.2 test "central-path login redirects to A" now passes through the middleware's 308.)

- [ ] **Step 7: Commit.** `feat(web): redirect portal requests to the canonical host in middleware`

---

### Task 3: Client navigation and the portal session endpoint

**Files:**
- Create:
  - `apps/web/src/components/use-action-redirect.ts`
  - `apps/web/src/app/api/portal/session/route.ts`
  - `apps/web/src/components/account/portal-account-gate.tsx`
- Modify:
  - `apps/web/src/lib/public-form-state.ts`
  - `apps/web/src/lib/action-form-state.ts`
  - `apps/web/src/components/action-state-form.tsx`
- Test: create `apps/web/src/app/api/portal/session/route.test.ts`.

**Interfaces:**
- Consumes: `getRequestPortalOrg()` and `getPortalAccount(org)`. The latter works in a route handler because Task 2 sets the tenant headers on `/api/*`.
- Produces:
  - `PublicFormState` and `ActionFormState` each gain `redirectTo?: string`.
  - `useActionRedirect(redirectTo: string | undefined): void`, a client hook. A `useEffect` calls `window.location.replace(redirectTo)` when it is set.
  - `ActionStateForm` calls `useActionRedirect(state.redirectTo)` and keeps its fieldset disabled while `state.redirectTo` is set.
  - `GET /api/portal/session`:
    - 404 `{ account: null }` off a portal host;
    - otherwise 200 with `{ account: { email, name } | null }`;
    - headers from the Fixed values table. The account `id` is never returned.
  - `PortalAccountGate({ loginHref, signupHref, children }: { loginHref: string; signupHref: string; children: ReactNode })`, a client component.
    - The server page computes both hrefs with `lib/portal-paths.ts` (amendment F3). The gate imports no `@/lib/portal-*` or `@/lib/return-to` module.
    - It must not take a function child: the register page is a server component and cannot pass functions to a client component.
    - It fetches `/api/portal/session` with `cache: "no-store"` once, on mount.
    - **Loading:** keep today's `PublicAccountGate` loading section ("Checking your account" / "One moment while vFurst verifies your session.").
    - **Signed out:** label "Account required", heading "Sign in before continuing", text "Your registration, payment, and application history are saved to your account on this portal.", and buttons "Sign in" (`loginHref`, primary) and "Create account" (`signupHref`).
    - **Signed in:** renders `children` inside a context provider that holds the account.
  - `usePortalGateAccount(): { email: string; name: string | null }`, a client hook in the same file. It returns the gate's account and throws `Error("usePortalGateAccount must be used inside a signed-in PortalAccountGate.")` outside one.

- [ ] **Step 1: Write the failing route test.** `route.test.ts` mocks `@/lib/portal-request` and `@/lib/portal-account`:
  - `"returns 404 with a null account off a portal host"`
  - `"returns a null account with private no-store headers when signed out"`
  - `"returns only the email and name of the signed-in account"`: the body equals `{ account: { email, name } }`.

- [ ] **Step 2: Run it to verify it fails.**

  Run (in `apps/web`): `npx vitest run src/app/api/portal/session/route.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the route, `useActionRedirect`, the state fields, `ActionStateForm`, `PortalAccountGate`, and `usePortalGateAccount`.**

- [ ] **Step 4: Run the test and the web gates.**

  Run: the Step 2 command, then `npm run type-check --workspace @vfurst/web` and `npm run lint --workspace @vfurst/web`
  Expected: PASS.

  Run: `git grep -l '"use client"' apps/web/src | xargs grep -lE "@/lib/(portal-(paths|context|account|accounts|request|session)|return-to)"`
  Expected: no output. No client component may import these server-side modules. The pure `@/lib/portal-path` helper (singular) does not match this pattern and stays allowed (amendment F6).

- [ ] **Step 5: Commit.** `feat(web): add portal session endpoint and action redirect hook`

---

### Task 4: Schema — attendee ownership on `PortalAccount`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Test: create `tests/e2e/portal-ownership-integrity.spec.ts` (database-only; no page).

**Interfaces:**
- Produces, consumed by Tasks 5–11:

| Model | Remove | Add (scalar · relation field) | Index / unique changes |
|---|---|---|---|
| `Registration` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([eventId, portalAccountId, status])` replaces `[eventId, userId, status]`; `@@index([portalAccountId])` replaces `[userId]` |
| `Cart` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@unique([portalAccountId, eventId])` (compound name `portalAccountId_eventId`) |
| `Order` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])` |
| `HotelBooking` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])` |
| `VolunteerApplication` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])` |
| `VendorApplication` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])` |
| `StaffAssignment` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])` |
| `RaffleEntry` | `userId`, `user` | `portalAccountId` · `portalAccount` | `@@index([portalAccountId])`, `@@index([raffleId, portalAccountId])` |
| `RaffleDrawResult` | `winnerUserId` | `winnerAccountId` · `winner` (now `PortalAccount`) | `@@unique([raffleId, winnerAccountId])`, `@@index([winnerAccountId])` |
| `RegistrationTransferRequest` | `recipientUserId` | `recipientAccountId String?` · `recipient PortalAccount?` (relation name `"RegistrationTransferRecipient"`) | unchanged; **`requesterUserId`/`requester` stay on `User`** |

- Every new relation has the form `@relation(fields: [orgId, <column>], references: [orgId, id], onDelete: NoAction)`. Name the relations where `PortalAccount` needs two of them.
- `PortalAccount` gains the back-relations: `registrations`, `carts`, `orders`, `hotelBookings`, `volunteerApplications`, `vendorApplications`, `staffAssignments`, `raffleEntries`, `raffleWins`, and `transferRequestsReceived`. `User` loses the matching back-relations (keep `transferRequestsMade` / the requester relation).

- [ ] **Step 1: Write the integrity spec first.**

  `tests/e2e/portal-ownership-integrity.spec.ts` is database-only (`PrismaClient`, no `page`). It creates organizations A and B, with an event, a registration type, and a portal account in each.
  - `"a registration that points at another organization's portal account is rejected"`: creating a registration with `orgId: B` and `portalAccountId: accountA` rejects with Prisma code `P2003`.
  - `"an order that points at another organization's portal account is rejected"` (`P2003`)
  - `"a transfer recipient from another organization is rejected"` (`P2003`)
  - `"a portal session for another organization's account is rejected"` (`P2003`)
  - `"deleting an organization cascades through portal-owned registrations, orders, carts, and accepted transfers"`
    - In A, create an account, a registration, an order, a cart, and a transfer request with `recipientAccountId` set.
    - `prisma.organization.delete` succeeds, and the counts of every one of those tables `where: { orgId: A }` are 0.

- [ ] **Step 2: Edit the schema per the table.**

- [ ] **Step 3: Validate.**

  Run: `npm run db:validate`
  Expected: `… is valid`. If Prisma rejects a composite relation, **stop and report** the exact error. This is spec risk R6.

- [ ] **Step 4: Reset the local database (once, documented).**

  Run: `node -e "const u=new URL(require('fs').readFileSync('packages/db/.env','utf8').match(/^DIRECT_DATABASE_URL=\"?([^\"\n]+)/m)[1]);console.log(u.hostname)"`
  Expected: `localhost` or `127.0.0.1`. **Anything else: stop.**

  Then run: `npm run push --workspace @vfurst/db -- --force-reset`, `npm run build --workspace @vfurst/db`, and `npm run prestart --workspace @vfurst/web`
  Expected: the schema is applied and the backfills complete.

- [ ] **Step 5: Run the integrity spec and the DAT-01 regression.**

  Run: `npx playwright test tests/e2e/portal-ownership-integrity.spec.ts tests/e2e/control-plane-outbox-retention.spec.ts --workers=1`
  Expected: all pass. These specs need no web server.

- [ ] **Step 6: Commit.** `feat(db): move attendee ownership to tenant portal accounts`
  - The web and worker type-checks are now red by design (see Global Constraints).

---

### Task 5: Registration, cart, voucher, and the store on the portal

**Files:**
- Modify (actions):
  - `apps/web/src/actions/registration-actions.ts`: `createRegistration` only.
  - `apps/web/src/actions/cart-actions.ts`
  - `apps/web/src/actions/voucher-actions.ts`: `applyVoucher` only.
- Modify (lib): `apps/web/src/lib/registration-policy.ts` and its test.
- Modify (pages and components):
  - `apps/web/src/app/(convention)/[orgSlug]/register/page.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/register/registration-flow.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/store/page.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/page.tsx`
  - `apps/web/src/components/store/*.tsx` (the cart and add-to-cart forms)
  - `apps/web/src/components/convention/portal-shell.tsx`
- Delete: `apps/web/src/components/account/public-account-gate.tsx` (its only user was the register page).

**Interfaces:**
- Consumes: Task 1 (`getPortalActionContext`, `isPortalRedirect`, `assertPortalResourceOrg`, `assertPortalAccountEmail`, `syncPortalAccountName`, `getPortalPageContext`), Task 3 (`useActionRedirect`, `PortalAccountGate`, `usePortalGateAccount`, `redirectTo`), and Task 4 (columns).
- Produces:
  - `assertRegistrationCapacity(tx, { eventId, portalAccountId, typeId })`, renamed from `userId`.
  - The cart actions `removeFromCart`, `clearCart`, and `convertCartToOrder` become `(state: ActionFormState, formData: FormData) => Promise<ActionFormState>`. Their forms use `ActionStateForm`.

**Rules for every action in this task:**
1. First call `getPortalActionContext(<page path>)`, and return it if `isPortalRedirect`. The page paths are `/register`, `/store`, and `/store` (voucher).
2. After loading the event, voucher, or cart, call `assertPortalResourceOrg(resource.orgId, context.org)`.
3. Replace every `redirect(...)` with `return { redirectTo }`:
   - free registration → `/register?success={id}`;
   - cart mode → `/store`;
   - paid → `checkout.checkoutPath` from `prepareOrderCheckout`, which is already the portal-relative `/checkout/{id}?token=…`.
   - Remove the `getBaseUrl()` prefixes.
4. `prepareOrderCheckout` success and cancel paths become portal-relative (`/register?success={id}`, `/register?cancelled=1`, `/store`). The `successPath`/`cancelPath` hidden inputs on the store become `/store`.
5. Remove the `revalidatePath` calls that target portal pages. Those pages are force-dynamic, or ISR at 15 seconds.

**Page rules:**
- `register/page.tsx` stays ISR. It calls only the cached data function and wraps `RegistrationFlow` in `<PortalAccountGate loginHref={portalLoginPath("/register")} signupHref={portalSignupPath("/register")}>`, importing the helpers from `@/lib/portal-paths`. `RegistrationFlow` calls `usePortalGateAccount()` instead of `useSession` and prefills the name and email from it. The "Account" button links to `/account`.
- `store/page.tsx` and `page.tsx` use `getPortalPageContext(orgSlug)`. The store reads the cart by `portalAccountId_eventId`.
  - Signed-out links use `portalLoginPath("/store")` and `portalSignupPath("/store")` from `@/lib/portal-paths`.
  - Remove every `portalRoot` prefix (links are plain portal paths).
- `portal-shell.tsx`: the header "Account" link becomes `<PortalLink slug={org.slug} suffix="/account">`. "Privacy" and "Powered by vFurst" stay central.
- `registration-flow.tsx`, `add-to-cart-form.tsx`, and `cart-forms.tsx` call `useActionRedirect(state.redirectTo)`.

- [ ] **Step 1: Add the failing capacity tests (amendment F1).**

  The current `registration-policy.test.ts` never calls `assertRegistrationCapacity`, so there is nothing to rename. Add these two tests instead. Build `tx` from `vi.fn()` mocks:
  - `event.findUnique` → `{ id: "e1", orgId: "o1", settings: { maxRegistrationsPerUser: 2 } }`
  - `registrationType.findUnique` → `{ id: "t1", eventId: "e1", orgId: "o1", maxCapacity: null }`
  - `registration.count` → the value each test needs

  The tests:
  - `"counts the per-account registration limit by portal account"`:
    - `count` resolves `0`;
    - `await assertRegistrationCapacity(tx, { eventId: "e1", portalAccountId: "acct-1", typeId: "t1" })`;
    - the first `registration.count` call's `where` has `portalAccountId: "acct-1"` and no `userId` key.
  - `"rejects an account that already holds the event's registration limit"`: `count` resolves `2`, and the call rejects with `RegistrationPolicyError` "This event allows at most 2 active registrations per account."

  Run (in `apps/web`): `npx vitest run src/lib/registration-policy.test.ts`
  Expected: the first test FAILS, because the helper still reads `input.userId`. The second already passes; it guards the message.

- [ ] **Step 2: Implement the rules above.**

- [ ] **Step 3: Verify.**
  - Run: `npx vitest run src/lib/registration-policy.test.ts`
    Expected: PASS.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/(actions/(cart|voucher)-actions|lib/registration-policy|app/\(convention\)/\[orgSlug\]/(register|store|page)|components/(store|convention))"`
    Expected: no output.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep "src/actions/registration-actions.ts"`
    Expected: every reported line falls inside a staff action (`confirmRegistration` or later), which Task 10 owns. Open each reported line to check.

- [ ] **Step 4: Commit.** `feat(web): run registration, cart, and vouchers on portal accounts`

---

### Task 6: Hotel, volunteer, and vendor flows on the portal

**Files:**
- Modify:
  - `apps/web/src/actions/hotel-actions.ts`: `bookRoom` only.
  - `apps/web/src/actions/staff-actions.ts`: `submitVolunteerApplication` only.
  - `apps/web/src/actions/vendor-actions.ts`: `submitApplication` and `payVendorBooth` only.
  - `apps/web/src/app/(convention)/[orgSlug]/{hotel,volunteer,vendor-apply}/page.tsx` and their `*-form.tsx`.
  - `apps/web/src/lib/convention.ts` and `convention.test.ts`: delete `getConventionPortalRoot` and `getConventionPortalRootForRequest`. After this task nothing calls them.
- Leave `lib/public-account.ts` and the central-url helpers in place. The central account and transfer files still import them, and Task 9 deletes them.

**Interfaces:**
- Consumes: Tasks 1, 3, and 4.
- Produces: none new.

**Rules:**
- **Actions:** the Task 5 rules 1–3 and 5, with the page paths `/hotel`, `/volunteer`, and `/vendor-apply`.
  - Success becomes `{ redirectTo: "/hotel?success={id}" }`, `"/volunteer?success={id}"`, or `"/vendor-apply?success={id}"`.
  - Paid becomes `{ redirectTo: checkout.checkoutPath }`, with portal-relative checkout success and cancel paths.
- **`payVendorBooth`:** load the application. If its `portalAccountId` is not the signed-in account, the result is `notFound()`. The existing ownership check moves to `portalAccountId`.
- **Pages:** use `getPortalPageContext(orgSlug)` (the account may be null) and drop `auth()`.
  - Signed-out calls to action use `portalLoginPath(<page>)` and `portalSignupPath(<page>)` from `@/lib/portal-paths`.
  - Prefill uses `account.name` and `account.email`.
  - The "Account" button links to `/account`.
- **Forms:** `booking-form.tsx`, `volunteer-form.tsx`, and `vendor-apply-form.tsx` call `useActionRedirect`.

- [ ] **Step 1: Update `convention.test.ts` by deleting the portal-root cases. Implement the rules.**

- [ ] **Step 2: Verify.**
  - Run (in `apps/web`): `npx vitest run src/lib/convention.test.ts`
    Expected: PASS.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/(lib/convention|app/\(convention\)/\[orgSlug\]/(hotel|volunteer|vendor-apply))"`
    Expected: no output.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/actions/(hotel|staff|vendor)-actions.ts"`
    Expected: every reported line falls inside a staff function, which Task 10 owns. Open each reported line to check.
  - Run: `git grep -n "getConventionPortalRoot\|PublicAccountGate" apps/web/src`
    Expected: no output.

- [ ] **Step 3: Commit.** `feat(web): run hotel, volunteer, and vendor flows on portal accounts`

---

### Task 7: Checkout on the portal host

**Placement (amendment F4).** Checkout moves to its own route group, `app/(checkout)/[orgSlug]/checkout/…`, not under `(convention)/[orgSlug]/`.
- The URL is the same, `/{slug}/checkout/{orderId}` after the middleware rewrite.
- `(convention)/[orgSlug]/layout.tsx` wraps every child in `ConventionPortalShell` (header, navigation, event banner, footer). Checkout keeps today's focused full-page markup, so the `checkout-desktop` and `checkout-mobile` visual baselines stay valid.
- `(checkout)/[orgSlug]` has no layout of its own. The page does its own organization lookup and `notFound()` through `getPortalPageContext`.

**Files:**
- Move:
  - `apps/web/src/app/checkout/[orderId]/page.tsx` → `apps/web/src/app/(checkout)/[orgSlug]/checkout/[orderId]/page.tsx`
  - `apps/web/src/app/checkout/[orderId]/payment-status-poller.tsx` → the same folder
  - `apps/web/src/app/checkout/error.tsx` → `apps/web/src/app/(checkout)/[orgSlug]/checkout/error.tsx`
- Create:
  - `apps/web/src/lib/payments/checkout-urls.ts`
  - `apps/web/src/lib/payments/checkout-urls.test.ts`
- Modify:
  - `apps/web/src/actions/checkout-actions.ts`
  - `apps/web/src/lib/payments/checkout.ts`: in `requireCheckoutOrder`, add `portalAccount: { select: { email: true } }` to `include`.
- Delete: `apps/web/src/app/checkout/`.

**Interfaces:**
- Consumes: `getPortalUrl`, `getRequestPortalOrg`, `assertPortalResourceOrg`, `ActionStateForm`, and `getPortalPageContext`.
- Produces: `getPortalCheckoutUrls(org: PortalUrlOrganization, orderId: string, token: string): { checkoutUrl: string; successUrl: string; cancelUrl: string }`
  - `checkoutUrl` is `getPortalUrl(org, "/checkout/{orderId}?token={encoded}")`.
  - `successUrl` is `${checkoutUrl}&returned=stripe` and `cancelUrl` is `${checkoutUrl}&cancelled=stripe`.

**Rules:**
- **Page:**
  - call `getPortalPageContext(orgSlug)` (no sign-in, because the capability-token model is unchanged), then `requireCheckoutOrder(orderId, token)`;
  - if `order.orgId !== org.id`, `notFound()` (S12).
- **`startStripePayment` and `startSePayPayment`:**
  - They become `(state: ActionFormState, formData: FormData) => Promise<ActionFormState>`. The org is `getRequestPortalOrg()` (`notFound()` when null), followed by `assertPortalResourceOrg(order.orgId, org)`.
  - Stripe `success_url` and `cancel_url` come from `getPortalCheckoutUrls(order.org, …)`, and `customer_email` from `order.portalAccount.email`.
  - Every `redirect(x)` becomes `return { redirectTo: x }`. That covers the Stripe session URL (external), the absolute same-host checkout URLs, and the SePay `/checkout/{id}?token=…&sepay=1`.
  - Wrap them in the existing `…Inner` + `unstable_rethrow` + `publicActionErrorMessage` pattern. "Stripe is not available for this order." and "SePay is not available for this order." become `PublicActionError`s.
- **Page forms:** both payment forms use `ActionStateForm`.

- [ ] **Step 1: Write the failing test.** In `checkout-urls.test.ts`:
  - `"builds portal checkout and Stripe return URLs on the subdomain host"`: org `{ subdomain: "acme", customDomain: null, customDomainStatus: null }`, order `o1`, token `t/1`. The result is `checkoutUrl` = `http://acme.localhost:3000/checkout/o1?token=t%2F1` and `successUrl` = the same plus `&returned=stripe`.
  - `"uses the active custom domain"`: status `ACTIVE`, domain `tickets.acme.test` → `http://tickets.acme.test:3000/checkout/o1?token=t%2F1`.

- [ ] **Step 2: Run it to verify it fails.**

  Run (in `apps/web`): `npx vitest run src/lib/payments/checkout-urls.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the move and the rules.** Do not change the page's markup or class names beyond the forms, which `ActionStateForm` now wraps.

- [ ] **Step 4: Verify.**
  - Run: `npx vitest run src/lib/payments/checkout-urls.test.ts src/lib/payments/checkout-return-path.test.ts src/lib/payments/payments.test.ts`
    Expected: PASS.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/(actions/checkout-actions|lib/payments/|app/\(checkout\)/)"`
    Expected: no output.
  - Run: `test ! -e apps/web/src/app/checkout && echo deleted`
    Expected: `deleted`.

- [ ] **Step 5: Commit.** `feat(web): move checkout to the portal host`

---

### Task 8: Portal account area and registration confirmation

**Files:**
- Move: every file under `apps/web/src/app/account/` to `apps/web/src/app/(convention)/[orgSlug]/account/`, keeping the relative structure. That is the layout, error, overview, registrations (+ detail), transfers (+ detail), raffles, orders (+ detail), hotel, applications, and profile.
- Modify:
  - `apps/web/src/actions/account-actions.ts`
  - `apps/web/src/app/api/public/registration-confirmation/route.ts`
  - `apps/web/src/app/(convention)/[orgSlug]/register/registration-status-alert.tsx`
  - `apps/web/src/actions/auth-actions.ts`
  - `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - `apps/web/src/app/(auth)/reset-password/page.tsx`
  - `apps/web/src/components/dashboard/access-denied.tsx`
- Create: `apps/web/src/app/api/public/registration-confirmation/route.test.ts`
- Delete: `apps/web/src/app/account/`

**Interfaces:**
- Consumes: `requirePortalPageContext`, `getPortalActionContext`, `syncPortalAccountName`, `SignOutForm` (from `(convention)/[orgSlug]/login/sign-out-form.tsx`, 1B.2), and `ActionStateForm`.
- Produces: `updatePortalProfile(state: ActionFormState, formData: FormData): Promise<ActionFormState>`.
  - It replaces `updatePublicProfile`, which is deleted.
  - It parses `name` (trimmed, at least 1 character, else `{ error: "Enter your name." }`), then calls `syncPortalAccountName`, and returns `{ success: "Profile saved." }`.

**Rules:**
- **Layout:** `requirePortalPageContext(orgSlug, "/account")`.
  - Header label "Your account"; title `account.name ?? account.email`; subtitle "Your registrations, purchases, stays, and applications for {org.name}."
  - Actions: "Event portal" (`/`) and `SignOutForm` instead of the Auth.js `signOut`.
  - The nav keeps today's eight items with relative hrefs (`/account`, `/account/registrations`, …).
- **Every page:**
  - calls `requirePortalPageContext(orgSlug, <its own path>)`;
  - filters by `orgId: context.org.id` plus `portalAccountId: context.account.id`, or `winnerAccountId` for raffle wins;
  - incoming transfers filter by `orgId` and `recipientEmail: normalizeTransferEmail(account.email)`;
  - detail pages use `findFirst` on `{ id, orgId, portalAccountId }` and `notFound()` when it is null;
  - "Event portal" links become `/register`.
- **Profile:** a name-only `ActionStateForm` bound to `updatePortalProfile`. Email is shown read-only as text.
- **Registration confirmation:**
  - The organization comes from `getRequestPortalOrg()` and the account from `getPortalAccount(org)`. The `orgSlug` query parameter is removed from the schema and from `RegistrationStatusAlert`'s fetch.
  - The registration is found by `{ id, orgId, portalAccountId }`.
  - The response shapes and the 404-for-everything-else behavior stay unchanged.
- **Central fallbacks:** `safeReturnTo(…, "/account")` becomes `"/dashboard"` in `auth-actions.ts` and the two central pages.
- **Access denied:** remove the "Open my account" button. "Return to vFurst" becomes the primary action.

- [ ] **Step 1: Write the failing route test.** `route.test.ts` mocks `@/lib/portal-request`, `@/lib/portal-account`, and `@vfurst/db`:
  - `"returns 404 off a portal host"`
  - `"returns 404 when signed out"`
  - `"returns 404 for a registration owned by another account"`: assert that the `findFirst` `where` includes `portalAccountId` and `orgId`.
  - `"returns the confirmation for the signed-in owner"`

- [ ] **Step 2: Run it to verify it fails.**

  Run (in `apps/web`): `npx vitest run src/app/api/public/registration-confirmation/route.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the move and the rules.** The moved transfer pages switch only their identity and queries here (`requirePortalPageContext`, `recipientAccountId`). Their accept and decline forms change in Task 9.

- [ ] **Step 4: Verify.**
  - Run: `npx vitest run src/app/api/public/registration-confirmation/route.test.ts src/actions/auth-actions.test.ts`
    Expected: PASS. Update any `auth-actions` expectation that asserted `/account` to `/dashboard`.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/(actions/(account|auth)-actions|app/\(convention\)/\[orgSlug\]/account|app/api/public|app/\(auth\)|components/dashboard)"`
    Expected: no output.
  - Run: `test ! -e apps/web/src/app/account && echo deleted`
    Expected: `deleted`.

- [ ] **Step 5: Commit.** `feat(web): move the attendee account area to the portal`

---

### Task 9: Transfers within the tenant

**Files:**
- Modify:
  - `apps/web/src/lib/registration-transfer.ts` and its test
  - `apps/web/src/actions/registration-transfer-actions.ts`
  - `apps/web/src/actions/phase5-actions.ts`: `adminTransferRegistration` only.
  - `apps/web/src/app/(convention)/[orgSlug]/account/transfers/[requestId]/page.tsx`
  - `apps/web/src/app/dashboard/events/[eventId]/registrations/transfers/page.tsx`
  - `packages/email/src/templates/registration-transfer.ts`
  - `packages/email/src/index.ts`: the `registration-transfer` data mapping.
  - `packages/email/src/registration-transfer.test.ts`
- Delete:
  - `apps/web/src/app/transfer/`;
  - `apps/web/src/lib/public-account.ts` (its last users were this task's actions and Task 8's account action);
  - from `apps/web/src/lib/central-url.ts`: `getCentralLoginUrl`, `getCentralRegistrationUrl`, and `getCentralPortalPath`. Keep `getCentralAppUrl`.

**Interfaces:**
- Consumes: `getPortalUrl`, `getPortalActionContext`, `findOrCreatePortalAccount`, and `ActionStateForm`.
- Produces:
  - `getRegistrationTransferUrl(org: PortalUrlOrganization, requestId: string, rawToken: string): string` returns `getPortalUrl(org, getRegistrationTransferPath(requestId, rawToken))`.
  - `getRegistrationTransferLandingPath` is deleted.
  - `acceptRegistrationTransfer` and `declineRegistrationTransfer` become `(state: ActionFormState, formData: FormData) => Promise<ActionFormState>`.
  - `registrationTransferTemplate` gains `organizationName: string`.

**Rules:**
- **`createRegistrationTransferRequest` (staff, central):**
  - the requester stays `requesterUserId` from `requireRegistrationAccess`;
  - the source owner's name and email come from `registration.portalAccount`;
  - the email data adds `organizationName: emailContext.org.name`, and `transferUrl` uses the new signature.
- **Accept and decline:**
  - `getPortalActionContext(getRegistrationTransferPath(requestId, token))`, then `assertPortalResourceOrg(request.orgId, context.org)`;
  - the recipient email must equal the account email (normalized, as today);
  - the new registration and other writes use `portalAccountId: account.id` and `recipientAccountId: account.id`;
  - `redirectWithTransferNotice` becomes a function that returns `{ redirectTo: "{transfer path}&notice={notice}" }`;
  - drop every `revalidatePath("/account…")` call.
- **`adminTransferRegistration` (staff):** the target account comes from `findOrCreatePortalAccount(tx, { orgId: event.orgId, email, name })`, replacing `findOrCreateUser`.
- **Dashboard transfers page:** includes `recipient` (`PortalAccount`) and `sourceRegistration.portalAccount`, and shows their emails.
- **Template copy:**
  - Text body:
    `${greeting}\n\n${sourceName} invited you to take ownership of a registration for ${eventName}. Sign in to your account on the ${organizationName} portal with this email address to accept or decline the transfer. If you do not have an account there yet, create one with this email address first:\n${transferUrl}\n\nThis link expires ${expiresAt}. It can only be used once and only by the invited email address.`
  - HTML: add `<p>Sign in to your account on the ${escapeHtml(organizationName)} portal with this email address to accept or decline the transfer. If you do not have an account there yet, create one with this email address first.</p>` before the link paragraph.
  - The `index.ts` mapping defaults `organizationName` to `"this organization"`.

- [ ] **Step 1: Write the failing tests.**
  - `registration-transfer.test.ts`: `"builds the transfer link on the canonical portal host"` asserts `http://acme.localhost:3000/account/transfers/r1?token=…` for a subdomain org and the custom domain when it is `ACTIVE`.
  - `packages/email/src/registration-transfer.test.ts`:
    - `"names the organization portal and escapes it"`: `organizationName: "<Acme>"` renders `&lt;Acme&gt;` in HTML and `<Acme>` in text;
    - the existing escaping test gains the new field.

- [ ] **Step 2: Run them to verify they fail.**

  Run: `npx vitest run src/lib/registration-transfer.test.ts` (in `apps/web`) and `npm run test --workspace @vfurst/email`
  Expected: FAIL.

- [ ] **Step 3: Implement the rules. Delete `app/transfer/`.**

- [ ] **Step 4: Verify.**
  - Run: the Step 2 commands
    Expected: PASS.
  - Run: `npm run type-check --workspace @vfurst/web 2>&1 | grep -E "src/(actions/registration-transfer-actions|lib/registration-transfer|app/\(convention\)/\[orgSlug\]/account/transfers|app/dashboard/events/\[eventId\]/registrations/transfers)"`
    Expected: no output.
  - Run: `npm run type-check --workspace @vfurst/email`
    Expected: PASS.
  - Run: `git grep -n "requirePublicAccount\|getCentralLoginUrl\|getCentralRegistrationUrl\|getCentralPortalPath" apps/web/src`
    Expected: no output.

- [ ] **Step 5: Commit.** `feat(web): keep registration transfers inside the tenant portal`

---

### Task 10: Staff reads, walk-in, API, worker, and fixtures — gates green

**Files (the compiler drives the list; these are known):**
- **`apps/web/src/actions/`:**
  - `phase5-actions.ts`: walk-in, `addRaffleEntry`, `autoEnterConfirmedRegistrations`, `drawRaffleWinner`, check-in, badges; delete `findOrCreateUser`.
  - `registration-actions.ts`: the staff actions from `confirmRegistration` on.
  - `staff-actions.ts`: volunteer review, shifts, `massEmailDepartment`.
  - `vendor-actions.ts`: review, booths, assistants.
  - `hotel-actions.ts`: staff block actions and `cancelBooking`.
- **`apps/web/src/lib/`:** `fulfillment.ts`, `raffle-policy.ts` and its test, `dashboard-access.ts` (attendee includes only), and `email.ts` (if it reads `registration.user`).
- **`apps/web/src/app/dashboard/events/[eventId]/`:** registrations (list, detail, export), `check-in` (+ cashier, express), `badges`, the event overview, `raffle`, `hotel`, `staff/{applications,departments,schedule}`, `vendors` (+ booths), `store/orders`, `analytics/export`, and `settings/emails` (if referenced).
- **`apps/web/src/app/api/v1/`:** `attendees`, `registrations` (+ `[registrationId]`), `badges`, and `vendors`.
- **`apps/worker/src/jobs/`:** `generate-badges.ts` and its test.
- **`packages/db/scripts/`:** `cleanup-test-fixtures.mjs` and its test.

**Interfaces:**
- Consumes: `findOrCreatePortalAccount` (Task 1) and the Task 4 columns.
- Produces: no new names. Every JSON field named `userId` in `/api/v1` and in webhook payloads keeps its name and now carries `portalAccountId` (D9).

**Rules:**
- **Walk-in and staff-added raffle entries:** `findOrCreatePortalAccount(tx, { orgId: event.orgId, email, name })`. The account stays unclaimed, and the person claims it through `/signup` (spec §7.9).
- **Identity reads:** `registration.user` → `registration.portalAccount`, and the same on every moved model.
  - Badge names use `portalAccount.name ?? portalAccount.email`.
  - Searches stay scoped to the event's organization.
  - CSV column headers and order are unchanged.
- **Emails** to volunteers, vendors, and assignees go to `portalAccount.email`.
- **`/api/v1/attendees`:**
  - `prisma.portalAccount.findMany`/`count` with `where: { orgId: apiKey.orgId, registrations: { some: { orgId, …(eventId) } }, …(q) }`;
  - select `id`, `email`, `name`, and `registrations` as today;
  - the response keeps `id` (now the portal account ID).
- **`cleanup-test-fixtures.mjs`:**
  - the linked-user `OR` keeps only `orgMemberships`, because portal accounts cascade with their organization;
  - the load-user email filter is unchanged;
  - update the test's expected query.
- **Webhooks:** payload keys stay; values come from `portalAccountId`.

- [ ] **Step 1: Update the unit tests first.**
  - In `generate-badges.test.ts` and `cleanup-test-fixtures.test.mjs`, rename the ownership fields in the fixtures and expectations. `generate-badges.test.ts` gets `"badge name falls back to the portal account email"`.
  - **`raffle-policy.test.ts` (amendment F2).** Its current tests have no ownership field to rename. Add one test for the ownership queries.
    - Rename the `userId` input of `assertRaffleEligibility` (`EligibilityCheck`), `assertDrawEligibility`, and `fulfillPurchasedRaffleEntries` to `portalAccountId`. These functions read `order.portalAccountId` and write `raffleEntry.portalAccountId`.
    - Test `"checks raffle eligibility and the entry limit by portal account"`:
      - `tx` mocks: `raffle.findUnique` → `{ id: "r1", orgId: "o1", eventId: "e1", eligibility: { kind: "CONFIRMED_REGISTRATION" }, maxEntriesPerUser: 1 }`; `registration.findFirst` → `{ id: "reg1" }`; `raffleEntry.aggregate` → `{ _sum: { quantity: 0 } }`;
      - call `await assertRaffleEligibility(tx, { raffleId: "r1", orgId: "o1", eventId: "e1", portalAccountId: "acct-1", entryMethod: "MANUAL" })`;
      - the `registration.findFirst` `where` has `portalAccountId: "acct-1"` and no `userId` key;
      - the `raffleEntry.aggregate` `where` equals `{ raffleId: "r1", portalAccountId: "acct-1" }`.
  - Run them and see them fail.

- [ ] **Step 2: Fix every type error in the files above until the web and worker type-checks pass.**
  - Do not cast with `as any`, and do not add `@ts-expect-error`.

- [ ] **Step 3: Run the full serial gates.**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected: PASS.
  - Record the counts.
  - Confirm that the build route table shows `/[orgSlug]/register` as `●`, and every new `(convention)/[orgSlug]/account/*` and `checkout/[orderId]` route as `ƒ`.
  - This is the first build since Task 4, so it is also the first check that Next.js accepts two route groups sharing `[orgSlug]` (`(convention)` and `(checkout)`, amendment F4). If the build rejects that layout, **stop and report** the exact error. Do not move checkout under `(convention)`.

- [ ] **Step 4: Confirm no attendee code still reads `User`.**

  Run: `git grep -nE "requirePublicAccount|findOrCreateUser|recipientUserId|winnerUserId|getCentralLoginUrl|getConventionPortalRoot|\\.user\\.(name|email)" apps/web/src apps/worker/src packages`
  Expected: no attendee hit. Staff-only hits (`OrgMember.user`, invitations, `AttendeeNote.author`) are fine. List what remains in the commit body.

- [ ] **Step 5: Commit.** `feat(web,worker): read attendee identity from portal accounts`

---

### Task 11: E2E migration and new portal specs

**Files:**
- Create:
  - `tests/e2e/support/portal.ts`
  - `tests/e2e/portal-attendee.spec.ts`
- Modify: every spec that creates or drives attendees.
  - `account-registration`, `badge-checkin-resource-authorization`, `custom-email-delivery`, `error-visibility`, `export-resource-authorization`
  - `hotel-resource-authorization`, `launch-accessibility-smoke`, `launch-critical-paths`, `mixed-currency-reporting`, `organization-invitations`
  - `payment-attempt-serialization`, `platform-lifecycle`, `public-flow-errors`, `raffle-contract`, `raffle-voucher-resource-authorization`
  - `registration-policy`, `registration-resource-authorization`, `registration-transfer`, `routing-checkout-safety`, `staff-vendor-resource-authorization`
  - `store-resource-authorization`, `stripe-webhook-security`, `tenant-containment`, `api-key-webhook-resource-authorization`, `event-resource-authorization`
  - `platform-domain-payment-boundary`, `email-delivery-operations`
  - Edit only the attendee parts of each.

**Interfaces (`tests/e2e/support/portal.ts`):**
- `E2E_PORTAL_PASSWORD = "PortalE2EPass123!"`
- `portalOrigin(subdomain: string): string` returns `http://${subdomain}.localhost:3000`.
- `createPortalAccountFixture(prisma: PrismaClient, input: { orgId: string; email: string; name?: string; password?: string }): Promise<{ id: string; email: string }>`
  - It creates a claimed account: `passwordHash` (bcrypt cost 12), `emailVerifiedAt: new Date()`, and a normalized email.
- `loginAsAttendee(page: Page, org: { subdomain: string }, email: string, options?: { password?: string; returnTo?: string }): Promise<void>`
  - It opens `${portalOrigin}/login?returnTo=…` (default `/account`), fills "Email" and "Password" (`exact: true`), and clicks "Sign in".
  - It waits for the browser to have **loaded** `returnTo` on that origin (the same contract as `loginWithCredentials`).

**Migration rules:**
- **Attendee fixtures** become `createPortalAccountFixture` in the right organization. Rows set `portalAccountId`, `winnerAccountId`, or `recipientAccountId`. Teardown deletes the organizations, and accounts cascade.
- **Attendee navigation** uses `portalOrigin(sub)` paths: `/register`, `/store`, `/hotel`, `/volunteer`, `/vendor-apply`, `/account/...`, `/checkout/...`.
- **Staff steps keep `loginWithCredentials` unchanged.** A spec that switches between a staff user and an attendee uses separate browser contexts, or signs in on both hosts. Cookies are host-only.
- **`routing-checkout-safety`:**
  - delete `copySessionToTenant` and use `loginAsAttendee`;
  - the store's `successPath`/`cancelPath` expectations become `/store`;
  - checkout URLs are on `portalOrigin`;
  - the host probe test is unchanged.
- **`registration-transfer`:**
  - the requester fixture stays the staff owner (`requesterUserId`);
  - the recipient is a portal account;
  - the decision page is `${portalOrigin}/account/transfers/{id}?token=…`;
  - `recipientUserId` assertions become `recipientAccountId`.
- **`account-registration`** (central sign-up, staff until 1B.4) changes only if it fails. Its `returnTo=%2Faccount` is just an echoed string.
- **No assertion is weakened.** If an assertion can no longer hold, because it tested central-account behavior that the spec removes, **stop and ask** before deleting it.
- **Visual baselines (amendment F4).** In `launch-accessibility-smoke.spec.ts`, only the surface URLs change:
  - `checkout` becomes `${portalOrigin(sub)}/checkout/{id}?token=…`;
  - `public-portal` may stay on the central path, which now 308-redirects to the portal host;
  - the checkout fixture's `checkoutSuccessPath` and `checkoutCancelPath` become `/`.

  The rendered markup of both surfaces is unchanged by this unit, so the existing `*.png` baselines must still match. Never run `--update-snapshots`. If a baseline differs, **stop and ask**, and attach the diff image. Baseline updates belong to 1B.5.

**New `portal-attendee.spec.ts`:**
- `"a registration posted with another organization's event is not found"`
  - Signed in on A, the test submits the register form with B's `eventId` by rewriting the hidden input.
  - Expected: a 404 page, and no registration exists for B.
- `"a signed-out registration submit returns to this portal's sign-in"`
  - The test clears the portal cookie after the form renders, then submits.
  - Expected: the URL is `${originA}/login?returnTo=%2Fregister`.
- `"checkout runs on the portal host and rejects another organization's order"`
  - A paid tier is registered on A and lands on `${originA}/checkout/{id}?token=…`.
  - The same path with B's order and token on A's host is a 404.
- `"a cashier walk-in can be claimed through sign-up and shows the registration"`
  - The staff cashier creates a walk-in for `Walk.In-{run}@Example.COM`.
  - `/signup` with `walk.in-{run}@example.com` receives the setup mail (Mailpit), sets a password, and `/account/registrations` lists the walk-in.
- `"the same email at two organizations is two independent accounts"`
  - The same email has a registration at A and at B.
  - Each portal's `/account/registrations` lists only its own.

- [ ] **Step 1: Write `support/portal.ts` and `portal-attendee.spec.ts`.**

- [ ] **Step 2: Migrate the listed specs per the rules.**

- [ ] **Step 3: Run the new and the heaviest migrated specs on a fresh build.**

  Run: `npx turbo run build --filter=@vfurst/web`, `npm run prestart --workspace @vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1 tests/e2e/portal-attendee.spec.ts tests/e2e/portal-canonical-host.spec.ts tests/e2e/registration-transfer.spec.ts tests/e2e/routing-checkout-safety.spec.ts tests/e2e/launch-critical-paths.spec.ts`
  Expected: all pass.

- [ ] **Step 4: Run the full gate.**

  Run: `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  Expected: **0 failed / 0 did not run**. Record the count. A failure is a stop-and-fix in this task. Do not record a pass from a focused run (verification.md, TST-01).

- [ ] **Step 5: Commit.** `test(e2e): run attendee flows on portal accounts`

---

### Task 12: Closeout

**Files:**
- Modify:
  - `docs/plan/00-reference.md`: the ISR line adds that the register page's account gate uses the private no-store `GET /api/portal/session`. Surfaces: central `/account`, `/checkout`, and `/transfer` no longer exist.
  - `PROGRESS.md`
- Spec: none, unless a task recorded a deviation.

- [ ] **Step 1: Run the gates from a clean build.**
  - Run: `npx turbo run type-check lint test build --concurrency=1`
  - Run: `npm run test:boot-config`
  - Run: `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`

  Expected: all PASS, with the E2E at 0 failed / 0 did not run.

- [ ] **Step 2: Run the plain-dev smoke** (`npm run dev`, no injected env).
  1. Open `http://localhost:3000/{an org}/register` and see it land on `http://{org}.localhost:3000/register`.
  2. Sign up through Mailpit, set a password, register for a free tier, and see the registration under `/account/registrations`.
  3. Sign out from the account header.

  Record the result in one line.

- [ ] **Step 3: Write the `PROGRESS.md` session entry.**
  - Unit 1B.3 complete, with the Task 0 and Task 12 counts.
  - The spec amendments of 2026-10-15.
  - Every stop and how it was resolved.
  - Next: unit 1B.4 (staff SSO), with its plan "written at unit start".

- [ ] **Step 4: Commit.** `docs(progress): record phase 1B unit 1B.3`
