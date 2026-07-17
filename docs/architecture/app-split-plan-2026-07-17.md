# Plan: split the web runtime into platform-manager and tenant-web

**Status:** implementation in progress. Shared seams, independent application runtimes, central identity handoff, durable control-plane events, and the first read-only tenant dashboard boundary are implemented and verified. Production traffic cutover and the remaining route families have not started.

## Decision

Split the current `apps/web` deployment into two independently deployable Next.js applications while retaining the Turborepo workspace, PostgreSQL database, Redis, object storage, email package, and worker initially.

```text
apps/
  platform-manager/  central identity/account and platform control plane
  tenant-web/        organizer workspace, public portals, checkout, tenant API
  worker/            shared asynchronous processing
packages/
  auth/              shared identity/session and authorization primitives
  db/                Prisma schema, client, migrations, and DB utilities
  tenant-context/    hostname-to-tenant resolution and lifecycle boundary
  contracts/         versioned schemas, internal commands, events, and DTOs
  email/             existing email abstraction
```

There is one shared database at this stage. This is a deployment and ownership split, not a database-per-tenant or repo-per-tenant design. A dedicated tenant deployment/database remains a later enterprise exception, not the default architecture.

## Target responsibilities

| Runtime | Canonical hosts/routes | Owns | Must not own |
|---|---|---|---|
| `platform-manager` | `vfurst.reyuugames.com`, `/platform/*`, `/account/*`, auth/invitation/recovery, marketing, legal, docs | Platform administration, tenant lifecycle, domain activation, global payment configuration, identity issuance, public account history, audit/support | Organizer operations, public convention content, tenant checkout mutations |
| `tenant-web` | `console.vfurst.reyuugames.com/dashboard/*`, `{tenant}.vfurst.reyuugames.com`, activated custom domains, tenant checkout, tenant REST API | Organizer workspace, public portal, event operations, public checkout, tenant API keys/webhooks, PWA event-day routes | Provisioning tenants, lifecycle/domain activation, platform fee/provider changes, platform-wide inventory |
| `worker` | No public host | Email delivery, badges, reconciliation, checkout expiry, outbound webhooks, durable event consumption | Browser sessions, page authorization, platform UI |

`/platform/*` remains a platform-admin-only control plane. `/dashboard/*` remains membership-scoped. A public account remains independent of `OrgMember`; it is hosted centrally because it must work safely even when a tenant uses a customer-controlled custom domain.

## Public host and routing model

The edge/router selects a deployment before Next.js runs. It does not rely on the current single-app rewrite to make one deployment impersonate another one.

| Incoming host/path | Destination | Compatibility action |
|---|---|---|
| `vfurst.reyuugames.com`, `/platform/*`, `/account/*`, auth, marketing, docs | `platform-manager` | Keep canonical URLs where possible |
| `console.vfurst.reyuugames.com/dashboard/*` | `tenant-web` | Redirect legacy central `/dashboard/*` URLs to this host |
| `{subdomain}.vfurst.reyuugames.com/*` | `tenant-web` | Tenant context comes from the hostname |
| Activated custom domain | `tenant-web` | Tenant context comes from the hostname only after platform activation |
| `api.vfurst.reyuugames.com/v1/*` or the canonical tenant API host selected during implementation | `tenant-web` | Preserve existing v1 response contracts |
| Legacy root checkout/transfer and `/{orgSlug}/...` portal URLs | `platform-manager` compatibility handlers | Resolve the stored resource, then issue one safe absolute redirect to the canonical tenant-web route |

The edge host allowlist is platform-owned. An arbitrary `Host` header, an unverified custom domain, or a suspended organization must never reach a tenant route as an authorized tenant context.

## Shared package boundaries

### `@vfurst/db`

Keep Prisma schema/client, direct/runtime connection policy, migrations/backfills, fee and payment-attempt utilities here. Both web apps and the worker use it. The package does not import Next.js, app routes, or UI code.

Every query remains resource-derived and tenant-scoped. The split is not permission to rely on a network boundary instead of `orgId`/stored-resource checks.

### `@vfurst/auth`

Extract the current Auth.js configuration, user/session claim types, password/OAuth providers, session-version invalidation, `safeReturnTo`, account lookup, and role helpers from `apps/web/src/lib/auth.ts` and related public-account helpers.

`platform-manager` is the sole identity issuer. It owns login, registration, password reset, invitation acceptance, and central account routes. `tenant-web` is a relying application; it does not share a browser cookie with the manager or a customer custom domain.

The cross-app login flow is required before moving protected tenant routes:

1. A protected tenant-web route redirects to the manager with an allowlisted absolute callback descriptor and a PKCE-style verifier/state.
2. The manager authenticates the user with its host-only cookie, then returns a short-lived, single-use authorization code to the callback.
3. Tenant-web exchanges the code server-to-server, validates issuer, audience, expiry, redirect binding, and `authVersion`, and writes its own host-only session cookie.
4. Tenant-web always derives membership/public ownership from the database for sensitive work; session claims only identify the user and may provide a short-lived navigation snapshot.

Authorization codes, access tokens, tenant IDs, and session cookies must not be placed in a reusable query string. Logout, password reset, membership removal, and `authVersion` changes invalidate or reject both relying-app sessions. Customer domains never receive the manager cookie.

### `@vfurst/tenant-context`

Extract hostname normalization, root/platform-host recognition, custom-domain activation checks, `resolveOrganization`, convention root generation, and lifecycle enforcement from the current `platform-hosts`, `subdomain`, `convention`, `portal-path`, and related libraries.

The package returns a minimal immutable context:

```ts
type TenantContext = {
  organizationId: string;
  slug: string;
  hostname: string;
  domainKind: "platform-subdomain" | "custom-domain";
  status: "ACTIVE" | "SUSPENDED" | "PROVISIONING" | "RETIRED";
};
```

Only an `ACTIVE` context enables new public/organizer activity. Settlement-safe provider callbacks, reconciliation, refunds, and payout processing use explicit stored-order authority instead of bypassing tenant checks generically.

For the shared-database phase, tenant-web reads a cached, minimal tenant-context projection locally; it does **not** synchronously call platform-manager on every page/action. Platform-manager emits a durable control-plane event when lifecycle/domain/configuration changes so tenant-web invalidates its context/cache promptly. The package must hide the storage adapter so a later manager API or directory store can replace this read path without changing route code.

### `@vfurst/contracts`

Create a dependency-light package (Zod and TypeScript only) containing:

- versioned public API DTOs and webhook envelope schemas;
- internal service-auth request/response schemas;
- platform control commands such as provision, lifecycle transition, domain activation, and payment configuration;
- durable control-plane event names/payloads, for example `tenant.lifecycle-changed`, `tenant.domain-activated`, and `platform.payment-policy-changed`;
- redirect/code-exchange claims and error codes shared by both apps.

No app may import another app's action, route handler, or `@/` alias. Cross-app calls use contracts, authenticated service identity, timeouts, idempotency keys for commands, and audit IDs.

## Control-plane integration

Platform-manager remains the sole writer for tenant lifecycle, platform subdomain reservation, custom-domain activation, global providers, and fee policy. Tenant-web may request only explicitly designed platform capabilities; it must never mutate those tables/fields directly.

Add a durable database outbox for control-plane events before relying on cross-deployment cache invalidation. A worker dispatcher publishes events to Redis or a later broker; consumers persist a cursor/idempotency record. The outbox prevents a successful lifecycle/domain transaction from being lost if Redis is unavailable.

The initial internal API surface is deliberately small:

| Capability | Direction | Notes |
|---|---|---|
| Identity authorization-code exchange and session revocation | tenant-web ↔ platform-manager | Server-to-server only; short-lived, audience-bound credentials |
| Tenant context/config read fallback | tenant-web → platform-manager | Cache miss/emergency fallback only; not on normal request path |
| Tenant lifecycle/domain/payment policy changes | platform-manager → database + durable event | No tenant-web write path |
| Tenant operational events for platform support/audit | tenant-web → durable event/outbox | Asynchronous, idempotent, no user session forwarding |

Use a separate service credential for each runtime, with rotation, issuer/audience validation, and an audit correlation ID. Browser clients never call this internal API.

## Route and runtime migration inventory

| Current area in `apps/web` | Target | Notes |
|---|---|---|
| `app/platform/**`, platform shell, `platform-actions`, domain/payment operations, platform email operations | `platform-manager` | Move server actions with their resource authorization and audit logic |
| `(auth)/**`, `account/**`, `transfer/**`, auth API route | `platform-manager` | Become central identity/account issuer and relying-app callback authority |
| Marketing, legal, request access, embedded docs | `platform-manager` | Preserve root-domain public entry points |
| `dashboard/**`, organizer shell, event/organization actions | `tenant-web` | Canonical host becomes `console`; preserve membership/resource-derived guards |
| `(convention)/**`, portal components, public account gate | `tenant-web` | Resolve tenant only from verified hostname/context |
| `checkout/**`, payment-status API, public confirmation API | `tenant-web` | Retain signed checkout context and provider-neutral fulfillment; cut over with the public portal that creates these orders |
| `/api/v1/**`, tenant API-key/webhook settings/actions | `tenant-web` | API key remains the tenant authority, not a caller-provided org ID |
| Stripe/SePay inbound routes | `tenant-web` initially | Keep signed, idempotent callback behavior and settlement-after-suspension contract; provider configuration UI remains manager-only |
| PWA/Serwist and WebUSB event-day UI | `tenant-web` only | Build and serve the service worker from tenant-web; do not let manager routes share its scope |
| S3, queues, payment policies, registration policy, lifecycle reads, webhook delivery helpers | Shared package or owning runtime after dependency audit | Extract in small verified units; do not move broad utility folders blindly |

## Migration sequence

### 0. Baseline and design gates

- Record this plan, the canonical hostnames, ownership matrix, and compatibility redirects.
- Inventory every route, action, API handler, webhook, worker job, queue producer, `revalidatePath`, environment variable, and Playwright test before moving files.
- Freeze schema-destructive work during the split. The initial required schema change is additive: durable control-plane outbox/consumer idempotency and authorization-code state only.

### 1. Establish shared contracts and package seams

- Create `@vfurst/contracts`, `@vfurst/tenant-context`, and `@vfurst/auth` with exhaustive unit tests while `apps/web` remains the only serving runtime.
- Keep behaviour identical: `@vfurst/db` remains the only Prisma client factory; no shared package imports Next.js routing APIs.
- Replace direct imports incrementally and prove there is no app-to-app import or duplicate Prisma singleton.

### 2. Build the two application shells without traffic cutover

- Create `apps/platform-manager` and `apps/tenant-web` with independent package manifests, Next configuration, instrumentation, environment validation, and local ports.
- Move reusable UI only when it has a real second consumer. Initially keep feature UI with its owning app; a premature universal UI package would recreate the current coupling.
- Stand up an edge/local reverse-proxy test topology that routes central, console, subdomain, and custom-domain hosts to the intended app.

### 3. Move central identity/account and platform control plane

- Move auth/account/invitation/recovery plus `/platform/*` into platform-manager.
- Implement and test the authorization-code exchange before moving any protected dashboard/public mutation.
- Keep legacy central URLs as narrow redirects or compatibility handlers; never render duplicate writable route implementations.

### 4. Move tenant runtime atomically by route family

- Move public portal and checkout/payment as one atomic family: portal mutations, order creation, checkout page/status, signed token validation, payment actions, provider callbacks, fulfillment and checkout expiry always have one transitional owner.
- Move organizer dashboard by complete event/organization action family.
- Move tenant REST API, outbound webhooks, PWA, and event-day routes only after their action/resource guards are in tenant-web.
- A route family has one canonical writer during each cutover. Never run copied server actions from both apps against the same mutable resource.

Central account registration-transfer decisions and platform payment-support actions are cross-runtime UI cases, not exceptions to the single-writer rule. Platform-manager sends an authenticated idempotent command to the canonical tenant writer for registration/add-on/badge or order/fulfillment state changes; it does not keep a duplicate transactional mutation.

### 5. Replace single-runtime assumptions

- Replace cross-surface `revalidatePath` assumptions with durable control-plane events plus app-local invalidation. Treat each deployment's Next cache as independent.
- Namespace Redis keys by environment and concern while preserving shared global rate-limit semantics. Continue to use the same Redis deployment for quotas consumed across tenant-web replicas.
- Update generated URLs, email links, checkout redirects, webhook URLs, S3 origins, CORS/CSRF/trusted-host lists, and Sentry releases to the canonical hosts.

### 6. Cutover, rollback, and cleanup

- First deploy both apps behind the edge with no duplicate webhook/worker consumers.
- Cut over by host/route family, monitor authentication exchange errors, tenant-context mismatches, payment callbacks, queue depth, cache hit rate, and cross-tenant denial rates.
- Keep a reversible edge route for each migrated read-only family. For write/payment/webhook cutovers, rollback only by returning the entire canonical family; do not replay a request through both runtimes.
- Remove `apps/web` and compatibility routes only after the complete persona matrix, payment tests, public-account tests, and a stable post-cutover observation window pass.

## Non-negotiable invariants

- A user identity is not an organization membership. Public account access never grants organizer or platform access.
- Tenant context is derived from a verified hostname, stored resource, API key, or signed provider callback—not from a submitted `orgId`.
- Platform-manager does not silently act as an `OrgMember`; support actions remain explicit, tenant-scoped, and auditable.
- A suspension blocks new tenant activity but cannot strand signed callbacks, reconciliation, refunds, payouts, or existing-order settlement.
- Stripe/SePay signing, checkout token validation, idempotent fulfillment, active-attempt locking, currency separation, shared Redis rate limits, and bounded Prisma pools remain intact.
- No browser shares a broad parent-domain session cookie with customer domains. All cookies are `Secure`, `HttpOnly`, host-only, and appropriate `SameSite` values are tested.
- The shared database is not an excuse for unscoped queries. Existing resource-derived authorization tests remain mandatory after every moved family.

## Verification gates for the split

Before any production cutover, require all normal repository checks plus:

1. Both Next apps build, type-check, lint, and unit-test independently; worker still builds/tests against the shared packages.
2. Edge-routing tests prove every central, console, subdomain, custom-domain, inactive, and forged-host request reaches only the intended runtime.
3. Login/code exchange tests cover normal login, invalid state, expired/replayed code, wrong audience/host, unsafe return URL, logout, password reset, and membership removal.
4. The existing two-organization, multi-persona matrix passes across both deployments for pages, actions, APIs, exports, uploads, checkout, and webhooks.
5. Platform lifecycle/domain/payment operations are unreachable from tenant-web; organizer/public operations are unreachable from platform-manager except explicit account/auth routes.
6. Stripe and SePay signed callbacks are handled exactly once during a deployment cutover and can still settle existing orders for suspended tenants.
7. Email/invitation/transfer links, API contracts, outbound webhook signatures, and checkout return URLs resolve to their canonical runtime without leaking tokens.
8. PWA registration is limited to tenant-web event-day origins and cannot control manager routes.
9. Recalculate the Prisma connection budget using `(platform-manager replicas + tenant-web replicas + worker replicas) × connection limit`; then rerun the fresh 500-registration/50-check-in proof because the runtime topology changes materially.
10. Sentry identifies runtime/app/route ownership, and dashboards expose auth-exchange failures, tenant-context cache/event lag, payment webhook failures, worker lag, and cross-tenant denials.

## Deferred decisions

- Database-per-tenant, dedicated enterprise runtime, and separate Git repositories are explicitly deferred until a tenant requires an isolated SLA, compliance boundary, or a measured workload that cannot be handled by tenant-web horizontal scaling.
- Replacing direct shared-database tenant-context reads with a manager-owned directory API is deferred until measured scale or data ownership requires it. The adapter and contracts are designed now so that future change does not affect route authorization.
- A third standalone identity service is out of scope. Identity is a dedicated capability within platform-manager in this two-app phase.
