# Phase 7 — Launch (Weeks 35–37)

> **Goal**: Correct the tenant/control-plane boundary, complete the system-wide Operational Calm UX, production payment operations, beta program, security/accessibility/performance evidence, legal/marketing surfaces, and public-launch readiness for the managed SaaS model.

---

##### Managed tenant control plane and P0 authorization remediation

The launch target is the managed/invite-only model defined in `00-reference.md`. The self-service behavior in which any authenticated user can create an organization is invalid and must be removed before deployment.

- Only `PLATFORM_ADMIN` may provision, activate, suspend, or retire an organization, assign the first owner, activate custom domains, or change global payment configuration.
- Public account creation remains available for attendees, vendors, volunteers, and account history, but grants no `OrgMember`, organizer dashboard access, organization creation, or event creation.
- Organization provisioning creates an expiring, single-use owner invitation. Acceptance creates the membership transactionally; temporary/shared passwords and bare-user upserts are not onboarding.
- Organization owners/admins can invite members only into their own organization and can create events only beneath a verified membership.
- `/platform/*` is a separately guarded control plane. `/dashboard/*` is a membership-scoped organizer workspace. Public tenant portals remain on organization subdomains or platform-activated custom domains.
- Add `Organization.status` (`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `RETIRED`) and `OrgInvitation`; backfill existing organizations to `ACTIVE` and preserve all users, memberships, registrations, orders, and settlement records. Retirement is soft/non-destructive.
- Add one guarded `[orgId]` boundary for every organization page. An organizer never receives an all-tenant organization list or foreign organization/event options.
- Centralize resource-derived authorization for every action family. Do not authorize a submitted `orgId` and mutate a separately submitted registration, event, product, booking, application, badge, voucher, raffle, or other resource ID.
- Cross-tenant page reads and mutations must fail for Org A owner/admin/member and a public user when targeting Org B. Separate platform-admin cases prove control-plane visibility without silently granting normal organizer membership or bypassing auditable support flows.
- Close the unsigned Stripe webhook path and keep signed provider callbacks/reconciliation available for already-created payments even when a tenant is suspended.

The blocking evidence and action-family inventory are recorded in `docs/launch/full-system-audit-2026-07-13.md` (`SEC-01` through `SEC-03`). Do not treat navigation hiding alone as remediation; server routes, actions, APIs, exports, and webhooks enforce their own boundaries.

Implementation order (one verified logical unit and conventional commit at a time):

1. **Containment** — require `PLATFORM_ADMIN` for organization creation/listing, remove organizer tenant-creation UI, scope event-create choices to memberships, guard the organization route tree, and add direct-URL persona tests.
2. **Resource-derived authorization** — replace hidden-tenant authorization across events/tiers/add-ons, registration/notes/transfers, store/hotel, staff/vendors, badges/check-in, raffles/vouchers, API keys/webhooks, exports, and uploads; add cross-tenant mutation tests per family.
3. **Lifecycle and invitations** — add the organization lifecycle fields and `OrgInvitation`, backfill existing tenants, implement hashed/expiring/revocable invitation acceptance, and migrate member invitation behavior without deleting existing memberships.
4. **Surface separation** — move all-tenant inventory/provisioning and global payment operations into `/platform/*`; make `/dashboard/*` membership-only; add public-account/no-organizer-access behavior and safe legacy-route redirects.
5. **Domain, payment, and acquisition boundaries** — split domain request from platform activation, keep global providers/fees/settlement platform-only, retain organizer Stripe-hosted onboarding and tenant reports, and replace self-service marketing CTAs.
6. **Launch proof** — run the complete persona matrix, full repository checks, load/accessibility gates affected by the route changes, rerun the full-system audit, and update `PROGRESS.md` before beta or deployment work resumes.

Do not start invitation/schema or visual route migration work until containment is merged and tested. Do not deploy an intermediate state that moves buttons without the corresponding server authorization.

##### Operational Calm UI/UX redesign

- Light-only Geist design system with warm canvas, teal semantic accents, compact operational density, consistent status/empty/loading/error treatments, and reduced-motion support.
- Separate platform and organizer shells. The organizer shell has membership-only organization/event switchers, grouped event navigation, active states, breadcrumbs, collapsible desktop rail, mobile drawer, user menu, and Ctrl/Cmd-K command menu with focus restoration; it never shows tenant provisioning or an all-tenant scope.
- Rebuild dashboard home, event/list/overview/registration/analytics/settings reference surfaces, then apply the system to store, hotel, staff, vendors, raffle, badges, designer, check-in, cashier, and express kiosk.
- Dedicated focus layouts and scoped offline-service-worker registration for event-day routes.
- Branded public convention shell and guided Ticket → Attendee/Add-ons → Review/Payment registration.
- Event branding stored under `Event.settings.branding`: constrained logo/cover uploads, contrast-protected accent color, live preview, and organization/initials/system-pattern fallbacks.
- Shared marketing/footer shell, public-account auth framing, invitation acceptance, embedded docs navigation, and branded Stripe/SePay checkout without changing fulfillment contracts.

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

##### [NEW] `apps/web/src/app/platform/payments/page.tsx`

- Platform-admin Stripe/SePay enablement and readiness controls.
- Central bank, SePay account, memo-prefix, and configured VND fee settings.
- Payment-exception resolution, organizer settlement export, recorded payouts, and manual SePay refund operations.
- The organizer `/dashboard/settings` surface contains only account and membership-scoped organization/event settings. It never renders platform payment controls conditionally inside the same page.

See `docs/sepay-rollout.md` for the sandbox, enablement, payout, refund, and production runbook.

##### Beta program with 2–3 real conventions

- Recruit beta conventions and offer free/discounted usage.
- Onboard each beta through platform provisioning → owner invitation acceptance → tenant activation → first event creation. Do not seed or create organizers through a public workspace-signup flow.
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
- Prisma query parameterization and explicit resource-derived authorization/tenant checks.
- Persona-matrix coverage for platform admin, two unrelated tenant owners, org admin, org member, and public user across pages, actions, APIs, exports, uploads, and payment operations.
- Invitation token hashing, expiry, single-use acceptance, revocation, email binding, and replay tests.
- Tenant lifecycle tests: suspended tenants cannot start new public orders or organizer mutations, while signed callbacks, reconciliation, payout/refund records, and safe settlement completion remain available.
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

- `apps/web/src/app/page.tsx` — responsive landing page and operations preview with managed-sales CTAs such as request access/contact; no “create your workspace” promise
- `apps/web/src/app/(marketing)/pricing/page.tsx` — currency/payment-aware pricing and fee calculator
- `apps/web/src/app/(marketing)/features/page.tsx` — feature deep-dives

##### Playwright acceptance suite

```bash
npm run test:e2e
```

- Stripe registration fulfillment and signed SePay QR/webhook/polling flow.
- Platform tenant provisioning, owner invitation acceptance, organizer event creation, check-in, vendor application, and role-scoped settings authorization.
- Direct-URL and mutation attempts proving Org A cannot enumerate, read, or change Org B, and a public account cannot enter `/dashboard`, create an organization, or create an event.
- Platform-only domain/payment/lifecycle operations and organizer-only tenant operations remain separated in navigation and server authorization.
- Axe, keyboard/focus, mobile containment, and screenshot-baseline coverage.
- Production-mode regression coverage for reserved create-event route parsing.

##### Completion boundary

Repository-side launch gates can be verified locally. Phase 7 cannot be marked complete until the managed provisioning flow, separated control plane, `SEC-01` through `SEC-03`, and full cross-tenant regression matrix pass. It then remains in progress until all external evidence is recorded: two platform-provisioned real beta conventions, live deployment/marketing verification, production Sentry environment, real SePay Sandbox evidence, and a physical NVDA or VoiceOver pass.

---
