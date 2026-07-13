# Phase 7 — Launch (Weeks 35–37)

> **Goal**: Complete the system-wide Operational Calm UX, production payment operations, beta program, security/accessibility/performance evidence, legal/marketing surfaces, and public-launch readiness.

---

##### Operational Calm UI/UX redesign

- Light-only Geist design system with warm canvas, teal semantic accents, compact operational density, consistent status/empty/loading/error treatments, and reduced-motion support.
- One organizer shell: organization/event switchers, grouped event navigation, active states, breadcrumbs, collapsible desktop rail, mobile drawer, user menu, and Ctrl/Cmd-K command menu with focus restoration.
- Rebuild dashboard home, event/list/overview/registration/analytics/settings reference surfaces, then apply the system to store, hotel, staff, vendors, raffle, badges, designer, check-in, cashier, and express kiosk.
- Dedicated focus layouts and scoped offline-service-worker registration for event-day routes.
- Branded public convention shell and guided Ticket → Attendee/Add-ons → Review/Payment registration.
- Event branding stored under `Event.settings.branding`: constrained logo/cover uploads, contrast-protected accent color, live preview, and organization/initials/system-pattern fallbacks.
- Shared marketing/footer shell, auth framing, embedded docs navigation, and branded Stripe/SePay checkout without changing route, permission, API, or fulfillment contracts.

##### Platform-controlled Stripe/SePay checkout and settlement

- Immutable Event/Order currency, provider-neutral order metadata, signed checkout context, payment attempts, exceptions, organizer ledger entries, payouts, and refund records.
- Shared `apps/web/src/app/checkout/[orderId]/page.tsx` flow for registration, store/cart, hotel, and vendor orders.
- USD uses Stripe Connect destination charges. Configured VND events may offer Stripe and embedded SePay VietQR. Zero-value orders complete without a provider.
- Exact whole-đồng parsing/formatting, compact VietQR, accessible transfer fallback, three-second status polling, 30-minute reservations, expiry cleanup, and active-attempt provider lock.
- Atomic idempotent paid/refund transitions shared by both providers.

##### [NEW] `apps/web/src/app/api/webhooks/sepay/route.ts`

- Verify HMAC-SHA256 over `{timestamp}.{raw_body}` and reject timestamps outside five minutes.
- Deduplicate by SePay transaction ID.
- Match exact account, unique memo, currency, and whole-đồng amount.
- Fulfill exact transfers; create manual-review exceptions for unknown, late, underpaid, overpaid, account-mismatched, or invalid transfers.

##### [NEW] `apps/worker/src/jobs/reconcile-sepay.ts`

- Poll SePay API v2 every 15 minutes using a durable cursor.
- Feed transactions through the same idempotent matching/fulfillment path as webhooks.

##### [NEW] `apps/worker/src/jobs/expire-checkouts.ts`

- Run every minute, expire stale payment attempts, and release reserved capacity/inventory safely.

##### [NEW] `apps/web/src/app/dashboard/settings/page.tsx`

- Platform-admin Stripe/SePay enablement and readiness controls.
- Central bank, SePay account, memo-prefix, and configured VND fee settings.
- Payment-exception resolution, organizer settlement export, recorded payouts, and manual SePay refund operations.

See `docs/sepay-rollout.md` for the sandbox, enablement, payout, refund, and production runbook.

##### Beta program with 2–3 real conventions

- Recruit beta conventions and offer free/discounted usage.
- Collect organizer/attendee feedback and iterate on workflow pain points.
- Monitor production errors through configured Sentry.
- For any VND beta, complete real SePay Sandbox QR, signed-webhook, reconciliation, expiry, exception, payout, and refund simulations before production enablement.

##### Performance and load testing

- k6 load tests on registration and check-in flows.
- Current target: 500 concurrent registration VUs and 50 concurrent check-in VUs.
- Failed content/functional checks fail the gate, even when HTTP status thresholds pass.
- Database query optimization, indexes, connection pooling, and documented production topology.

##### Security audit

- OWASP Top 10 review.
- Prisma query parameterization and explicit authorization/tenant checks.
- React escaping plus input/output validation where rich/user content is handled.
- Auth.js CSRF/session protections and fixed-window rate limiting on auth, payment, webhook, and public API paths.
- Zod validation on mutable boundary inputs.
- `npm audit --audit-level=moderate` must be clean or have a documented non-exploitable exception.

##### PCI and payment compliance

- Stripe handles all card data (SAQ A); vFurst stores no card numbers.
- Stripe Connect destination charges segregate card settlement.
- SePay bank transfers contain no cardholder data but require signed webhooks, replay protection, exact matching, exception review, ledger reconciliation, and externally recorded payouts/refunds.

##### Accessibility and responsive audit

- WCAG 2.1 AA target on key flows.
- Serious/critical axe scans for marketing, public portal, registration/checkout, organizer CRUD, and event-day surfaces.
- Keyboard navigation, focus visibility/restoration, accessible names, mobile drawer behavior, and 44 px mobile targets.
- No horizontal overflow at 390 px; stable desktop/mobile screenshot baselines.
- Physical NVDA or VoiceOver verification remains required before Phase 7 completion.

##### [NEW] Legal pages

- `apps/web/src/app/(marketing)/privacy/page.tsx` — Privacy Policy
- `apps/web/src/app/(marketing)/terms/page.tsx` — Terms of Service
- `apps/web/src/app/(marketing)/dmca/page.tsx` — DMCA Takedown Policy

##### [NEW] Marketing site

- `apps/web/src/app/page.tsx` — responsive landing page and operations preview
- `apps/web/src/app/(marketing)/pricing/page.tsx` — currency/payment-aware pricing and fee calculator
- `apps/web/src/app/(marketing)/features/page.tsx` — feature deep-dives

##### Playwright acceptance suite

```bash
npm run test:e2e
```

- Stripe registration fulfillment and signed SePay QR/webhook/polling flow.
- Check-in, vendor application, organizer CRUD/settings authorization.
- Axe, keyboard/focus, mobile containment, and screenshot-baseline coverage.
- Production-mode regression coverage for reserved create-event route parsing.

##### Completion boundary

Repository-side launch gates can be verified locally. Phase 7 remains in progress until all external evidence is recorded: two real beta conventions, live deployment/marketing verification, production Sentry environment, real SePay Sandbox evidence, and a physical NVDA or VoiceOver pass.

---
