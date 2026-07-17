# App split implementation inventory

**Baseline commit:** `a34287c` (architecture plan). This inventory describes the single-runtime implementation before route cutover.

## Runtime surface count

| Area | Current count/location | Target owner |
|---|---|---|
| Pages | 81 routes under `apps/web/src/app` | Split by matrix below |
| Route handlers | 18 files / 20 HTTP method exports | Manager auth; tenant API/payment/webhooks |
| Server actions | 21 modules / 114 exported actions | Split by capability; four mixed modules require function-level separation |
| Queue consumers | `apps/worker` | Worker only |
| Browser/PWA runtime | Serwist `/sw.js`, WebUSB, event-day routes in `apps/web` | Tenant-web only |
| Browser tests | 26 Playwright specs, one single-origin runner | Multi-runtime edge topology |
| Load tests | One k6 registration/check-in suite | Tenant-web topology plus full connection budget |

## Route ownership

| Current route family | Target runtime | Cutover rule |
|---|---|---|
| `/`, `(marketing)/**`, `/docs/**` | platform-manager | Preserve central URLs |
| `(auth)/**`, `/api/auth/**` | platform-manager | Move atomically with issuer session and code exchange |
| `/account/**`, `/transfer/[requestId]` | platform-manager | Keep public identity independent of `OrgMember` |
| `/platform/**`, platform payout export | platform-manager | Platform-only guards and audit remain server-side |
| `/dashboard/**` | tenant-web | Canonical console host; membership/resource-derived guards remain |
| `(convention)/[orgSlug]/**` | tenant-web | Canonical tenant/custom host; legacy central path becomes redirect only |
| `/checkout/**`, payment-status and public confirmation APIs | tenant-web | Move with public portal/payment state machine |
| `/api/v1/**` | tenant-web | API key is the stored tenant authority; `lastUsedAt` makes this a writer |
| Stripe/SePay inbound webhooks | tenant-web | Exactly one canonical provider endpoint during cutover |
| Registration/analytics exports | tenant-web | Preserve resource-derived authorization |
| Service worker and event-day assets | tenant-web | Never served or registered by manager |

Legacy central tenant paths requiring compatibility are not limited to checkout/transfer. They include `/{orgSlug}`, `/register`, `/store`, `/hotel`, `/volunteer`, and `/vendor-apply`. Platform-manager must resolve the stored active tenant and redirect to an absolute tenant-web URL; it must not retain a duplicate portal renderer.

## Action ownership

Platform-only modules/functions:

- `auth-actions`: register, recovery request, password reset.
- `account-actions`: profile update.
- `platform-actions`: lifecycle, initial owner resend, domain verify/activation.
- `payment-actions`: platform provider/payment support UI, subject to the canonical payment-writer rule below.

Tenant-only modules:

- branding, cart, checkout, event, hotel, registration, staff, store, Stripe onboarding, vendor, voucher;
- Phase 5 event operations and organization-scoped SaaS actions.

Mixed modules that cannot be copied wholesale:

| Module | Manager capability | Tenant capability |
|---|---|---|
| `org-actions` | Provision organization | Update org/request domain/invite or remove member |
| `invitation-actions` | Accept invitation | Revoke tenant invitation |
| `email-delivery-actions` | Replay masked platform delivery | Replay event-scoped delivery |
| `registration-transfer-actions` | Central recipient UI | Request/cancel and canonical registration/add-on/badge mutation |

## Canonical writer decisions

### Registration transfer

Tenant-web is the sole writer for registration ownership, add-ons, badge invalidation/regeneration, and transfer state transitions. Platform-manager owns the recipient-facing account UI and sends an authenticated, idempotent command to the tenant capability. It does not import/copy the tenant mutation.

### Payment support

Tenant-web/shared transactional payment capability remains the sole writer for order fulfillment/reversal, attempts, ledger and refund state. Platform-manager may review exceptions and initiate an audited idempotent support command, but must not keep an independent `reverseOrderFulfillment` mutation after cutover.

### Control-plane lifecycle/domain/payment policy

Platform-manager is the sole writer. Each transaction writes a durable control-plane outbox record before commit. Tenant-web consumes idempotently and invalidates its tenant-directory cache; cross-deployment `revalidatePath` is not accepted as delivery.

## Atomic cutover families

1. **Identity issuer and relying session:** auth routes/config, login/register/reset, invitation acceptance, `authVersion`, authorization-code persistence/exchange and cookie policy.
2. **Public portal plus checkout/payment:** public registration/store/hotel/vendor/volunteer, order creation, checkout token/status, fulfillment, Stripe/SePay callbacks and checkout expiry. There must be one transitional owner for the entire family.
3. **Organizer organization family:** org settings/members/API keys/webhooks/Stripe/billing.
4. **Event core:** events, tiers and add-ons.
5. **Registration/event-day:** registrations, transfers, badges, check-in and PWA.
6. **Commerce:** store/cart/orders/refunds and hotel.
7. **People:** volunteer/staff and vendor/booths.
8. **Advanced event:** raffle, branding and event email operations.
9. **Control plane:** lifecycle/domain/payment configuration plus durable outbox.

A family has one canonical writer at a time. Webhook endpoints and recurring schedulers cannot run concurrently in both web apps.

## Auth extraction inventory

The current `apps/web/src/lib/auth.ts` combines identity issuance with a large navigation snapshot: every session read loads platform role, all memberships, organizations and events. Shared auth must instead identify the user and bind `authVersion`/identity-session state; tenant-web queries fresh membership/resource authority.

Required package seams:

- `@vfurst/auth/core`: email/password/token/PKCE/local-return/cookie primitives.
- `@vfurst/auth/manager`: central Auth.js issuer and explicit manager cookie.
- `@vfurst/auth/relying-party`: tenant authorization transaction, server exchange and host-only relying session.
- `@vfurst/auth/public-account`: account identity primitives without Next redirects.
- `@vfurst/auth/invitations`: shared token/email/expiry primitives; owning app keeps delivery and redirects.

The browser cannot share a cookie across manager, console and customer custom domains. Cross-app login uses short-lived single-use authorization code + PKCE, exact callback allowlist and server-to-server exchange. A local relative `safeReturnTo` remains separate and must not be loosened to accept arbitrary absolute URLs.

## Tenant-context extraction inventory

Current tenant resolution is duplicated across `middleware.ts`, `platform-hosts.ts`, `convention.ts`, `subdomain.ts` and some direct page/API queries. The package seam must provide:

- pure hostname normalization/classification with an explicit root/manager/console/API/reserved host policy;
- immutable tenant context and typed unknown/inactive/invalid-host errors;
- directory interface plus a minimal Prisma adapter;
- canonical tenant URL/path builders;
- active-tenant assertion separated from settlement-safe stored-resource authority.

The edge must reject unknown/reserved/forged hosts and overwrite internal forwarding headers. Existing middleware accepts every non-platform host and does not scrub caller-supplied `x-vfurst-*` headers on platform pass-through.

Custom-domain compatibility detail: when an organizer requests a replacement domain, the previous active `customDomain` remains assigned while status moves to pending. Resolution therefore uses the stored assigned hostname plus organization lifecycle; it must not simply require `customDomainStatus === ACTIVE`.

## Cache and PWA inventory

- Platform lifecycle/domain actions currently invalidate public/dashboard paths with local `revalidatePath`; this fails after deployment separation.
- Public convention shell and registration content use 15-second Next caching. Tenant-directory lifecycle state must be a separate cache and invalidated by durable control-plane events.
- Current `/sw.js` has default origin-wide scope and global cache/queue names. It caches authenticated check-in surfaces. Tenant-web must scope and partition caches/queues by tenant/event/user or purge them on identity/context change.
- Existing E2E mostly blocks service workers; add real scope/cache/replay tests before cutover.

## Queue and worker inventory

Queues are `email`, `email-dead-letter`, `badge`, `reconcile`, and `webhook`. Producers exist in web code, consumers/schedulers in worker. Job names/payload schemas/retry policy are duplicated and must move into `@vfurst/contracts` or a later queue package.

Recurring work remains worker-only:

- fee reconciliation daily;
- SePay reconciliation every 15 minutes;
- checkout expiry every minute;
- email recovery every minute.

The existing web `prestart` runs Prisma push/backfills. It must become one release job; copying it to both apps would create rollout races.

## Environment and test topology changes

Split the overloaded `NEXT_PUBLIC_APP_URL` into explicit manager, console, API and tenant-root configuration. Stripe Checkout, Stripe Connect, emails and account links must each use their owning canonical URL.

Connection readiness becomes:

```text
(platform-manager replicas + tenant-web replicas + worker replicas) × per-process connection limit
  <= application connection budget
```

The E2E runner must start manager, tenant-web, worker and a host-preserving local edge. Tests need independent manager/console/tenant/custom-domain origins and the authorization-code flow. The load runner targets tenant-web but includes manager/worker connections in the capacity preflight.

## Baseline tests to retain and extend

- Managed containment and resource-authorization suites across two organizations.
- Organization invitation, password recovery, public account and transfer suites.
- Platform lifecycle/domain/payment-boundary suites.
- Stripe/SePay webhook, provider-disabled settlement and payment replay suites.
- Shared Redis rate-limit and database-pool/load tests.
- Convention/portal-path/lifecycle unit tests.

New gates cover forged/reserved hosts, internal-header spoofing, manager↔tenant auth exchange, cookie isolation, cross-runtime logout/revocation, durable cache invalidation, exactly-one webhook handling and real PWA scope/data isolation.
