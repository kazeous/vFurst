# Product gap audit — 2026-07-16

## Purpose and verdict

This document is the implementation handoff for the product gaps found by reconciling the complete product plan (`docs/plan/00-reference.md`, phases 0–7, and the verification plan) with the current repository. It is an audit of behavior, not a file-existence checklist. Existing Phase 7 security/payment remediations recorded in `PROGRESS.md` remain valid and are not reopened here.

**Verdict: the organizer platform is broadly implemented, but the public-user product is incomplete.** The largest omission is a central authenticated attendee account and the ownership-bound workflows that make registrations, orders, bookings, and applications self-service. Several planned settings/features are present only as UI or schema fields and are not enforced end-to-end.

Do not treat this as permission to move organizer operations into the attendee area. The intended surface model is:

| Surface | Keep/build here | Do not put here |
|---|---|---|
| Public tenant portal (`/[orgSlug]/*` or active custom domain) | Discovery, registration, store, hotel booking, volunteer/vendor submission, public raffle information if enabled | Organizer approval, inventory setup, payments administration, draw controls |
| Central public account (`/account/*`) | Identity, the current user's records, self-service transfer acceptance, own raffle status | Any organization membership or organizer capability |
| Organizer dashboard (`/dashboard/*`) | Event setup, review/approval, check-in, badge print operations, raffle setup/entry operations/draw | A public user's cross-event history |
| Platform (`/platform/*`) | Tenant lifecycle, domain activation, provider/payment operations | Normal tenant operations |

The current public volunteer and vendor submission pages are therefore correctly located in the portal. Their organizer review pages are correctly located in the dashboard. What is missing is the authenticated account lifecycle around both sides of those submissions.

## Audit scope and evidence

- Read the complete maintained roadmap: `docs/plan/00-reference.md`, `phase-0-foundation.md` through `phase-7-launch.md`, and `verification-and-timeline.md`.
- Compared the Prisma schema, all app routes, API routes, server actions, worker jobs, email templates, and the current launch/security audits.
- This was a static repository audit. It does not replace the existing external launch evidence requirements (real beta conventions, live deployment, Sentry, SePay Sandbox, physical printer, and screen-reader checks).

## Required implementation backlog

### GAP-01 — Build the public account and bind public records to the authenticated owner

**Priority: P0. Dependency for every attendee self-service feature.**

**Implementation update (2026-07-16): public-account foundation implemented.** The app now has authenticated `/account` overview, profile, registration/detail, order/detail, hotel, and volunteer/vendor application views. Registration, store, hotel, volunteer, and vendor entry points require a central-domain account before mutation or checkout; server actions bind new records to `session.user.id`, reject a different submitted email, and owner-filter durable success/detail reads. Portal headers use a safe central login/register handoff instead of relying on a cookie on a customer-controlled custom domain. Historic email-created attendees claim their existing `User` record through the hashed, one-hour, single-use recovery flow documented under GAP-06. Incoming transfer decisions remain intentionally open under GAP-03 because the current transfer data model has no recipient-pending lifecycle to display safely.

The reference explicitly promises a central public account area for identity, orders, registrations, applications, and invitation acceptance. It also grants public users the right to view their own public records. There is no `/account` route tree in the repository; the only public identity pages are login, registration, and invitation acceptance.

Current public create actions accept a name/email and call a `findOrCreate...` helper instead of requiring `auth().user.id`:

- `apps/web/src/actions/registration-actions.ts`
- `apps/web/src/actions/hotel-actions.ts`
- `apps/web/src/actions/staff-actions.ts`
- `apps/web/src/actions/vendor-actions.ts`

The portal shell has no sign-in/account entry. Some success pages also look up an entity from an ID in the query string without checking the authenticated owner; the hotel and vendor pages are the clearest examples. Tenant scoping prevents a cross-organization lookup, but it is not a substitute for owner authorization.

#### Required contract

1. Add central, authenticated `/account` routes for:
   - profile/identity;
   - registrations and registration detail (including payment and badge/check-in state);
   - orders and order detail/receipt;
   - hotel bookings;
   - volunteer applications and assignment/status;
   - vendor applications, booth status, and booth-payment status;
   - incoming registration transfers.
2. Add a portal header entry for sign-in/account, with a safe central-domain `returnTo` path. Do not put public-account cookies or organizer authorization on a customer-controlled custom domain.
3. For every public record read or mutation, derive ownership from `session.user.id` and query `userId: session.user.id` in addition to the stored event/org relationship.
4. Replace `?success=<resource-id>` pages with an owner-bound lookup. A signed short-lived confirmation token is acceptable for an immediate post-checkout return; it must not become a durable substitute for account ownership.
5. Preserve the data model's existing `userId` relations. Do not add public users to `OrgMember`.
6. Add an explicit, secure migration/claim policy for historic email-created users before changing production behavior.

#### Product decision to make before implementation

The plan promises public accounts but does not explicitly choose between authenticated checkout and guest checkout with later account claim. **Recommended policy: require sign-in/create-account immediately before a public submission or paid checkout.** This provides one authoritative `userId`, a persistent cart, and predictable self-service access. If guest checkout is retained, implement a one-time, expiring, email-verified claim link and do not use an email string or UUID in a URL as proof of ownership.

#### Acceptance tests

- A public user can see only their own records across two organizations and cannot read another user's record in the same organization by changing a URL or request body.
- A user without an `OrgMember` can use `/account` but cannot use `/dashboard` or create an organization/event.
- Registration, store, hotel, volunteer, and vendor flows create records owned by the signed-in user.
- The portal, checkout return, and account navigation work on central paths, tenant subdomains, and activated custom domains.

### GAP-02 — Enforce event registration policy instead of only storing it

**Priority: P0. Implemented 2026-07-16.**

`requireApproval`, `allowTransfers`, and `maxRegistrationsPerUser` are configured in the event wizard/settings and stored in `Event.settings`.

**Implementation update (2026-07-16): enforced through one shared server-side policy boundary.** `apps/web/src/lib/registration-policy.ts` is used by public registration creation, provider-neutral payment fulfillment, tier upgrades, cashier walk-ins, and both transfer paths. `PENDING`, `CONFIRMED`, and `CHECKED_IN` registrations reserve a slot; `CANCELLED` and `TRANSFERRED` release it. User and tier capacity checks run in serializable transactions with retry-on-conflict, so concurrent submissions cannot exceed the configured account or tier cap. `requireApproval` is represented by the separate `Registration.approvalStatus` field: payment can move a registration to `CONFIRMED` while approval remains `PENDING`, and organizer approval changes only `approvalStatus`. `allowTransfers=false` rejects both request and completion actions at the server boundary. The public registration page uses the same active reservation statuses for sold-out counts.

Focused unit coverage passes 3/3 and browser regressions pass 3/3 for approval/payment separation, concurrent account caps, and disabled transfer rejection. Recipient-owned accept/decline is now implemented under GAP-03.

### GAP-03 — Complete the recipient-owned registration-transfer workflow

**Priority: P0. Already documented as incomplete in the current launch audit.**

The dashboard can send a message about a transfer, but there is no durable transfer request, recipient route, accept/decline state, recipient identity verification, expiry, or replay protection. The current action explicitly tells the recipient that staff must complete the transfer.

#### Required work

1. Add a durable, expiring, single-use transfer-request model or an equivalent auditable resource linked to the source registration and recipient identity.
2. Email a signed link to the intended recipient; acceptance must require an account matching the normalized recipient email.
3. Put the accept/decline UI under the public account area, not under the organizer dashboard.
4. On accepted transfer, move ownership transactionally, invalidate/regenerate the badge as needed, and retain transfer history.
5. Let organizers review the state, but do not make staff intervention the normal recipient path.

#### Implementation update (2026-07-16)

Implemented. `RegistrationTransferRequest` is now a durable, tenant-scoped, expiring state machine (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED`) with a single-use SHA-256 token digest, source registration, requester, and recipient identity. Dashboard request actions cancel prior pending requests for the same source and email a signed `/transfer/:requestId?token=...` handoff. The handoff preserves a safe return path through central login and lands in `/account/transfers/:requestId`, where only the normalized invited email can accept or decline. Acceptance uses the serializable registration-policy transaction, moves add-ons and ownership, retains `transferredFromId` history, and clears/rekeys badge artifacts before best-effort regeneration; replay, wrong-account, and expiry paths are rejected. Organizers have a reviewable request history and an explicitly labelled admin override for support exceptions.

The focused `tests/e2e/registration-transfer.spec.ts` suite passes 4/4 for accept-once, recipient identity enforcement, decline, and expiry. Existing registration-policy and resource-authorization transfer regressions pass 11/11 together.

### GAP-04 — Finish the raffle product contract and add the attendee-facing portion only after that contract is chosen

**Priority: P1. The dashboard is the correct place for raffle administration.**

The Phase 5 plan requires eligibility rules and AUTO/MANUAL/PURCHASED entry methods. Current `Raffle` has only name, prizes, and draw date; the create UI/action has no eligibility configuration; only AUTO and MANUAL are ever written. `PURCHASED` exists in the enum but has no implementation. Winner history is stored in `Event.settings`, not as a durable raffle/draw result.

#### Required product decisions

- What makes an attendee eligible: confirmed registration, specific tier/add-on, check-in, purchase, manual inclusion, or a combination?
- Does a raffle ticket grant one entry or multiple entries? The current unique `(raffleId, userId)` constraint allows only one entry per user and cannot represent a multi-ticket rule.
- Can a public user self-enter, or are entries only automatic/purchased/organizer-managed?
- What result history must be immutable/auditable, and can a winner receive more than one prize?

#### Required work after the decision

1. Persist validated eligibility rules and a durable draw/result history; do not overload generic event settings for this audit trail.
2. Implement PURCHASED entry from a paid order with an idempotent fulfillment hook. Include the order/item reference if entries are purchase-derived.
3. Enforce eligibility before automatic/manual/purchased entries and at draw time.
4. Add public portal/account views for the current user's eligibility, entry state, and winner notification/status if the chosen policy exposes them. Do not expose other entrants' personal data.
5. Keep raffle creation, exception handling, and drawing in `/dashboard`.

#### Implementation update (2026-07-16)

The contract is now chosen and implemented:

- Eligibility is persisted and validated as one of `CONFIRMED_REGISTRATION`, `CHECKED_IN`, `REGISTRATION_TIER`, `REGISTRATION_ADD_ON`, or `PURCHASED` (the latter names a stored event product and `entriesPerUnit`). The default is an approved confirmed registration.
- Public users cannot self-enter or administer a raffle. Organizers create/configure raffles and run auto/manual/draw operations in `/dashboard`; `/account/raffles` exposes only the signed-in user's own entry quantities and winning results.
- Each attendee has a configurable `maxEntriesPerUser` quota. Non-purchased entry methods are idempotent one-entry grants; paid product purchases add weighted quantities up to that quota. A paid purchase entry stores both `orderItemId` and a deterministic `purchaseKey`; fulfillment runs it inside the serializable order-paid transaction, so webhook replay does not duplicate entries.
- Draws are weighted by entry quantity, revalidate eligibility at draw time, and persist immutable `RaffleDrawResult` rows. A unique raffle/user winner constraint means one attendee cannot win multiple prizes in one raffle. Prize quantities create numbered award rows, and `notifiedAt` records whether the winner email was delivered; the durable result remains visible if delivery fails.

The focused `tests/e2e/raffle-contract.spec.ts` suite passes 2/2 for paid PURCHASED fulfillment plus webhook idempotency, attendee account visibility, durable draws, and winner status. Existing raffle/voucher tenant-authorization coverage passes 5/5.

### GAP-05 — Make custom email templates affect actual delivery

**Priority: P1. Current UI is a dead configuration surface.**

`/dashboard/events/[eventId]/settings/emails` saves HTML/text/subject data into `Event.settings.emailTemplates` and renders a preview. Email delivery still calls the fixed `renderEmailTemplate()` implementation in `packages/email/src/index.ts`; no delivery path reads those saved event templates.

#### Required work

1. Extend the organization/event email sending boundary to load the event template for the named event message, substitute only an allowlisted variable set, and use the saved subject/HTML/plain text.
2. Define a fallback to the built-in template if no event override exists.
3. Sanitize/escape variable values and test both HTML and plain-text rendering.
4. Add end-to-end tests for registration confirmation, payment receipt, volunteer decision, vendor decision, and transfer request.

#### Implementation update (2026-07-16)

Implemented. The shared email package now owns the five event-template keys, per-message variable allowlists, stored-template validation, HTML-value escaping, plain-text substitution, subject control-character removal, and HTTP(S)-only transfer URL rendering. Invalid legacy/manual JSON fails closed to the existing built-in template; events without an override continue using the built-in renderer. A built-in `payment-receipt` template and paid-order delivery path were added, with settlement idempotency ensuring it is sent only on the first transition to `PAID`.

Both direct web delivery and the BullMQ email worker now load `Event.settings.emailTemplates` through an `eventId + orgId` scoped query before rendering. Registration confirmations, payment receipts, volunteer approvals/rejections (including bulk decisions), vendor decisions (including bulk decisions), and transfer requests pass their stored event context; unrelated organization/platform messages remain built-in-only. The settings action rejects variables outside the allowlist, and the dashboard lists the complete token set and renders previews through the same production renderer.

`tests/e2e/custom-email-delivery.spec.ts` passes 3/3 through SMTP/Mailpit and proves all five required message families use saved subjects, HTML, and plain text with escaped untrusted values and a safe transfer URL. Package tests cover allowlists, invalid-setting fallback, subject sanitization, HTML/text behavior, and unsafe URL rejection; worker tests cover tenant-scoped override loading and foreign-event rejection.

### GAP-06 — Implement password-reset recovery or remove the unused promise

**Priority: P1. Required for a usable public account.**

**Implementation update (2026-07-17): implemented and delivery-verified.** `/forgot-password` returns a non-enumerating acknowledgement and applies the shared auth rate limit. Reset links carry a random secret while the database stores only its SHA-256 digest; tokens expire after one hour, are atomically consumed once, set the password on the existing `User`, mark the email verified, delete persisted sessions, and increment `authVersion` so JWT sessions issued before the reset resolve unauthenticated. Safe `returnTo` state is retained through recovery. The platform SMTP boundary now reads the documented `SMTP_PASSWORD` (with `SMTP_PASS` compatibility), and the password-reset template escapes URL values inside HTML attributes.

`tests/e2e/password-reset-delivery.spec.ts` passes 1/1 through the configured SMTP/Mailpit path: it requests a reset, inspects the delivered HTML/plain-text message, proves only the SHA-256 token digest is stored, completes the reset, logs in with the new password, and proves replay submission is rejected and the token is gone. Existing recovery/resource authorization coverage passes 8/8. Production SES/SMTP credentials and bounce monitoring remain external launch configuration/evidence, not missing application behavior.

### GAP-07 — Complete badge image rendering and physical output validation

**Priority: P1 for feature completion; external hardware proof remains a launch gate.**

Badge PDF/ZPL artifacts and print controls are now exposed, but `apps/worker/src/jobs/generate-badges.ts` renders every image element as an `IMAGE` placeholder rather than the selected asset. It therefore does not meet the badge-layout contract for actual image layers.

#### Required work

1. Define which image sources are valid (controlled S3/MinIO assets only is preferred) and fetch/validate them safely in the worker.
2. Embed/rasterize valid image assets in the PDF and generate a real ZPL-compatible image representation instead of placeholder text.
3. Add worker tests for image success, missing/invalid asset failure, and no cross-tenant asset use.
4. Run the physical Zebra/PDF fallback proof after implementation; do not mark a badge as printed before direct-print success or explicit PDF-print confirmation.

### GAP-08 — Resolve the real-time SSE architecture promise

**Priority: P2 decision.**

The reference lists Server-Sent Events as the real-time technology, but there is no SSE endpoint or EventSource client. No phase specifies a concrete live-update artifact, so this is a roadmap inconsistency rather than a request to add live updates blindly.

Choose one of the following and update the reference accordingly:

- implement a tenant/event-authorized SSE stream for the specific live dashboard/check-in counters that need it, including reconnect and authorization tests; or
- remove the SSE promise and explicitly state that refresh/polling is the current product behavior.

### GAP-09 — Make worker failure/dead-letter and delivery-status behavior observable

**Priority: P2 operations follow-up.**

Phase 1 specifies a dead-letter queue and delivery status for email template analytics. The worker retries jobs and retains failed jobs (`removeOnFail: false`) but does not create a distinct dead-letter workflow, persist delivery records, or expose operator visibility. Define whether retained BullMQ failures are sufficient; if not, implement a named dead-letter/retry/replay process and an auditable delivery status model/UI.

## Items that are not missing code features

These are still blocking launch requirements, but a coding agent cannot honestly close them by changing source code:

- two platform-provisioned beta conventions and collected attendee/organizer feedback;
- live deployment plus managed-sales marketing verification;
- production Sentry project/DSN evidence;
- real SePay Sandbox QR, callback, reconciliation, expiry, exception, payout, and refund evidence;
- physical NVDA/VoiceOver check;
- physical Zebra/PDF print proof after GAP-07.

Consult `PROGRESS.md`, `docs/launch/go-live-checklist.md`, `docs/launch/beta-program.md`, and `docs/launch/security-audit.md` before attempting a launch-status update.

## Implementation order

1. Record the guest-vs-authenticated public-flow decision; implement GAP-01's identity/ownership foundation.
2. Implement GAP-02 registration-policy enforcement and GAP-03 transfer lifecycle on that foundation.
3. Implement GAP-06 password recovery before inviting public users to rely on account history.
4. Complete GAP-04 raffle contract after its product decisions are approved.
5. Complete GAP-07 badge image rendering; GAP-05 custom-template delivery is implemented.
6. Resolve GAP-08/09 explicitly, then run the affected repository and E2E/authorization tests.
7. Run the external launch evidence separately; do not claim it from automated tests.

## Minimum regression matrix for this remediation

- Public user A, public user B, organizer A, organizer B, and platform admin across two organizations.
- Direct URL/API/action tampering for every `/account` record type and portal success return.
- Registration cap, approval-required registration, transfer-disabled event, concurrent registration, and concurrent checkout behavior.
- Recipient transfer accepted/declined/expired/replayed/wrong-account cases.
- Raffle auto/manual/purchased policy cases once approved, including no duplicate or ineligible entry.
- Saved email template delivery plus safe variable rendering.
- Password reset expiry/replay/non-enumeration.
- Badge image rendering and existing print/checkout/check-in cross-tenant regressions.

## Explicit non-goals for the remediation

- Do not create self-service organization provisioning or grant organizer membership to public accounts.
- Do not make organizer dashboard access depend on a public account route.
- Do not move organizer approval, raffle drawing, payment administration, check-in, or inventory configuration into the attendee area.
- Do not weaken the Phase 7 payment, tenant-isolation, lifecycle, or shared-rate-limit contracts while adding self-service features.
