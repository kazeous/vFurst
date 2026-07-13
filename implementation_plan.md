# vFurst — Implementation Plan

> [!IMPORTANT]
> The authoritative build plan is split across [`docs/plan/`](docs/plan/). This file is the maintained architecture and status index; phase-specific file contracts remain in the linked phase documents so the plan does not drift through duplication.

vFurst is a multi-tenant convention and event-management SaaS built as a Next.js 15/Turborepo application with PostgreSQL, Prisma, Stripe Connect, SePay VietQR, BullMQ, and Redis.

## Current plan status

| Phase | State | Authoritative plan |
|---|---|---|
| 0 — Foundation | Verified complete | [`phase-0-foundation.md`](docs/plan/phase-0-foundation.md) |
| 1 — Core infrastructure | Verified complete | [`phase-1-core-infra.md`](docs/plan/phase-1-core-infra.md) |
| 2 — Registration and hotel | Verified complete | [`phase-2-registration.md`](docs/plan/phase-2-registration.md) |
| 3 — Store and add-ons | Verified complete | [`phase-3-store.md`](docs/plan/phase-3-store.md) |
| 4 — Volunteers and vendors | Verified complete | [`phase-4-volunteers-vendors.md`](docs/plan/phase-4-volunteers-vendors.md) |
| 5 — Advanced/event-day features | Verified complete | [`phase-5-advanced.md`](docs/plan/phase-5-advanced.md) |
| 6 — SaaS layer | Verified complete | [`phase-6-saas.md`](docs/plan/phase-6-saas.md) |
| 7 — Launch | In progress | [`phase-7-launch.md`](docs/plan/phase-7-launch.md) |

`PROGRESS.md` and the repository are the ground truth for completion. A phase plan describes intent, not proof that the work exists.

## Resolved architecture

| Area | Current decision |
|---|---|
| Multi-tenancy | Organization subdomains plus Phase 6 custom domains. Public convention routes carry an explicit `[orgSlug]` segment internally so middleware rewrites remain tenant-safe. |
| UI/UX | Light-only “Operational Calm”: Geist typography, warm canvas, teal semantic accent, compact operational density, responsive layouts, reduced motion, and accessible local shadcn/Radix primitives. |
| Organizer navigation | One responsive shell with organization/event switchers, grouped event navigation, breadcrumbs, collapsible desktop rail, mobile drawer, user menu, and Ctrl/Cmd-K command menu. Event-day check-in/kiosk routes use focused layouts. |
| Public experience | Branded convention shell, event logo/cover/accent settings, guided Ticket → Attendee/Add-ons → Review/Payment registration, responsive store/application pages, and branded provider-neutral checkout. |
| Mobile/event day | Responsive web/PWA surfaces are the supported event-day client. A separate React Native application is not part of the current phase plan. |
| Payments | Provider-neutral order fulfillment. Stripe Connect destination charges handle card settlement; configured VND events may also use SePay VietQR into the platform account with organizer ledger settlement. |
| Currency | Event and Order currency is immutable. USD values use cents; VND values use whole đồng. |
| Deployment | Phases 0–7 verify against local Docker Compose. Production hosting and cloud cutover are separate post-verification work. |
| Validation and types | Zod and TypeScript contracts are colocated with the owning web, API, payment, and package modules. Empty `packages/validators` and `packages/types` workspaces are not planned. |

## Operational Calm UI/UX amendment

The redesign is a system-wide Phase 7 requirement, not a cosmetic landing-page task.

- Preserve existing URLs, server actions, permissions, API contracts, fulfillment rules, and data ownership.
- Apply one semantic token system across marketing, auth, docs, organizer dashboards, event operations, public convention pages, registration, checkout, hotel, store, volunteers, vendors, badges, check-in, cashier, and express kiosk.
- Use consistent page headers, actions, status treatments, empty/loading/error states, tables, forms, spacing, and English date/currency formatting.
- Keep all primary mobile actions at least 44 px, prevent horizontal overflow at 390 px, support keyboard navigation and focus restoration, and honor `prefers-reduced-motion`.
- Derive event accent tokens with contrast protection. Branding accepts constrained PNG/JPEG/WebP assets and falls back to organization art, initials, or the system pattern.
- Register the offline service worker only from production check-in/kiosk surfaces. Development does not bundle it, and the rest of the application does not auto-register it.
- Protect the redesign with axe scans, keyboard/focus tests, responsive checks, critical-path E2E coverage, and stable desktop/mobile screenshot baselines.

## Provider-neutral payment amendment

### Shared checkout contract

Registration, store/cart, hotel, and approved vendor purchases create a pending Order and redirect to `apps/web/src/app/checkout/[orderId]/page.tsx`.

1. Zero-value orders complete without a provider.
2. USD orders use Stripe Connect destination charges.
3. Configured VND orders can offer Stripe and embedded SePay VietQR.
4. A signed checkout token binds the browser to the order without exposing mutable payment context.
5. Provider attempts reserve inventory for 30 minutes and lock unsafe provider switching while active.
6. `markOrderPaidWithProvider` performs the single atomic, idempotent fulfillment transition for both providers.

### Stripe settlement

- vFurst creates and owns the charge.
- `transfer_data.destination` sends organizer proceeds to the connected account.
- `application_fee_amount` collects the platform fee exactly once at checkout.
- Stripe webhooks and payment-intent IDs drive idempotent paid/refund transitions.

### SePay settlement

- The attendee receives an embedded VietQR plus accessible bank-transfer fallback details and a unique memo.
- The webhook verifies HMAC-SHA256 over `{timestamp}.{raw_body}`, rejects replays outside five minutes, and deduplicates by SePay transaction ID.
- Exact whole-đồng amount and memo matching fulfill the order. Unknown, late, underpaid, overpaid, account-mismatched, or invalid transfers create a manual-review exception.
- API v2 reconciliation runs every 15 minutes; expired checkout cleanup runs every minute.
- A paid SePay order credits organizer net proceeds to `OrganizerLedgerEntry`. Platform administrators export settlement data and record external payouts.
- SePay refunds are external bank transfers recorded afterward; fulfillment reversal and the negative organizer ledger entry remain idempotent.
- Provider credentials and the checkout-token secret stay in environment variables. Non-secret bank, fee, and enablement settings are managed by platform administrators.

See [`docs/sepay-rollout.md`](docs/sepay-rollout.md) for the sandbox and production runbook.

## Data model baseline

The schema contains 41 models:

- 29 original product/tenant models listed in [`00-reference.md`](docs/plan/00-reference.md).
- 4 Auth.js infrastructure models: `Account`, `Session`, `VerificationToken`, and `Authenticator`.
- 8 provider-neutral payment/settlement models: `PaymentProviderConfig`, `PaymentAttempt`, `SePayWebhookEvent`, `SePayReconciliationCursor`, `PaymentException`, `OrganizerLedgerEntry`, `OrganizerPayout`, and `PaymentRefund`.

`User.platformRole` separates platform administration from organization RBAC. `Event.currency` and `Order.currency` preserve monetary meaning. Order payment metadata, attempts, checkout expiry, reservations, exceptions, ledger entries, payouts, and refund records support the shared checkout contract.

## Maintained system structure

```text
vFurst/
├── apps/
│   ├── web/
│   │   ├── middleware.ts                 # subdomain/custom-domain routing
│   │   ├── next.config.ts                # Sentry + scoped Serwist build
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/               # login/register framing
│   │       │   ├── (marketing)/          # pricing/features/legal
│   │       │   ├── (convention)/[orgSlug]/ # public tenant portal
│   │       │   ├── checkout/[orderId]/   # shared Stripe/SePay checkout
│   │       │   ├── dashboard/            # organizer/platform operations
│   │       │   ├── docs/                 # embedded product/API docs
│   │       │   └── api/                  # Auth.js, v1, payment, webhooks
│   │       ├── actions/                   # authenticated server mutations
│   │       ├── components/                # UI, dashboard, portal, marketing
│   │       ├── hooks/                     # scoped service-worker registration
│   │       ├── lib/                       # auth, tenant, payment, domain logic
│   │       └── sw/                        # offline check-in source
│   └── worker/
│       └── src/jobs/                      # email, badge, webhook, fee/SePay jobs
├── packages/
│   ├── db/                                # Prisma schema and client
│   └── email/                             # SES/SMTP providers and templates
├── docs/
│   ├── api-contracts/
│   ├── launch/
│   └── plan/
├── scripts/                               # E2E, load, readiness, admin tools
└── tests/
    ├── e2e/
    └── load/
```

This overview records ownership boundaries. Each phase file’s `[NEW]` entries remain the authoritative artifact checklist.

## Verification contract

Run the repository gates before declaring any phase or system audit clean:

```bash
npm run type-check
npm run lint
npm run test
npm run db:validate
npm run build
npm run test:e2e
npm run test:load:smoke
npm run check:launch
```

The detailed phase checklist is [`verification-and-timeline.md`](docs/plan/verification-and-timeline.md). Phase 7 additionally requires:

- the Operational Calm accessibility/responsive/visual acceptance suite;
- Stripe and signed SePay critical paths, polling, fulfillment, refund, reconciliation, and exception handling;
- the documented 500-registration/50-check-in load target;
- a clean dependency/security audit;
- real beta-convention evidence, live deployment verification, production Sentry configuration, real SePay Sandbox evidence, and a physical NVDA or VoiceOver pass.

Repository automation can prove the first four groups. The final external evidence group remains a launch blocker until it is performed and recorded.
