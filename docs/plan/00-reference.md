# vFurst — Reference (plan v2)

> **Plan v2, rebuilt 2026-07-26.** This plan set was rebuilt from three inputs: the implemented codebase, the whole-system runtime audit of 2026-07-26 (`docs/launch/runtime-defect-audit-2026-07-26.md`), and a feature-level comparison against ConCat's public documentation (https://concat.app/docs/guides/intro) and its production UI. The previous 8-phase plan (phases 0–7) and the complete pre-rebuild session history are preserved in git history and are no longer maintained.

> **Phase 1B (2026-10-13)** supersedes the identity, surface, checkout-identity, and split-runtime decisions below; design in docs/superpowers/specs/2026-10-13-identity-replatform-design.md.

vFurst is a managed convention/event-management SaaS platform inspired by [ConCat](https://concat.app): registration tiers, event store, dealers, volunteers, badges, event-day check-in, hotel blocks, and a platform control plane. It targets ConCat feature parity plus Vietnam-market capabilities ConCat does not have (SePay VietQR/VND settlement, organizer ledger and manual payouts).

---

## Document map

| File | Role |
|---|---|
| `docs/plan/00-reference.md` | This file. Durable contracts: product/access model, money, stack, data-model pointers. |
| `docs/plan/01-current-state.md` | What is actually implemented and verified — baseline snapshot dated 2026-07-26. |
| `docs/plan/02-concat-parity.md` | Feature-parity matrix against ConCat with backlog IDs (`REG-P*`, `STO-P*`, `EVD-P*`, `RAF-P*`). The source backlog for phases 2–5. |
| `docs/plan/phase-1-stabilize.md` … `phase-6-launch.md` | The six build phases. |
| `docs/plan/phase-1b-identity.md` | Identity re-platform phase, between Phase 1 and Phase 2 |
| `docs/superpowers/specs/2026-10-13-identity-replatform-design.md` | Authoritative Phase 1B design |
| `docs/plan/verification.md` | Per-session and per-phase verification gates. |
| `docs/launch/runtime-defect-audit-2026-07-26.md` | The active defect register and batch plan consumed by Phase 1. Not duplicated here. |

**Reading rule per session:** `PROGRESS.md` first, then this file, then only the active phase file. Read `01-current-state.md` / `02-concat-parity.md` entries only when the phase file references them. Do not read other phase files except to check a cross-phase dependency.

## Truth hierarchy

1. The code and `packages/db/prisma/schema.prisma`.
2. `PROGRESS.md` and `git log`.
3. `01-current-state.md` (a dated snapshot; may lag the repo).
4. Phase files (intent, not reality).

Plan documents never override the repository. If a plan file contradicts the codebase, stop and flag it — do not guess or silently improvise.

---

## Decisions (standing)

| Question | Decision |
|----------|----------|
| **Tenant model** | Managed, invite-only B2B SaaS — only a `PLATFORM_ADMIN` provisions, activates, suspends, or retires an organization. Creating a user account never creates a tenant or grants organizer access. |
| **Multi-tenancy** | Shared platform, strict tenant isolation. Public portals on `{slug}.<root-domain>`; platform-activated custom domains as portal aliases. Organizer auth stays on the central domain. |
| **Surfaces** | `/platform/*` = operator control plane and `/dashboard/*` = membership-scoped organizer workspace, both on the central host for staff signed in through authentik. Each tenant portal host (`{slug}.<root-domain>` or an active custom domain) serves the public portal and that tenant's attendee account area (`/account/*`). Central `/account`, `/checkout`, and `/transfer` surfaces are removed; attendee account, checkout, and transfer pages live on the owning tenant portal. |
| **Checkout identity** | Authenticated checkout only, per tenant. Public submission/checkout requires a signed-in portal account of the organization that owns the event; records bind to that `PortalAccount`. No guest checkout. Checkout pages live on the tenant's canonical portal host. |
| **Identity** | Two audiences, two systems. Staff and operators (anyone using `/dashboard` or `/platform`) sign in only through the studio authentik (`account.reyuugames.com`, OIDC); vFurst stores no staff password and derives `PLATFORM_ADMIN` from an authentik group. Attendees, volunteers, and vendors use `PortalAccount`s unique per `(organization, email)`, independent across tenants, verified email-first. Until unit 1B.4 lands, staff still use the legacy credentials sign-in. |
| **UI theme** | Light-only "Operational Calm" (Geist, warm canvas, teal accent). A deliberate divergence from ConCat's dark-mode toggle; revisit only as an explicit decision. |
| **Refresh model** | Server-first: Server Actions + route revalidation; three-second polling only on checkout payment confirmation. No SSE promise. |
| **Mobile/event day** | Responsive web/PWA (check-in, cashier, express kiosk, scoped offline support). No native app. |
| **Email** | Dual provider: AWS SES (production) + SMTP (dev/self-hosted), configurable per org, delivered through the encrypted PostgreSQL outbox + BullMQ worker. |
| **Split runtime** | Removed in Phase 1B unit 1B.1 (2026-10-13). `apps/web` is the only serving runtime; staff identity moved to authentik and attendee identity to portal accounts. |
| **Raffle semantics** | Two distinct products. The implemented prize raffle (giveaway for existing registrants) stays. ConCat-style **registration lottery** (win the right to purchase at capacity-limited events) is a separate Phase 5 feature. |

## Product and access model

```text
vFurst platform
├── Platform administrators — provision/suspend orgs, assign initial owner,
│   activate domains, operate providers/fees/reconciliation/payouts
├── Organization tenant — OWNER / ADMIN / MEMBER memberships;
│   events, registrations, commerce, staff, vendors, event-day operations
└── Attendees — tenant-scoped portal accounts: registrations, orders, hotel bookings, volunteer/vendor applications, self-service account on that tenant's portal
```

### Non-negotiable authorization rules

- A `User` is a staff identity provisioned from authentik and grants nothing by itself. A `PortalAccount` is an attendee identity of one organization and can never hold membership, dashboard access, or platform roles.
- Only `PLATFORM_ADMIN` creates an `Organization`, picks its subdomain, assigns its initial owner, changes platform payment configuration, activates a custom domain, or changes tenant lifecycle.
- Org `OWNER`/`ADMIN` operate events only inside organizations where the membership exists; they can never create another organization. Additional organizer access flows through expiring single-use invitations; acceptance creates the `OrgMember`.
- Authorization derives from the stored resource. Server actions must not authorize a submitted `orgId` and then mutate an unrelated submitted resource ID.
- Cross-tenant reads/writes return controlled not-found/forbidden and stay covered by regression tests. Tenant-isolation throws are deliberate — see "Do not change" in the runtime audit.
- Platform suspension stops new tenant activity without blocking signed payment callbacks, reconciliation, refunds, or settlement of existing orders.

### Role matrix (minimum)

| Capability | Platform admin | Org owner | Org admin | Org member | Public user |
|---|---|---|---|---|---|
| Provision/suspend org, activate domain, global providers/fees | Yes | No | No | No | No |
| Org identity, payout destination, member invitations | Support/oversight | Yes | Limited | No | No |
| Create/configure events, run event operations | Explicit support flow only | Yes | Yes | Explicitly permitted routes only | No |
| Register, order, apply, view own records | Via a portal account | Via a portal account | Via a portal account | Via a portal account | Yes (portal account) |

## Revenue model

| Trigger | Fee |
|---------|-----|
| Per registered attendee | $1.00 (VND value configured centrally) |
| Per hotel room booked | $1.00 (VND value configured centrally) |
| Store / vendor transactions | 1% |

- USD card payments: **Stripe Connect destination charges** — PaymentIntent on the platform account, `transfer_data.destination` to the org's connected account, `application_fee_amount` collects the platform fee at checkout. vFurst owns the charge (refunds, disputes).
- VND: **SePay VietQR** — funds arrive centrally, matched by unique whole-đồng memo; organizer net proceeds credit an internal ledger for recorded manual payouts.
- **Fee collection is single-path per provider.** Reconciliation audits and reports; it never charges organizers a second time. Fee reporting is currency-bucketed — USD cents and VND đồng are never summed together.

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo (`apps/web`, `apps/worker`, `apps/docs`, `packages/db`, `packages/email`, `packages/auth`, `packages/contracts`, `packages/tenant-context`) |
| Web | Next.js 15 App Router, RSC-first, local shadcn/ui-style components, Operational Calm tokens in `globals.css` |
| Database | PostgreSQL + Prisma; one client singleton per process; bounded pools (see connection contract) |
| Auth | Staff: Auth.js v5 + authentik OIDC (PKCE + state; JWT bound to a DB `Session` capped at `VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, default 12 h; `authVersion` invalidation; single logout through the end-session endpoint; back-channel logout at `/api/oidc/backchannel-logout`; platform admins from the `VFURST_PLATFORM_ADMIN_GROUP` group; no staff passwords). Attendees: first-party portal sessions (hashed opaque host-only cookie token, organization-bound) over `PortalAccount`. Hashed single-use invitation/setup/reset/transfer tokens. |
| Payments | Stripe Connect + SePay VietQR; provider-neutral `Order`/`PaymentAttempt` with single-active-attempt lock |
| Storage | S3-compatible (`S3_ENDPOINT` → MinIO locally, AWS S3 in production); presigned uploads; tenant-prefixed keys |
| Jobs | BullMQ + Redis: pointer-only email queue + dead letters, badge render, webhooks, SePay reconciliation, checkout expiry |
| Rate limiting | Shared atomic Lua fixed-window counters in Redis; auth/API/payment fail closed, signed webhooks fail open with degraded-protection logging |
| Email | `packages/email` (SES + SMTP) behind the encrypted `EmailDelivery` outbox |
| Badges | `bwip-js` (barcode/QR), `@zxing/browser` (camera scan), `react-konva` designer, `pdf-lib` PDF, ZPL `^GFA` builder, WebUSB direct print (Chrome/Edge) |
| Observability | Sentry (client/server/edge) |
| Tests | Vitest, Playwright (dev + production mode), axe, visual baselines, k6 load |
| CI | GitHub Actions (type-check, lint, test, build; sets only `DATABASE_URL`) |

## Local development

Every phase builds and verifies against the local stack — no cloud accounts until deployment (after Phase 6).

| Service (`docker-compose.yml`) | Replaces | Notes |
|---|---|---|
| `postgres:16` | Managed Postgres | `DATABASE_URL` runtime; `DIRECT_DATABASE_URL` for schema/backfills |
| `redis:7` | Managed Redis | BullMQ + shared rate limits, identical code path to production |
| `minio` | AWS S3 | `S3_ENDPOINT=http://localhost:9000`; unset in production for real S3 |
| `mailpit` | SES | SMTP catcher, UI at `http://localhost:8025` |
| `mock-oidc` (`mock-oauth2-server`, pinned) | Studio authentik | Issuer `http://localhost:8090/vfurst`; its sign-in form takes any subject plus JSON claims (`groups` for platform admins). Used by plain dev and E2E |

Stripe uses test mode + CLI webhook forwarding; SePay uses its Sandbox with HMAC-signed webhooks. Cloud migration must be an env-var change, not a code branch — if a phase needs "local vs cloud" branching, flag it in `PROGRESS.md`.

**Environment files:** each runtime owns its env file; the repo-root `.env.local` is the editable source and `scripts/sync-app-env.mjs` derives the per-app files. The full ownership table, web port 3000 contract, and sync/check commands live in `AGENTS.md` — that section is authoritative.

## Database connection contract

`DATABASE_URL` may point at a PgBouncer-compatible pooler; `DIRECT_DATABASE_URL` must bypass transaction pooling for schema sync and backfills. Every web/worker process applies `VFURST_DB_CONNECTION_LIMIT` and `VFURST_DB_POOL_TIMEOUT_SECONDS`; readiness verifies `(web replicas + worker replicas) × limit ≤ VFURST_DB_CONNECTION_BUDGET`. Launch-sized local default: six web replicas + one worker × pool 4 = 28 connections against budget 80 (97 usable local slots). Anonymous public registration HTML uses 15-second ISR; its account gate uses private no-store `GET /api/portal/session`, and per-user confirmation state is also a private no-store lookup. Material registration/check-in/cache/pool/topology changes require a fresh 500/50 load proof.

## Data model

**`packages/db/prisma/schema.prisma` is the single source of truth** (48 models). Do not maintain a parallel entity table in docs. Grouped inventory for orientation:

- **Identity/tenancy:** User, Account, Session, VerificationToken, Authenticator, OrgMember, OrgInvitation, Organization (lifecycle + custom-domain fields), StripeConnect, PlatformRole/OrgRole enums.
- **Events/registration:** Event (immutable currency; `settings` JSON), RegistrationType, AddOnDefinition, Registration (payment `status` separate from `approvalStatus`), RegistrationAddOn, RegistrationTransferRequest, Badge, BadgeTemplate.
- **Commerce:** StoreProduct (images/options/surcharges JSON), Cart, CartItem, Order, OrderItem, Voucher, HotelBlock, HotelBooking.
- **Payments:** PaymentProviderConfig, PaymentAttempt (single-active-attempt lock), SePayWebhookEvent, SePayReconciliationCursor, PaymentException, OrganizerLedgerEntry, OrganizerPayout, PaymentRefund.
- **People/ops:** Department (volunteer `formSchema`), VolunteerApplication, StaffRole, StaffAssignment, VendorApplication, AttendeeNote, Raffle, RaffleEntry, RaffleDrawResult.
- **Delivery/control plane:** EmailDelivery, EmailDeliveryAttempt, ControlPlaneOutboxEvent, ControlPlaneEventReceipt, ApiKey, WebhookEndpoint.

Phase 1B adds `PortalAccount`, `PortalSession`, and `PortalAccountToken` and moves attendee ownership columns to them (spec §5).

Monetary values are integers in the currency's minor unit (USD cents, VND whole đồng); the owning Event/Order carries an immutable currency. Zod contracts are colocated with their owning actions/libraries.

### JSON field contracts

| Entity.Field | Schema |
|---|---|
| `RegistrationType.scheduledPricing` | `Array<{ startDate, endDate, price }>` — scheduled (early-bird) pricing windows |
| `Department.formSchema` | `Array<{ id, type: "text"\|"select"\|"checkbox"\|"textarea", label, required, options? }>` |
| `VolunteerApplication.formResponses` | `Record<string, string \| string[] \| boolean>` keyed by `formSchema[].id` |
| `VolunteerApplication.availability` | `Array<{ date, slots: string[] }>` |
| `StaffRole.shifts` | `Array<{ date, startTime, endTime, label }>` |
| `BadgeTemplate.layout` | `{ width, height, elements: [{ id, type: "text"\|"image"\|"barcode"\|"qr", x, y, w, h, field?, value?, assetKey? }] }` — image `assetKey` must live under the owning org's S3 prefix; the worker revalidates ownership/bytes/type/size/dimensions |
| `HotelBlock.roomTypes` | `Array<{ name, rate, totalRooms, bookedRooms }>` |
| `Raffle.prizes` / `.eligibility` | Prize list; validated eligibility (`CONFIRMED_REGISTRATION`, `CHECKED_IN`, `REGISTRATION_TIER`, `REGISTRATION_ADD_ON`, `PURCHASED` + `entriesPerUnit`) |
| `VendorApplication.assistants` | `Array<{ name, email }>` |
| `StoreProduct.surcharges` / `.options` / `.images` | Per-product JSON lists (Phase 3 upgrades these into shared libraries — see `02-concat-parity.md`) |
| `Event.settings` | `{ requireApproval, allowTransfers, maxRegistrationsPerUser, emailProviderId?, branding?, emailTemplates? }` — enforced by `apps/web/src/lib/registration-policy.ts`; email overrides validated per-message with variable allowlists |

## Email delivery contract

- Web mutations write an AES-256-GCM-encrypted `EmailDelivery` row first; Redis receives only the delivery ID, so a Redis outage cannot discard transactional mail. `EMAIL_DELIVERY_ENCRYPTION_KEY` (base64 32-byte) must be identical for web and worker.
- The worker resolves authority from the stored record, records numbered attempts, classifies transient/permanent failures, backs off, dead-letters to a named pointer queue, and recovers missed jobs on startup/minutely.
- Password-reset, invitation, and transfer messages carry single-use signed links: never manually replayable; payload purged on terminal failure. Successful deliveries purge encrypted content.
- Portal account setup, password-reset, and account-exists messages (Phase 1B) go through the tenant's provider, are never replayable, and purge their payload on terminal states.
- Organizer visibility: `/dashboard/events/[eventId]/settings/emails` (event-scoped, includes template overrides). Platform: `/platform/operations/email` (masked, replay with lineage).

## Project structure

```
apps/
  web/            # canonical Next.js app: (auth) (marketing) (convention)/[orgSlug]
                  # tenant account/ and (checkout)/[orgSlug]/checkout/[orderId]; dashboard/ platform/ docs/ api/
                  # src/actions (server actions), src/lib (auth/tenant/payments/policy),
                  # src/sw (offline check-in), middleware.ts (host routing)
  worker/         # BullMQ: email, badge render, webhooks, sepay reconcile, expiry
  docs/           # Docusaurus product/API docs
packages/
  db/             # Prisma schema + client + backfill/preparation scripts
  email/          # providers (SES/SMTP) + built-in templates + override renderer
  auth/, contracts/, tenant-context/   # auth helpers (hashing, tokens, invitations, rate limit), queue/control-plane/webhook contracts, host classification
scripts/          # env sync/check, e2e runner, load runner, readiness
tests/            # Playwright e2e, visual, accessibility, k6
```
